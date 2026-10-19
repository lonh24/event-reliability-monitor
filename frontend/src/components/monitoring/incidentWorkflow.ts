import type {
  IncidentDetailResponse,
  IncidentStatus,
  UpdateIncidentStatusRequest,
} from "../../types/api.ts";
import { MonitorApiError, TransportError } from "../../services/apiErrors.ts";

export function nextIncidentStatus(
  status: IncidentStatus,
): IncidentStatus | null {
  if (status === "OPEN") return "INVESTIGATING";
  if (status === "INVESTIGATING") return "RESOLVED";
  return null;
}

export function incidentTransitionRequest(
  incident: Pick<IncidentDetailResponse, "status" | "version">,
  note: string,
): UpdateIncidentStatusRequest {
  const status = nextIncidentStatus(incident.status);
  if (status === null)
    throw new Error("Resolved incidents cannot be reopened in this workflow.");
  const trimmed = note.trim();
  if (Array.from(trimmed).length > 500)
    throw new Error("Investigation note must contain at most 500 characters.");
  return {
    status,
    expectedVersion: incident.version,
    ...(trimmed ? { note: trimmed } : {}),
  };
}

// Mutation errors require a read before a person chooses the next write.
// A transport failure may follow a committed PATCH; never auto-retry it.
export function incidentMutationFailure(error: unknown) {
  if (error instanceof MonitorApiError && error.code === "VERSION_CONFLICT") {
    return {
      kind: "version-conflict",
      title: "Incident changed elsewhere",
      message:
        "Your revision is stale. Reload detail to review the latest status and history before choosing another action. No update was confirmed for this request.",
    };
  }
  if (
    error instanceof MonitorApiError &&
    error.code === "INVALID_STATE_TRANSITION"
  ) {
    return {
      kind: "invalid-transition",
      title: "Transition not allowed",
      message:
        "The requested status transition was rejected. Reload detail to review the permitted next step.",
    };
  }
  if (error instanceof TransportError || !(error instanceof MonitorApiError)) {
    return {
      kind: "uncertain",
      title: "Update outcome is uncertain",
      message:
        "The response could not be confirmed. The change may have been saved. Reload detail before deciding what to do; this PATCH will not be retried automatically.",
    };
  }
  return {
    kind: "api",
    title: "Could not update incident",
    message: `The API did not confirm the update (${error.status} · ${error.code}). Reload detail before deciding whether to submit another change.`,
  };
}
