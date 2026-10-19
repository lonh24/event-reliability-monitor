import { MonitorApiError, TransportError } from "../../services/apiErrors.ts";
import type { SemanticTone } from "../ui/StatusBadge.tsx";

export function utcTime(value: string | null): string {
  return value === null
    ? "Not available"
    : value.replace("T", " ").replace(/Z$/, " UTC");
}
export function statusTone(value: string): SemanticTone {
  if (
    [
      "PASS",
      "CONFIRMED",
      "SUCCEEDED",
      "TRUSTED",
      "COMPLETE",
      "FINAL",
      "RESOLVED",
    ].includes(value)
  )
    return "success";
  if (["VIOLATION", "FAILED", "CONFLICTED", "HIGH"].includes(value))
    return "danger";
  if (
    [
      "PENDING",
      "STARTED",
      "PARTIAL",
      "OPEN",
      "INVESTIGATING",
      "MEDIUM",
    ].includes(value)
  )
    return "warning";
  return "neutral";
}
export function isResourceNotFound(error: unknown): boolean {
  return (
    error instanceof MonitorApiError &&
    error.status === 404 &&
    error.code === "RESOURCE_NOT_FOUND"
  );
}
// Never echo arbitrary transport payloads or stack traces to the UI.
export function requestErrorMessage(error: unknown): string {
  if (error instanceof MonitorApiError)
    return `The API could not complete this request (${error.status} · ${error.code}). Try again.`;
  if (error instanceof TransportError && error.kind === "aborted")
    return "The request was interrupted. Try again.";
  if (error instanceof TransportError && error.kind === "protocol")
    return "The API response could not be read. Try again.";
  return "Unable to load data. Check the connection and try again.";
}
