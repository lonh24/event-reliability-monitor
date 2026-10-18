import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { isDto } from "../src/services/contractValidation.ts";
import schema from "../src/types/api.schema.json" with { type: "json" };

const contract = readFileSync(
  new URL("../../docs/06-api-contract.md", import.meta.url),
  "utf8",
);
const fullSchema = [...contract.matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((match) => JSON.parse(match[1]))
  .find((value) => value.$defs);
const program = ts.createProgram(
  [fileURLToPath(new URL("../src/types/api.ts", import.meta.url))],
  { strict: true, target: ts.ScriptTarget.ES2023, skipLibCheck: true },
);
const source = program.getSourceFile(
  fileURLToPath(new URL("../src/types/api.ts", import.meta.url)),
);
assert.ok(source);
const checker = program.getTypeChecker();
const moduleSymbol = checker.getSymbolAtLocation(source);
assert.ok(moduleSymbol);
const symbols = new Map(
  checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => [symbol.name, symbol]),
);
const definitions: Record<
  string,
  {
    type?: string;
    enum?: string[];
    properties?: Record<
      string,
      { anyOf?: { type?: string }[]; enum?: string[]; $ref?: string }
    >;
    required?: string[];
  }
> = fullSchema.$defs;
function nullAllowed(node: { anyOf?: { type?: string }[] }) {
  return node.anyOf?.some((item) => item.type === "null") ?? false;
}
function literalStrings(type: ts.Type): string[] {
  return (type.isUnion() ? type.types : [type])
    .filter((part): part is ts.StringLiteralType =>
      Boolean(part.flags & ts.TypeFlags.StringLiteral),
    )
    .map((part) => part.value)
    .sort();
}
function typeKinds(type: ts.Type): string[] {
  if (type.isUnion())
    return [...new Set(type.types.flatMap(typeKinds))]
      .filter((kind) => kind !== "undefined")
      .sort();
  if (type.flags & ts.TypeFlags.StringLike) return ["string"];
  if (type.flags & ts.TypeFlags.NumberLike) return ["number"];
  if (type.flags & ts.TypeFlags.BooleanLike) return ["boolean"];
  if (type.flags & ts.TypeFlags.Null) return ["null"];
  if (type.flags & ts.TypeFlags.Undefined) return ["undefined"];
  return [checker.isArrayType(type) ? "array" : "object"];
}
function schemaKinds(node: unknown): string[] {
  assert.ok(typeof node === "object" && node !== null);
  if ("$ref" in node && typeof node.$ref === "string")
    return schemaKinds(definitions[node.$ref.split("/").at(-1) ?? ""]);
  if ("const" in node) return [typeof node.const];
  for (const key of ["anyOf", "oneOf"]) {
    const alternatives: unknown = Reflect.get(node, key);
    if (Array.isArray(alternatives))
      return [
        ...new Set(
          alternatives.flatMap((branch: unknown) => schemaKinds(branch)),
        ),
      ].sort();
  }
  assert.ok("type" in node && typeof node.type === "string");
  return [node.type === "integer" ? "number" : node.type];
}

test("generated runtime schema equals normative contract except the two internal DTOs", () => {
  const expected = structuredClone(fullSchema);
  delete expected.$defs.InternalProcessingReportRequest;
  delete expected.$defs.InternalReportAckResponse;
  assert.deepEqual(schema, expected);
  assert.equal(Object.keys(schema.$defs).length, 48);
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0);
});

for (const [name, definition] of Object.entries(definitions)) {
  if (name.startsWith("Internal")) continue;
  test(`contract → TypeScript ${name}: fields, optional, nullable and status domains`, () => {
    const symbol = symbols.get(name);
    assert.ok(symbol, name);
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    if (definition.enum)
      assert.deepEqual(literalStrings(type), [...definition.enum].sort());
    if (!definition.properties) return;
    assert.deepEqual(
      checker
        .getPropertiesOfType(type)
        .map((property) => property.name)
        .sort(),
      Object.keys(definition.properties).sort(),
    );
    for (const [field, node] of Object.entries(definition.properties)) {
      const property = checker.getPropertyOfType(type, field);
      assert.ok(property, field);
      const fieldType = checker.getTypeOfSymbolAtLocation(property, source);
      const parts = fieldType.isUnion() ? fieldType.types : [fieldType];
      assert.deepEqual(
        typeKinds(fieldType),
        schemaKinds(node),
        `${name}.${field} data type`,
      );
      assert.equal(
        parts.some((part) => Boolean(part.flags & ts.TypeFlags.Null)),
        nullAllowed(node),
        `${name}.${field} nullability`,
      );
      assert.equal(
        Boolean(property.flags & ts.SymbolFlags.Optional),
        !definition.required?.includes(field),
        `${name}.${field} optionality`,
      );
      const domain =
        node.enum ??
        (node.$ref
          ? definitions[node.$ref.split("/").at(-1) ?? ""]?.enum
          : undefined);
      if (domain)
        assert.deepEqual(
          literalStrings(fieldType),
          [...domain].sort(),
          `${name}.${field} literal domain`,
        );
    }
  });
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(fullSchema);
const examples = [
  ...contract.matchAll(/<!-- schema: (\w+) -->\s*```json\n([\s\S]*?)\n```/g),
];
test("all 42 published request/response examples validate against their normative schema", () => {
  assert.equal(examples.length, 42);
  for (const match of examples) {
    const check = ajv.compile({ $ref: `${fullSchema.$id}#/$defs/${match[1]}` });
    assert.ok(
      check(JSON.parse(match[2])),
      `${match[1]}: ${JSON.stringify(check.errors)}`,
    );
  }
});
test("decimal strings preserve values beyond JavaScript safe integers and reject Int64 overflow", () => {
  assert.ok(
    isDto("UpdateIncidentStatusRequest", {
      status: "OPEN",
      expectedVersion: "9007199254740993",
    }),
  );
  assert.equal(
    isDto("UpdateIncidentStatusRequest", {
      status: "OPEN",
      expectedVersion: "9223372036854775808",
    }),
    false,
  );
  assert.equal(
    isDto("UpdateIncidentStatusRequest", {
      status: "OPEN",
      expectedVersion: 1,
    }),
    false,
  );
  assert.equal(
    isDto("UpdateIncidentStatusRequest", {
      status: "OPEN",
      expectedVersion: "01",
    }),
    false,
  );
  assert.equal(isDto("NonNegativeInt64String", "9223372036854775808"), false);
  assert.ok(isDto("PositiveInt64String", "9223372036854775807"));
});
