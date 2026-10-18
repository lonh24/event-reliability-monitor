import type {
  ApplicationResponse,
  EventDetailResponse,
  ProcessingReportResponse,
  ProcessingAttemptResponse,
  EvidenceResponse,
  RuleEvaluationResponse,
  MonitoringRuleResponse,
  IncidentDetailResponse,
  IncidentHistoryResponse,
  RuleOutcome,
} from "../types/api.ts";
import {
  compareText,
  compareTime,
  sortEventDetail,
  toEventSummary,
} from "../services/projections.ts";

export const FIXTURE_METADATA = Object.freeze({
  version: "erm-mock-v1",
  seed: 20261017,
  snapshot: "2026-10-17T10:10:00Z",
});
export interface MockDataset {
  applications: ApplicationResponse[];
  rules: MonitoringRuleResponse[];
  events: EventDetailResponse[];
  incidents: IncidentDetailResponse[];
}
type Profile =
  | "NORMAL"
  | "REDELIVERY"
  | "DUPLICATE"
  | "REPORT_LOST_GAP"
  | "REPORT_LOST_VERIFIED"
  | "SLOW"
  | "STARTED_ONLY"
  | "FAILED_ONLY"
  | "TERMINAL_CONFLICT";
const profiles: readonly Profile[] = [
  "NORMAL",
  "REDELIVERY",
  "DUPLICATE",
  "REPORT_LOST_GAP",
  "REPORT_LOST_VERIFIED",
  "DUPLICATE",
  "SLOW",
  "STARTED_ONLY",
  "FAILED_ONLY",
  "TERMINAL_CONFLICT",
  "REPORT_LOST_VERIFIED",
  "REPORT_LOST_GAP",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "DUPLICATE",
  "SLOW",
  "STARTED_ONLY",
  "FAILED_ONLY",
  "TERMINAL_CONFLICT",
  "REPORT_LOST_VERIFIED",
  "REPORT_LOST_GAP",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "NORMAL",
  "NORMAL",
];
const suffix = (value: number) => String(value).padStart(3, "0");
export function utc(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(".000Z", "Z");
}
const addSeconds = (timestamp: string, seconds: number) =>
  utc(Date.parse(timestamp) + seconds * 1000);

function makeRules(
  applications: ApplicationResponse[],
): MonitoringRuleResponse[] {
  return applications.flatMap((app, index) => {
    const common = {
      applicationId: app.id,
      enabled: true,
      configVersion: "1",
      updatedAt: app.createdAt,
      relatedEventIds: [],
      relatedIncidentIds: [],
    };
    return [
      {
        ...common,
        id: `rule-${suffix(index * 3 + 1)}`,
        ruleType: "TIMEOUT",
        name: "Processing within 60 seconds",
        description:
          "A trusted successful completion must be within 60 seconds of the event.",
        config: {
          thresholdSeconds: 60,
          completionBasis: "FIRST_TRUSTED_SUCCESS",
        },
      },
      {
        ...common,
        id: `rule-${suffix(index * 3 + 2)}`,
        ruleType: "DUPLICATE_BUSINESS_EFFECT",
        name: "No duplicate business effects",
        description:
          "Check distinct effects within the event-bound evidence source.",
        config: { maxEffects: 1, sourcePolicy: "EVENT_BOUND_SOURCE" },
      },
      {
        ...common,
        id: `rule-${suffix(index * 3 + 3)}`,
        ruleType: "DATA_INVARIANT",
        name: "Loyalty total matches order expectation",
        description:
          "Compare the complete ledger total with the independent order expectation.",
        config: {
          expectedSource: "ORDER_EXPECTATION",
          comparison: "TOTAL_DELTA_EQUALS_EXPECTED",
        },
      },
    ] satisfies MonitoringRuleResponse[];
  });
}

