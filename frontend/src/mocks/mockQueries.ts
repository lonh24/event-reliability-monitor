import type { MockDataset } from "./fixtures.ts";
import { utc } from "./fixtures.ts";
import type {
  OverviewResponse,
  PageResponse,
  RuleEvaluationResponse,
} from "../types/api.ts";
import { overviewQuery } from "../services/queryValidation.ts";
import {
  compareText,
  compareTime,
  toIncidentSummary,
} from "../services/projections.ts";

export function paginate<T extends object>(
  items: T[],
  page: number,
  size: number,
): PageResponse<T> {
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    size,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

export function overview(
  state: MockDataset,
  clock: number,
  query: ReturnType<typeof overviewQuery>,
): OverviewResponse {
  const rangeMs = { "1h": 3600000, "24h": 86400000, "7d": 604800000 };
  const start = clock - rangeMs[query.range];
  const events = state.events.filter(
    (event) =>
      event.observationStatus === "OBSERVED" &&
      event.occurredAt !== null &&
      Date.parse(event.occurredAt) >= start &&
      Date.parse(event.occurredAt) < clock &&
      (!query.applicationId || event.applicationId === query.applicationId),
  );
  const eventIds = new Set(events.map((event) => event.id));
  const incidents = state.incidents.filter(
    (incident) =>
      eventIds.has(incident.observedEventId) &&
      Date.parse(incident.openedAt) <= clock,
  );
  let unknownEvaluations = 0;
  for (const event of events) {
    const latest = new Map<string, RuleEvaluationResponse>();
    for (const evaluation of event.evaluations) {
      if (Date.parse(evaluation.evaluatedAt) > clock) continue;
      const previous = latest.get(evaluation.ruleId);
      if (
        !previous ||
        BigInt(evaluation.inputGeneration) > BigInt(previous.inputGeneration) ||
        (evaluation.inputGeneration === previous.inputGeneration &&
          compareTime(evaluation.evaluatedAt, previous.evaluatedAt) > 0)
      )
        latest.set(evaluation.ruleId, evaluation);
    }
    unknownEvaluations += [...latest.values()].filter(
      (item) => item.outcome === "UNKNOWN",
    ).length;
  }
  const duration = query.bucket === "hour" ? 3600000 : 86400000;
  const volumeBuckets: OverviewResponse["volumeBuckets"] = [];
  for (
    let bucketStart = Math.floor(start / duration) * duration;
    bucketStart < clock;
    bucketStart += duration
  ) {
    const bucketEnd = bucketStart + duration;
    volumeBuckets.push({
      startAt: utc(bucketStart),
      endAt: utc(bucketEnd),
      partial: bucketStart < start || bucketEnd > clock,
      count: events.filter(
        (event) =>
          event.occurredAt !== null &&
          Date.parse(event.occurredAt) >= bucketStart &&
          Date.parse(event.occurredAt) < bucketEnd,
      ).length,
    });
  }
  return {
    range: query.range,
    bucket: query.bucket,
    applicationId: query.applicationId ?? null,
    asOf: utc(clock),
    windowStart: utc(start),
    windowEnd: utc(clock),
    stats: {
      observedEvents: events.length,
      confirmedProcessing: events.filter(
        (event) => event.processingStatus === "CONFIRMED",
      ).length,
      openIncidents: incidents.filter(
        (incident) =>
          incident.status === "OPEN" || incident.status === "INVESTIGATING",
      ).length,
      unknownEvaluations,
    },
    volumeBuckets,
    latestIncidents: [...incidents]
      .sort(
        (a, b) =>
          compareTime(a.openedAt, b.openedAt, true) || compareText(a.id, b.id),
      )
      .slice(0, query.latestIncidentsLimit)
      .map(toIncidentSummary),
  };
}
