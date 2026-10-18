import type {
  EventDetailResponse,
  EventSummaryResponse,
  IncidentDetailResponse,
  IncidentSummaryResponse,
} from "../types/api.ts";

// Compare Unicode code points explicitly, independent of the browser/OS locale.
export function compareText(left: string, right: string): number {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

export function compareTime(
  left: string | null,
  right: string | null,
  descending = false,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return (Date.parse(left) - Date.parse(right)) * (descending ? -1 : 1);
}

export function toEventSummary(
  event: EventDetailResponse,
): EventSummaryResponse {
  const {
    id,
    eventId,
    applicationId,
    applicationName,
    eventType,
    correlationId,
    occurredAt,
    observationStatus,
    processingStatus,
    processingStatusReason,
    reportedAttemptCount,
    hasReportConflict,
    evaluationState,
    ruleResults,
    relatedIncidentId,
  } = event;
  return {
    id,
    eventId,
    applicationId,
    applicationName,
    eventType,
    correlationId,
    occurredAt,
    observationStatus,
    processingStatus,
    processingStatusReason,
    reportedAttemptCount,
    hasReportConflict,
    evaluationState,
    ruleResults,
    relatedIncidentId,
  };
}

export function toIncidentSummary(
  incident: IncidentDetailResponse,
): IncidentSummaryResponse {
  const {
    id,
    applicationId,
    applicationName,
    observedEventId,
    eventId,
    primaryRule,
    severity,
    status,
    summary,
    openedAt,
    resolvedAt,
    version,
  } = incident;
  return {
    id,
    applicationId,
    applicationName,
    observedEventId,
    eventId,
    primaryRule,
    severity,
    status,
    summary,
    openedAt,
    resolvedAt,
    version,
  };
}

export function sortEventDetail(
  event: EventDetailResponse,
): EventDetailResponse {
  event.attempts.sort(
    (a, b) => compareTime(a.startedAt, b.startedAt) || compareText(a.id, b.id),
  );
  event.reports.sort(
    (a, b) =>
      compareTime(a.receivedAt, b.receivedAt) || compareText(a.id, b.id),
  );
  event.evaluations.sort(
    (a, b) =>
      (BigInt(a.inputGeneration) > BigInt(b.inputGeneration)
        ? -1
        : BigInt(a.inputGeneration) < BigInt(b.inputGeneration)
          ? 1
          : 0) ||
      compareText(a.ruleId, b.ruleId) ||
      compareText(a.id, b.id),
  );
  event.evidence.sort(
    (a, b) =>
      compareTime(a.collectedAt, b.collectedAt) || compareText(a.id, b.id),
  );
  return event;
}
