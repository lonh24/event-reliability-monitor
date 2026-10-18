import type {
  ApplicationsQuery,
  EventsQuery,
  IncidentsQuery,
  RulesQuery,
  OverviewQuery,
} from "./monitorApi.ts";
import { apiError } from "./apiErrors.ts";
import { isDto } from "./contractValidation.ts";

function invalid(field: string): never {
  throw apiError(
    400,
    "INVALID_QUERY",
    "Query does not satisfy the API contract.",
    {
      fieldErrors: [
        { field, code: "INVALID_QUERY", message: "Invalid query parameter." },
      ],
    },
  );
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return invalid("query");
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!keys.includes(key)) return invalid(key);
    if (raw === undefined) continue;
    result[key] = typeof raw === "string" ? raw.trim() : raw;
  }
  return result;
}
function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    return invalid(field);
  return value;
}
function choice<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
): T {
  if (value === undefined) return fallback;
  for (const item of allowed) if (value === item) return item;
  return invalid(field);
}
function selector(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isDto("Id", value)) return invalid(field);
  return value;
}
function page(query: Record<string, unknown>) {
  return {
    page: integer(query.page, 0, 0, 2147483647, "page"),
    size: integer(query.size, 10, 1, 100, "size"),
  };
}
export function applicationsQuery(value: ApplicationsQuery = {}) {
  const q = object(value, ["page", "size", "sort"]);
  return {
    ...page(q),
    sort: choice(
      q.sort,
      ["createdAt,asc", "createdAt,desc"],
      "createdAt,asc",
      "sort",
    ),
  };
}
export function eventsQuery(value: EventsQuery = {}) {
  const q = object(value, [
    "page",
    "size",
    "sort",
    "search",
    "applicationId",
    "status",
  ]);
  if (
    q.search !== undefined &&
    (typeof q.search !== "string" || [...q.search].length > 128)
  )
    return invalid("search");
  return {
    ...page(q),
    sort: choice(
      q.sort,
      ["occurredAt,asc", "occurredAt,desc"],
      "occurredAt,desc",
      "sort",
    ),
    search: typeof q.search === "string" ? q.search : "",
    applicationId: selector(q.applicationId, "applicationId"),
    status:
      q.status === "" || q.status === undefined
        ? undefined
        : choice(
            q.status,
            ["CONFIRMED", "FAILED", "PENDING", "UNKNOWN"],
            "UNKNOWN",
            "status",
          ),
  };
}
export function rulesQuery(value: RulesQuery = {}) {
  const q = object(value, ["page", "size", "sort", "applicationId"]);
  return {
    ...page(q),
    sort: choice(q.sort, ["name,asc", "name,desc"], "name,asc", "sort"),
    applicationId: selector(q.applicationId, "applicationId"),
  };
}
export function incidentsQuery(value: IncidentsQuery = {}) {
  const q = object(value, [
    "page",
    "size",
    "sort",
    "applicationId",
    "status",
    "severity",
  ]);
  return {
    ...page(q),
    sort: choice(
      q.sort,
      ["openedAt,asc", "openedAt,desc"],
      "openedAt,desc",
      "sort",
    ),
    applicationId: selector(q.applicationId, "applicationId"),
    status:
      q.status === "" || q.status === undefined
        ? undefined
        : choice(
            q.status,
            ["OPEN", "INVESTIGATING", "RESOLVED"],
            "OPEN",
            "status",
          ),
    severity:
      q.severity === "" || q.severity === undefined
        ? undefined
        : choice(q.severity, ["MEDIUM", "HIGH"], "HIGH", "severity"),
  };
}
export function overviewQuery(value: OverviewQuery = {}) {
  const q = object(value, [
    "range",
    "bucket",
    "applicationId",
    "latestIncidentsLimit",
  ]);
  const range = choice(q.range, ["1h", "24h", "7d"], "24h", "range");
  return {
    range,
    bucket: choice(
      q.bucket,
      ["hour", "day"],
      range === "7d" ? "day" : "hour",
      "bucket",
    ),
    applicationId: selector(q.applicationId, "applicationId"),
    latestIncidentsLimit: integer(
      q.latestIncidentsLimit,
      5,
      1,
      5,
      "latestIncidentsLimit",
    ),
  };
}
