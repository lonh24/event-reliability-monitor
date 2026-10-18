import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../types/api.schema.json" with { type: "json" };
import type { DtoMap, FieldErrorResponse } from "../types/api.ts";
import { apiError, TransportError } from "./apiErrors.ts";

const validator = new Ajv2020({
  strict: false,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  ownProperties: true,
});
addFormats(validator);
validator.addSchema(schema);
const cache = new Map<keyof DtoMap, ValidateFunction<unknown>>();
const int64Fields = new Set([
  "expectedPoints",
  "delta",
  "totalDelta",
  "version",
  "expectedVersion",
  "configVersion",
  "ruleVersion",
  "inputGeneration",
  "evaluationGeneration",
  "evaluatedGeneration",
]);

function int64ValuesAreSafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(int64ValuesAreSafe);
  if (typeof value !== "object" || value === null) return true;
  return Object.entries(value).every(([key, child]) => {
    if (
      int64Fields.has(key) &&
      typeof child === "string" &&
      BigInt(child) > 9223372036854775807n
    )
      return false;
    return int64ValuesAreSafe(child);
  });
}

function getValidator(name: keyof DtoMap) {
  let check = cache.get(name);
  if (!check) {
    check = validator.compile({ $ref: `${schema.$id}#/$defs/${name}` });
    cache.set(name, check);
  }
  return check;
}

export function isDto<N extends keyof DtoMap>(
  name: N,
  value: unknown,
): value is DtoMap[N] {
  if (!getValidator(name)(value)) return false;
  if (
    (name === "NonNegativeInt64String" || name === "PositiveInt64String") &&
    typeof value === "string"
  )
    return BigInt(value) <= 9223372036854775807n;
  return int64ValuesAreSafe(value);
}

export function readDto<N extends keyof DtoMap>(
  name: N,
  value: unknown,
): DtoMap[N] {
  if (!isDto(name, value))
    throw new TransportError("protocol", `Response does not match ${name}.`);
  return value;
}

export function requestDto<N extends keyof DtoMap>(
  name: N,
  value: unknown,
): DtoMap[N] {
  let snapshot: unknown;
  try {
    snapshot = structuredClone(value);
  } catch {
    throw apiError(400, "VALIDATION_ERROR", `Invalid ${name}.`);
  }
  if (isDto(name, snapshot)) return snapshot;
  const fieldErrors: FieldErrorResponse[] = (getValidator(name).errors ?? [])
    .slice(0, 20)
    .map((error) => ({
      field: (error.instancePath.replaceAll("/", ".").slice(1) || "body").slice(
        0,
        200,
      ),
      code: error.keyword.toUpperCase(),
      message: "Field does not satisfy the API contract.",
    }));
  throw apiError(400, "VALIDATION_ERROR", `Invalid ${name}.`, { fieldErrors });
}

export function trimRequest(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      (key === "name" || key === "description") && typeof child === "string"
        ? child.trim()
        : child,
    ]),
  );
}

export function pathId(value: unknown): string {
  if (!isDto("Id", value))
    throw apiError(400, "VALIDATION_ERROR", "Invalid resource ID.");
  return value;
}