interface IncidentSeed {
  n: number;
  rule: string;
  status: IncidentDetailResponse["status"];
  openedAt: string;
  transitions: string[];
}
const incidentSeeds: readonly IncidentSeed[] = [
  {
    n: 3,
    rule: "rule-002",
    status: "OPEN",
    openedAt: "2026-10-17T10:10:00Z",
    transitions: [],
  },
  {
    n: 6,
    rule: "rule-002",
    status: "INVESTIGATING",
    openedAt: "2026-10-17T09:00:05Z",
    transitions: ["2026-10-17T09:05:00Z"],
  },
  {
    n: 7,
    rule: "rule-001",
    status: "OPEN",
    openedAt: "2026-10-17T09:02:35Z",
    transitions: [],
  },
  {
    n: 16,
    rule: "rule-005",
    status: "RESOLVED",
    openedAt: "2026-10-16T18:00:05Z",
    transitions: ["2026-10-16T18:01:00Z", "2026-10-16T18:02:00Z"],
  },
  {
    n: 17,
    rule: "rule-004",
    status: "RESOLVED",
    openedAt: "2026-10-16T18:02:35Z",
    transitions: ["2026-10-16T18:03:00Z", "2026-10-16T18:04:00Z"],
  },
];

function makeEvent(
  n: number,
  profile: Profile,
  app: ApplicationResponse,
  rules: MonitoringRuleResponse[],
): EventDetailResponse {
  const num = suffix(n),
    id = `evt-${num}`,
    eventId = `order-paid-${1000 + n}`;
  const customerRef = app.id === "app-001" ? "cust-demo-001" : "cust-demo-002";
  const occurredAt =
    n <= 5
      ? addSeconds("2026-10-17T10:00:00Z", (n - 1) * 60)
      : n <= 15
        ? addSeconds("2026-10-17T09:00:00Z", (n - 6) * 60)
        : addSeconds("2026-10-16T18:00:00Z", (n - 16) * 60);
  const isFault = profile === "DUPLICATE",
    conflict = profile === "TERMINAL_CONFLICT";
  const reportLost =
    profile === "REPORT_LOST_GAP" || profile === "REPORT_LOST_VERIFIED";
  const insufficient =
    profile === "REPORT_LOST_GAP" ||
    profile === "STARTED_ONLY" ||
    profile === "FAILED_ONLY";
  const evidenceSourceKey = isFault ? "loyalty-fault-v1" : "loyalty-normal-v1";
  const scope = {
    eventId,
    customerRef,
    runId: isFault ? (n === 3 ? "run-ds03" : `run-${num}`) : null,
  };
  const incidentIndex = incidentSeeds.findIndex((incident) => incident.n === n);
  const incidentSeed = incidentSeeds[incidentIndex];
  const assessedAt = incidentSeed?.openedAt ?? FIXTURE_METADATA.snapshot;
  const reports: ProcessingReportResponse[] = [],
    attempts: ProcessingAttemptResponse[] = [],
    evidence: EvidenceResponse[] = [];

  if (!reportLost) {
    const reportCount = profile === "REDELIVERY" || conflict ? 2 : 1;
    for (let k = 1; k <= reportCount; k++) {
      const attemptK = conflict ? 1 : k;
      const startedAt = addSeconds(
        occurredAt,
        profile === "REDELIVERY" && k === 2 ? 10 : 1,
      );
      const finishedAt =
        profile === "STARTED_ONLY"
          ? null
          : addSeconds(
              occurredAt,
              profile === "SLOW"
                ? 90
                : profile === "REDELIVERY" && k === 2
                  ? 11
                  : 2,
            );
      const reportedStatus =
        profile === "STARTED_ONLY"
          ? "STARTED"
          : profile === "FAILED_ONLY" ||
              (profile === "REDELIVERY" && k === 1) ||
              (conflict && k === 2)
            ? "FAILED"
            : "SUCCEEDED";
      const reportedAt =
        conflict && k === 2
          ? addSeconds(occurredAt, 3)
          : (finishedAt ?? startedAt);
      reports.push({
        id: `rpt-${num}-${k}`,
        attemptId: `att-${num}-${attemptK}`,
        producerReportId: `producer-rpt-${num}-${k}`,
        reportedStatus,
        startedAt,
        finishedAt,
        reportedAt,
        receivedAt: addSeconds(reportedAt, 1),
        errorCode:
          reportedStatus !== "FAILED"
            ? null
            : profile === "REDELIVERY"
              ? "POST_COMMIT_FAILURE"
              : conflict
                ? "CONTRADICTORY_TERMINAL_REPORT"
                : "DB_TRANSACTION_FAILED",
      });
    }
    for (const attemptId of new Set(
      reports.map((report) => report.attemptId),
    )) {
      const batch = reports.filter((report) => report.attemptId === attemptId);
      const last = batch.at(-1);
      if (!last) throw new Error("Fixture attempt must have a report.");
      attempts.push({
        id: attemptId,
        producerAttemptId: `producer-${attemptId}`,
        attemptNo: attempts.length + 1,
        status: conflict
          ? "CONFLICTED"
          : last.reportedStatus === "STARTED"
            ? "PENDING"
            : last.reportedStatus,
        startedAt: last.startedAt,
        finishedAt: conflict ? null : last.finishedAt,
        reportIds: batch.map((report) => report.id),
        hasTerminalConflict: conflict,
      });
    }
    const last = reports.at(-1);
    if (!last) throw new Error("Fixture report batch is missing.");
    evidence.push({
      id: n === 2 ? "ev-002-reports" : `ev-${num}-report`,
      observedEventId: id,
      kind: "REPORT_BATCH",
      sourceKey: "processing-report",
      sourceLabel: "Authenticated processing reports",
      scope: { ...scope, runId: null },
      coverage: "COMPLETE",
      trust: "TRUSTED",
      finality: "UNKNOWN",
      snapshotAt: last.reportedAt,
      collectedAt: last.receivedAt,
      supersedesEvidenceId: n === 10 ? "ev-010-reports-g1" : null,
      ledger: null,
      reportIds: reports.map((report) => report.id),
      gaps: [],
    });
  }
  if (insufficient) {
    evidence.push({
      id: `ev-${num}-missing`,
      observedEventId: id,
      kind: "GAP",
      sourceKey: evidenceSourceKey,
      sourceLabel: "Independent ledger evidence unavailable",
      scope,
      coverage: "NONE",
      trust: "UNTRUSTED",
      finality: "UNKNOWN",
      snapshotAt: null,
      collectedAt: assessedAt,
      supersedesEvidenceId: null,
      ledger: null,
      reportIds: [],
      gaps: [
        {
          code:
            profile === "REPORT_LOST_GAP"
              ? "EVIDENCE_UNAVAILABLE"
              : "NOT_FINAL",
          message:
            profile === "REPORT_LOST_GAP"
              ? "No processing report or trustworthy independent ledger snapshot is available."
              : "No final, complete independent ledger snapshot is available.",
          missingFields: ["successfulFinishedAt", "ledgerSnapshot"],
        },
      ],
    });
  } else {
    evidence.push({
      id: `ev-${num}-ledger`,
      observedEventId: id,
      kind: "LEDGER_SNAPSHOT",
      sourceKey: evidenceSourceKey,
      sourceLabel: isFault
        ? "Sandbox injected faulty ledger"
        : "Independent normal loyalty ledger",
      scope,
      coverage: "COMPLETE",
      trust: "TRUSTED",
      finality: "FINAL",
      snapshotAt: assessedAt,
      collectedAt: assessedAt,
      supersedesEvidenceId: n === 10 ? "ev-010-ledger-g1" : null,
      ledger: {
        expectedPoints: "100",
        effectCount: isFault ? 2 : 1,
        totalDelta: isFault ? "200" : "100",
        effects: Array.from({ length: isFault ? 2 : 1 }, (_, index) => ({
          id: `eff-${num}-${index + 1}`,
          eventId,
          customerRef,
          delta: "100",
          createdAt: addSeconds(occurredAt, profile === "SLOW" ? 90 : 2),
        })),
      },
      reportIds: [],
      gaps: [],
    });
  }
  if (conflict)
    evidence.push({
      id: `ev-${num}-conflict`,
      observedEventId: id,
      kind: "CORRELATION_CONFLICT",
      sourceKey: "processing-report",
      sourceLabel: "Conflicting terminal reports for one attempt",
      scope: { ...scope, runId: null },
      coverage: "PARTIAL",
      trust: "CONFLICTED",
      finality: "UNKNOWN",
      snapshotAt: addSeconds(occurredAt, 3),
      collectedAt: addSeconds(occurredAt, 4),
      supersedesEvidenceId: null,
      ledger: null,
      reportIds: reports.map((report) => report.id),
      gaps: [
        {
          code: "CONFLICTING_TERMINAL_REPORTS",
          message:
            "The same attempt has both SUCCEEDED and FAILED terminal reports; neither hides the other.",
          missingFields: ["reconciledSuccessfulFinishedAt"],
        },
      ],
    });

  const evaluations: RuleEvaluationResponse[] = rules
    .filter((rule) => rule.applicationId === app.id)
    .map((rule) => {
      let outcome: RuleOutcome = "PASS",
        reasonCode: string,
        reason: string,
        evidenceIds: string[];
      if (rule.ruleType === "TIMEOUT") {
        outcome =
          conflict || reportLost || insufficient
            ? "UNKNOWN"
            : profile === "SLOW"
              ? "VIOLATION"
              : "PASS";
        reasonCode = conflict
          ? "CONFLICTING_TERMINAL_REPORTS"
          : n === 4
            ? "TIMEOUT_CANDIDATE"
            : outcome === "UNKNOWN"
              ? "SUCCESSFUL_COMPLETION_MISSING"
              : outcome === "VIOLATION"
                ? "COMPLETED_AFTER_THRESHOLD"
                : "COMPLETED_WITHIN_THRESHOLD";
        reason = conflict
          ? "Conflicting terminal claims in one attempt prevent a trusted completion time."
          : n === 4
            ? "420 seconds elapsed at this evaluation snapshot (threshold 60 seconds), but successfulFinishedAt is missing. This is a timeout candidate, not a proven violation."
            : outcome === "UNKNOWN"
              ? "A trusted successful finishedAt is missing. A ledger snapshot time is not an attempt completion time."
              : outcome === "VIOLATION"
                ? "Trusted successful completion was 90 seconds after occurredAt, beyond the 60-second threshold."
                : `Trusted successful completion was ${profile === "REDELIVERY" ? "11" : "2"} seconds after occurredAt, within 60 seconds.`;
        evidenceIds = conflict
          ? [`ev-${num}-conflict`, `ev-${num}-report`]
          : reports.length
            ? [n === 2 ? "ev-002-reports" : `ev-${num}-report`]
            : [`ev-${num}-${insufficient ? "missing" : "ledger"}`];
      } else {
        outcome = insufficient ? "UNKNOWN" : isFault ? "VIOLATION" : "PASS";
        reasonCode = insufficient
          ? profile === "REPORT_LOST_GAP"
            ? "EVIDENCE_UNAVAILABLE"
            : "SOURCE_NOT_FINAL"
          : rule.ruleType === "DUPLICATE_BUSINESS_EFFECT"
            ? isFault
              ? "DUPLICATE_EFFECTS_PROVEN"
              : "NO_DUPLICATE_IN_FINAL_SCOPE"
            : isFault
              ? "TOTAL_DELTA_MISMATCH"
              : "EXPECTED_TOTAL_MATCHES";
        reason = insufficient
          ? "Independent business evidence is insufficient; an exact effect count and total cannot be concluded."
          : rule.ruleType === "DUPLICATE_BUSINESS_EFFECT"
            ? isFault
              ? "Two distinct effect identities belong to the same logical event in the sealed sandbox source."
              : "A complete, trusted, final event-bound snapshot contains exactly one business effect."
            : isFault
              ? "The complete ledger total is +200 points, but the independent order expectation is +100."
              : "The complete ledger total +100 matches the independent order expectation +100.";
        evidenceIds = [`ev-${num}-${insufficient ? "missing" : "ledger"}`];
      }
      const common = {
        id: `eval-${num}-${rule.id.slice(-3)}-g${n === 10 ? 2 : 1}`,
        observedEventId: id,
        ruleId: rule.id,
        ruleVersion: "1",
        inputGeneration: n === 10 ? "2" : "1",
        outcome,
        reasonCode,
        reason,
        evaluatedAt: assessedAt,
        evidenceIds,
        isLatest: true,
      };
      return { ...common, ...configSnapshot(rule) };
    });
  if (n === 10) {
    const batch = evidence.find((item) => item.kind === "REPORT_BATCH"),
      ledger = evidence.find((item) => item.kind === "LEDGER_SNAPSHOT");
    if (!batch || !ledger) throw new Error("Missing conflict history fixture.");
    const priorAt = addSeconds(occurredAt, 3);
    evidence.push(
      {
        ...structuredClone(batch),
        id: "ev-010-reports-g1",
        reportIds: ["rpt-010-1"],
        snapshotAt: addSeconds(occurredAt, 2),
        collectedAt: priorAt,
        supersedesEvidenceId: null,
      },
      {
        ...structuredClone(ledger),
        id: "ev-010-ledger-g1",
        snapshotAt: priorAt,
        collectedAt: priorAt,
        supersedesEvidenceId: null,
      },
    );
    for (const current of [...evaluations])
      evaluations.push({
        ...structuredClone(current),
        id: `eval-010-${current.ruleId.slice(-3)}-g1`,
        inputGeneration: "1",
        outcome: "PASS",
        reasonCode:
          current.ruleType === "TIMEOUT"
            ? "COMPLETED_WITHIN_THRESHOLD"
            : current.reasonCode,
        reason:
          "Prior snapshot, before the contradictory report arrived, supported PASS for this rule.",
        evaluatedAt: priorAt,
        evidenceIds: [
          current.ruleType === "TIMEOUT"
            ? "ev-010-reports-g1"
            : "ev-010-ledger-g1",
        ],
        isLatest: false,
      });
  }
  const processingStatus =
    conflict || reportLost
      ? "UNKNOWN"
      : profile === "STARTED_ONLY"
        ? "PENDING"
        : profile === "FAILED_ONLY"
          ? "FAILED"
          : "CONFIRMED";
  return sortEventDetail({
    id,
    eventId,
    applicationId: app.id,
    applicationName: app.name,
    eventType: "ORDER_PAID",
    correlationId: `ord-${1000 + n}`,
    occurredAt,
    observationStatus: "OBSERVED",
    processingStatus,
    processingStatusReason: conflict
      ? "Terminal reports for the same attempt conflict; processing remains unknown."
      : reportLost
        ? "No processing reports were observed; the actual attempt timeline is unknown."
        : processingStatus === "PENDING"
          ? "Only a STARTED report is present; no terminal outcome has been reported."
          : processingStatus === "FAILED"
            ? "A FAILED report is present without a trusted successful attempt; business evidence must be checked separately."
            : "A trusted attempt reported successful completion; this does not prove business correctness.",
    reportedAttemptCount: attempts.length,
    hasReportConflict: conflict,
    evaluationState: "CURRENT",
    ruleResults: evaluations
      .filter((item) => item.isLatest)
      .map((item) => ({
        evaluationId: item.id,
        ruleId: item.ruleId,
        ruleType: item.ruleType,
        outcome: item.outcome,
        reasonCode: item.reasonCode,
        evaluatedAt: item.evaluatedAt,
      })),
    relatedIncidentId:
      incidentIndex < 0 ? null : `inc-${suffix(incidentIndex + 1)}`,
    customerRef,
    expectedPoints: "100",
    evidenceSourceKey,
    firstSeenAt: addSeconds(occurredAt, 1),
    evaluationGeneration: n === 10 ? "2" : "1",
    evaluatedGeneration: n === 10 ? "2" : "1",
    attempts,
    reports,
    evaluations,
    evidence,
  });
}

