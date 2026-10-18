import type { DtoMap, ApiErrorResponse } from "../types/api.ts";
import type { MonitorApi, RequestOptions } from "./monitorApi.ts";
import {
  pathId,
  readDto,
  requestDto,
  trimRequest,
} from "./contractValidation.ts";
import {
  applicationsQuery,
  eventsQuery,
  incidentsQuery,
  overviewQuery,
  rulesQuery,
} from "./queryValidation.ts";
import { MonitorApiError, TransportError } from "./apiErrors.ts";

export interface HttpOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}
const errorStatuses: Record<ApiErrorResponse["code"], number> = {
  MALFORMED_JSON: 400,
  INVALID_QUERY: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  REPORT_PAYLOAD_CONFLICT: 409,
  IDENTITY_CONFLICT: 409,
  METHOD_NOT_ALLOWED: 405,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};
function receivedDto<N extends keyof DtoMap>(
  name: N,
  value: unknown,
  status: number,
): DtoMap[N] {
  try {
    return readDto(name, value);
  } catch {
    throw new TransportError(
      "protocol",
      `The API response does not match ${name}.`,
      status,
    );
  }
}
function baseUrl(value: string): string {
  const result = value.trim().replace(/\/+$/, "");
  if (
    !result ||
    result.includes("?") ||
    result.includes("#") ||
    result.includes("\\") ||
    /\s/.test(result)
  )
    throw new Error(
      "API base URL must be a non-empty path or HTTP(S) URL without a query or fragment.",
    );
  if (result.startsWith("/") && !result.startsWith("//")) return result;
  const url = new URL(result);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "API base URL must use HTTP(S) and contain no credentials.",
    );
  return result;
}

export function createHttpMonitorApi(options: HttpOptions = {}): MonitorApi {
  const base = baseUrl(options.baseUrl ?? "/api/v1");
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  async function send<N extends keyof DtoMap>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    dto: N,
    success: number,
    query: Record<string, string | number | undefined> = {},
    body?: unknown,
    request?: RequestOptions,
  ): Promise<DtoMap[N]> {
    if (request?.signal?.aborted)
      throw new TransportError("aborted", "Request was aborted.");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== "") params.set(key, String(value));
    const url = `${base}${path}${params.size ? `?${params}` : ""}`;
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: request?.signal,
      });
    } catch {
      throw new TransportError(
        request?.signal?.aborted ? "aborted" : "network",
        request?.signal?.aborted
          ? "Request was aborted."
          : "The API could not be reached. A submitted mutation may require reconciliation before retrying.",
      );
    }
    let payload: unknown;
    try {
      if (
        response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        throw new Error("Unexpected media type.");
      payload = await response.json();
    } catch {
      if (request?.signal?.aborted)
        throw new TransportError(
          "aborted",
          "Request was aborted.",
          response.status,
        );
      throw new TransportError(
        "protocol",
        "The API returned an invalid JSON response.",
        response.status,
      );
    }
    if (!response.ok) {
      const error = receivedDto("ApiErrorResponse", payload, response.status);
      if (
        errorStatuses[error.code] !== response.status ||
        (error.code === "VERSION_CONFLICT" && error.currentVersion === null)
      )
        throw new TransportError(
          "protocol",
          "API error status or version does not match its error code.",
          response.status,
        );
      throw new MonitorApiError(response.status, error);
    }
    if (response.status !== success)
      throw new TransportError(
        "protocol",
        "Unexpected HTTP success status.",
        response.status,
      );
    return receivedDto(dto, payload, response.status);
  }
  return {
    async getOverview(query, request) {
      return send(
        "GET",
        "/overview",
        "OverviewResponse",
        200,
        overviewQuery(query),
        undefined,
        request,
      );
    },
    async listApplications(query, request) {
      return send(
        "GET",
        "/applications",
        "ApplicationPageResponse",
        200,
        applicationsQuery(query),
        undefined,
        request,
      );
    },
    async createApplication(body, request) {
      return send(
        "POST",
        "/applications",
        "ApplicationResponse",
        201,
        {},
        requestDto("CreateApplicationRequest", trimRequest(body)),
        request,
      );
    },
    async listEvents(query, request) {
      return send(
        "GET",
        "/events",
        "EventPageResponse",
        200,
        eventsQuery(query),
        undefined,
        request,
      );
    },
    async getEventDetail(id, request) {
      return send(
        "GET",
        `/events/${encodeURIComponent(pathId(id))}`,
        "EventDetailResponse",
        200,
        {},
        undefined,
        request,
      );
    },
    async listRules(query, request) {
      return send(
        "GET",
        "/rules",
        "RulePageResponse",
        200,
        rulesQuery(query),
        undefined,
        request,
      );
    },
    async createRule(body, request) {
      return send(
        "POST",
        "/rules",
        "MonitoringRuleResponse",
        201,
        {},
        requestDto("CreateRuleRequest", trimRequest(body)),
        request,
      );
    },
    async updateRule(id, body, request) {
      return send(
        "PATCH",
        `/rules/${encodeURIComponent(pathId(id))}`,
        "MonitoringRuleResponse",
        200,
        {},
        requestDto("UpdateRuleRequest", body),
        request,
      );
    },
    async listIncidents(query, request) {
      return send(
        "GET",
        "/incidents",
        "IncidentPageResponse",
        200,
        incidentsQuery(query),
        undefined,
        request,
      );
    },
    async getIncidentDetail(id, request) {
      return send(
        "GET",
        `/incidents/${encodeURIComponent(pathId(id))}`,
        "IncidentDetailResponse",
        200,
        {},
        undefined,
        request,
      );
    },
    async updateIncidentStatus(id, body, request) {
      return send(
        "PATCH",
        `/incidents/${encodeURIComponent(pathId(id))}/status`,
        "IncidentDetailResponse",
        200,
        {},
        requestDto("UpdateIncidentStatusRequest", body),
        request,
      );
    },
  };
}
