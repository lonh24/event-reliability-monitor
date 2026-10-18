import { readFile, writeFile } from "node:fs/promises";

const contract = await readFile(
  new URL("../../docs/06-api-contract.md", import.meta.url),
  "utf8",
);
const schemas = [...contract.matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((match) => JSON.parse(match[1]))
  .filter((value) => value.$defs);
if (schemas.length !== 1)
  throw new Error("Expected one normative DTO schema in API Contract §7");
const schema = schemas[0];
// Internal report ingestion is service-to-service and is not part of the browser API.
delete schema.$defs.InternalProcessingReportRequest;
delete schema.$defs.InternalReportAckResponse;
const definitions = schema.$defs;
const literal = (value) => JSON.stringify(value);

function typeOf(node) {
  if (node.$ref) return node.$ref.split("/").at(-1);
  if (Object.hasOwn(node, "const")) return literal(node.const);
  if (node.enum) return node.enum.map(literal).join(" | ");
  if (node.anyOf || node.oneOf)
    return (node.anyOf ?? node.oneOf).map(typeOf).join(" | ");
  if (node.type === "array") return `Array<${typeOf(node.items)}>`;
  if (node.type === "integer" || node.type === "number") return "number";
  if (node.type === "object") {
    if (!node.properties) return "Record<string, unknown>";
    return (
      "{\n" +
      Object.entries(node.properties)
        .map(([key, value]) => {
          const optional = node.required?.includes(key) ? "" : "?";
          return `  ${key}${optional}: ${typeOf(value)};`;
        })
        .join("\n") +
      "\n}"
    );
  }
  if (["string", "boolean", "null"].includes(node.type)) return node.type;
  throw new Error(`Unsupported schema shape: ${JSON.stringify(node)}`);
}

const pageItems = {
  ApplicationPageResponse: "ApplicationResponse",
  EventPageResponse: "EventSummaryResponse",
  RulePageResponse: "MonitoringRuleResponse",
  IncidentPageResponse: "IncidentSummaryResponse",
};
const lines = [
  "// Derived from docs/06-api-contract.md §7. Regenerate with npm run contract:sync.",
  "// Runtime constraints (patterns, ranges and conditional rules) are checked at the adapter boundary.",
  "",
];
for (const [name, definition] of Object.entries(definitions)) {
  if (name === "PageResponse") {
    lines.push(
      "export interface PageResponse<T extends object = Record<string, unknown>> { items: T[]; page: number; size: number; totalItems: number; totalPages: number; }",
    );
  } else if (pageItems[name]) {
    lines.push(`export type ${name} = PageResponse<${pageItems[name]}>;`);
  } else if (
    [
      "CreateRuleRequest",
      "MonitoringRuleResponse",
      "RuleEvaluationResponse",
    ].includes(name)
  ) {
    const configKey =
      name === "RuleEvaluationResponse" ? "configSnapshot" : "config";
    const common = structuredClone(definition);
    delete common.properties.ruleType;
    delete common.properties[configKey];
    const branches = [
      ["TIMEOUT", "TimeoutRuleConfig"],
      ["DUPLICATE_BUSINESS_EFFECT", "DuplicateRuleConfig"],
      ["DATA_INVARIANT", "InvariantRuleConfig"],
    ];
    lines.push(
      `export type ${name} = ${typeOf(common)} & (\n${branches.map(([type, config]) => `  { ruleType: ${literal(type)}; ${configKey}: ${config} }`).join(" |\n")}\n);`,
    );
  } else {
    lines.push(`export type ${name} = ${typeOf(definition)};`);
  }
  lines.push("");
}
lines.push(
  "export interface DtoMap {\n" +
    Object.keys(definitions)
      .map((name) => `  ${name}: ${name};`)
      .join("\n") +
    "\n}",
);
const outputs = new Map([
  [new URL("../src/types/api.ts", import.meta.url), lines.join("\n") + "\n"],
  [
    new URL("../src/types/api.schema.json", import.meta.url),
    JSON.stringify(schema, null, 2) + "\n",
  ],
]);
for (const [path, content] of outputs) {
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== content)
      throw new Error(
        `Contract drift: ${path.pathname}. Run npm run contract:sync.`,
      );
  } else await writeFile(path, content);
}
console.log(
  `${process.argv.includes("--check") ? "Checked" : "Generated"} ${Object.keys(definitions).length} dashboard schema/type definitions.`,
);