function configSnapshot(rule: MonitoringRuleResponse) {
  switch (rule.ruleType) {
    case "TIMEOUT":
      return {
        ruleType: rule.ruleType,
        configSnapshot: structuredClone(rule.config),
      };
    case "DUPLICATE_BUSINESS_EFFECT":
      return {
        ruleType: rule.ruleType,
        configSnapshot: structuredClone(rule.config),
      };
    case "DATA_INVARIANT":
      return {
        ruleType: rule.ruleType,
        configSnapshot: structuredClone(rule.config),
      };
  }
}

// Every call creates fresh visible records. There is no mutable shared seed or hidden ground truth.
export function createFixtures(): MockDataset {
  const applications: ApplicationResponse[] = [
    {
      id: "app-001",
      name: "Loyalty Sandbox",
      environment: "SANDBOX",
      status: "ACTIVE",
      createdAt: "2026-10-15T00:00:00Z",
    },
    {
      id: "app-002",
      name: "Loyalty Sandbox B",
      environment: "SANDBOX",
      status: "ACTIVE",
      createdAt: "2026-10-15T00:01:00Z",
    },
  ];
  const rules = makeRules(applications);
  const events = profiles.map((profile, index) =>
    makeEvent(index + 1, profile, applications[index < 15 ? 0 : 1], rules),
  );
  const incidents: IncidentDetailResponse[] = incidentSeeds.map(
    (seed, index) => {
      const event = events.find((item) => item.id === `evt-${suffix(seed.n)}`),
        rule = rules.find((item) => item.id === seed.rule);
      if (!event || !rule) throw new Error("Orphaned fixture incident.");
      const linkedEvaluations = event.evaluations
        .filter((item) => item.outcome === "VIOLATION")
        .sort(
          (a, b) =>
            compareTime(a.evaluatedAt, b.evaluatedAt) ||
            compareText(a.ruleId, b.ruleId) ||
            compareText(a.id, b.id),
        );
      const ids = new Set(
        linkedEvaluations.flatMap((item) => item.evidenceIds),
      );
      const history: IncidentHistoryResponse[] = [
        {
          id: `hist-${suffix(index + 1)}-1`,
          action: "CREATED",
          fromStatus: null,
          toStatus: "OPEN",
          actorRef: "system",
          note: "Case opened from linked violation evaluations.",
          createdAt: seed.openedAt,
        },
      ];
      seed.transitions.forEach((time, k) =>
        history.push({
          id: `hist-${suffix(index + 1)}-${k + 2}`,
          action: "STATUS_CHANGED",
          fromStatus: k === 0 ? "OPEN" : "INVESTIGATING",
          toStatus: k === 0 ? "INVESTIGATING" : "RESOLVED",
          actorRef: "local-developer",
          note: "Investigation status updated; business evidence remains unchanged.",
          createdAt: time,
        }),
      );
      return {
        id: `inc-${suffix(index + 1)}`,
        applicationId: event.applicationId,
        applicationName: event.applicationName,
        observedEventId: event.id,
        eventId: event.eventId,
        primaryRule: { id: rule.id, ruleType: rule.ruleType, name: rule.name },
        severity: rule.ruleType === "TIMEOUT" ? "MEDIUM" : "HIGH",
        status: seed.status,
        summary:
          rule.ruleType === "TIMEOUT"
            ? "Processing exceeded the configured timeout"
            : "Duplicate business effects in the injected sandbox ledger",
        openedAt: seed.openedAt,
        resolvedAt:
          seed.status === "RESOLVED" ? (seed.transitions.at(-1) ?? null) : null,
        version: String(seed.transitions.length),
        explanation:
          rule.ruleType === "TIMEOUT"
            ? "Trusted completion took 90 seconds, beyond the 60-second threshold."
            : "Two stored effect identities total +200 against expected +100. RESOLVED is only the case lifecycle; the ledger remains incorrect.",
        updatedAt: seed.transitions.at(-1) ?? seed.openedAt,
        linkedEvent: toEventSummary(event),
        linkedEvaluations: structuredClone(linkedEvaluations),
        evidence: structuredClone(
          event.evidence.filter((item) => ids.has(item.id)),
        ),
        history,
      };
    },
  );
  for (const rule of rules) {
    rule.relatedEventIds = events
      .filter((event) =>
        event.evaluations.some((item) => item.ruleId === rule.id),
      )
      .sort(
        (a, b) =>
          compareTime(a.occurredAt, b.occurredAt, true) ||
          compareText(a.id, b.id),
      )
      .slice(0, 3)
      .map((event) => event.id);
    rule.relatedIncidentIds = incidents
      .filter((incident) =>
        incident.linkedEvaluations.some((item) => item.ruleId === rule.id),
      )
      .sort(
        (a, b) =>
          compareTime(a.openedAt, b.openedAt, true) || compareText(a.id, b.id),
      )
      .slice(0, 3)
      .map((incident) => incident.id);
  }
  return { applications, rules, events, incidents };
}
