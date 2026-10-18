import type { ApiErrorResponse } from "../types/api.ts";

export class MonitorApiError extends Error {
  readonly kind = "api";
  readonly status: number;
  readonly response: ApiErrorResponse;
  constructor(status: number, response: ApiErrorResponse) {
    super(response.message);
    this.name = "MonitorApiError";
    this.status = status;
    this.response = response;
  }
  get code() {
    return this.response.code;
  }
}

// These client failures are not business UNKNOWN and do not invent a server error DTO.
export class TransportError extends Error {
  readonly kind: "network" | "protocol" | "aborted";
  readonly status: number | null;
  constructor(
    kind: TransportError["kind"],
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "TransportError";
    this.kind = kind;
    this.status = status;
  }
}

export function apiError(
  status: number,
  code: ApiErrorResponse["code"],
  message: string,
  extra: Partial<
    Pick<ApiErrorResponse, "currentVersion" | "fieldErrors" | "requestId">
  > = {},
) {
  return new MonitorApiError(status, {
    code,
    message,
    requestId: "client-validation",
    fieldErrors: [],
    currentVersion: null,
    ...extra,
  });
}
