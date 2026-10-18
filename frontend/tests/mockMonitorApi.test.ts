import test from "node:test";
import assert from "node:assert/strict";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
import { createFixtures, FIXTURE_METADATA } from "../src/mocks/fixtures.ts";
import { MonitorApiError, TransportError } from "../src/services/apiErrors.ts";
import { compareText } from "../src/services/projections.ts";
import { rejectsApi } from "./testHelpers.ts";
import type { MonitorApi } from "../src/services/monitorApi.ts";
import type { CreateRuleRequest, IncidentStatus } from "../src/types/api.ts";

const fresh = () => createMockMonitorApi({ latencyMs: 0 });
test("request DTOs validate an owned snapshot before mutation or serialization", async () => {
  const { api } = fresh();
  await rejectsApi(
    invalidCall(
      api,
      "updateRule",
      "rule-001",
      Object.create({ enabled: true }),
    ),
    400,
    "VALIDATION_ERROR",
  );
  await rejectsApi(
    invalidCall(api, "updateRule", "rule-001", { enabled: () => false }),
    400,
    "VALIDATION_ERROR",
  );
  assert.equal(
    (await api.listRules()).items.find((rule) => rule.id === "rule-001")
      ?.enabled,
    true,
  );
  let reads = 0;
  const body = Object.defineProperty({}, "enabled", {
    enumerable: true,
    get() {
      return ++reads === 1 ? false : "false";
    },
  });
  await invalidCall(api, "updateRule", "rule-001", body);
  assert.equal(reads, 1);
  assert.equal(
    (await api.listRules()).items.find((rule) => rule.id === "rule-001")
      ?.enabled,
    false,
  );
});
async function invalidCall(
  api: MonitorApi,
  method: keyof MonitorApi,
  ...args: unknown[]
): Promise<unknown> {
  return Reflect.apply(api[method], api, args);
}
const ruleBodies: CreateRuleRequest[] = [
  {
    applicationId: "app-001",
    name: "New timeout",
    ruleType: "TIMEOUT",
    config: { thresholdSeconds: 90, completionBasis: "FIRST_TRUSTED_SUCCESS" },
  },
  {
    applicationId: "app-001",
    name: "New duplicate check",
    ruleType: "DUPLICATE_BUSINESS_EFFECT",
    config: { maxEffects: 1, sourcePolicy: "EVENT_BOUND_SOURCE" },
  },
  {
    applicationId: "app-001",
    name: "New invariant",
    ruleType: "DATA_INVARIANT",
    config: {
      expectedSource: "ORDER_EXPECTATION",
      comparison: "TOTAL_DELTA_EQUALS_EXPECTED",
    },
  },
];

test("MonitorApi exposes exactly eleven async methods", async () => {
  const { api } = fresh();
  assert.deepEqual(
    Object.keys(api).sort(),
    [
      "getOverview",
      "listApplications",
      "createApplication",
      "listEvents",
      "getEventDetail",
      "listRules",
      "createRule",
      "updateRule",
      "listIncidents",
      "getIncidentDetail",
      "updateIncidentStatus",
    ].sort(),
  );
  const promise = api.listApplications();
  assert.ok(promise instanceof Promise);
  await promise;
});
test("full overview computes 30/18/3/26, correct UTC buckets and latest incident order", async () => {
  const { api } = fresh(),
    overview = await api.getOverview();
  assert.deepEqual(overview.stats, {
    observedEvents: 30,
    confirmedProcessing: 18,
    openIncidents: 3,
    unknownEvaluations: 26,
  });
  assert.equal(overview.asOf, FIXTURE_METADATA.snapshot);
  assert.equal(overview.windowStart, "2026-10-16T10:10:00Z");
  assert.equal(overview.volumeBuckets.length, 25);
  assert.ok(overview.volumeBuckets[0].partial);
  assert.ok(overview.volumeBuckets.at(-1)?.partial);
  assert.equal(
    overview.volumeBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
    30,
  );
  assert.deepEqual(
    overview.volumeBuckets
      .filter((bucket) => bucket.count)
      .map((bucket) => [bucket.startAt, bucket.count]),
    [
      ["2026-10-16T18:00:00Z", 15],
      ["2026-10-17T09:00:00Z", 10],
      ["2026-10-17T10:00:00Z", 5],
    ],
  );
  assert.deepEqual(
    overview.latestIncidents.map((item) => item.id),
    ["inc-001", "inc-003", "inc-002", "inc-005", "inc-004"],
  );
});
test("core one-hour subset stays 5/3/1/4 and fifteen outcomes 9/2/4", async () => {
  const { api } = fresh();
  assert.deepEqual((await api.getOverview({ range: "1h" })).stats, {
    observedEvents: 5,
    confirmedProcessing: 3,
    openIncidents: 1,
    unknownEvaluations: 4,
  });
  const rows = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => api.getEventDetail(`evt-00${n}`)),
  );
  const evaluations = rows.flatMap((event) => event.evaluations);
  assert.equal(evaluations.length, 15);
  assert.deepEqual(
    ["PASS", "VIOLATION", "UNKNOWN"].map(
      (outcome) =>
        evaluations.filter((item) => item.outcome === outcome).length,
    ),
    [9, 2, 4],
  );
});
test("overview app scope, day/hour bucket overrides, default 7d bucket and limit are independent", async () => {
  const { api } = fresh();
  assert.deepEqual(
    (await api.getOverview({ applicationId: "app-001" })).stats,
    {
      observedEvents: 15,
      confirmedProcessing: 8,
      openIncidents: 3,
      unknownEvaluations: 15,
    },
  );
  assert.deepEqual(
    (await api.getOverview({ applicationId: "app-002" })).stats,
    {
      observedEvents: 15,
      confirmedProcessing: 10,
      openIncidents: 0,
      unknownEvaluations: 11,
    },
  );
  assert.deepEqual(
    (await api.getOverview({ bucket: "day" })).volumeBuckets.map(
      (bucket) => bucket.count,
    ),
    [15, 15],
  );
  const week = await api.getOverview({ range: "7d" });
  assert.equal(week.bucket, "day");
  assert.equal(week.volumeBuckets.length, 8);
  assert.equal(
    (await api.getOverview({ range: "7d", bucket: "hour" })).volumeBuckets
      .length,
    169,
  );
  const one = await api.getOverview({ latestIncidentsLimit: 1 });
  assert.equal(one.latestIncidents.length, 1);
  assert.equal(one.stats.observedEvents, 30);
});
test("overview excludes REPORTED_ONLY, respects half-open window and chooses latest persisted at cutoff", async () => {
  const dataset = createFixtures();
  const original = structuredClone(dataset.events[0]);
  dataset.events[0] = {
    ...original,
    id: "reported-placeholder",
    eventId: "reported-only",
    observationStatus: "REPORTED_ONLY",
    occurredAt: null,
    correlationId: null,
    eventType: null,
    customerRef: null,
    expectedPoints: null,
    evidenceSourceKey: null,
    reports: [],
    attempts: [],
    evaluations: [],
    evidence: [],
    ruleResults: [],
    reportedAttemptCount: 0,
  };
  const { api } = createMockMonitorApi({ latencyMs: 0, dataset });
  assert.equal((await api.getOverview()).stats.observedEvents, 29);
  assert.equal((await api.listEvents()).totalItems, 30);
  const boundary = createFixtures();
  boundary.events[0].occurredAt = "2026-10-16T10:10:00Z";
  boundary.events[1].occurredAt = FIXTURE_METADATA.snapshot;
  assert.equal(
    (
      await createMockMonitorApi({
        latencyMs: 0,
        dataset: boundary,
      }).api.getOverview()
    ).stats.observedEvents,
    29,
  );
  const history = createFixtures(),
    event = history.events[9];
  for (const evaluation of event.evaluations.filter((item) => item.isLatest))
    evaluation.evaluatedAt = "2026-10-17T10:11:00Z";
  assert.equal(
    (
      await createMockMonitorApi({
        latencyMs: 0,
        dataset: history,
      }).api.getOverview()
    ).stats.unknownEvaluations,
    25,
  );
});
test("applications paging, creation trim, duplicate names and no implicit events or rules", async () => {
  const { api } = fresh();
  assert.deepEqual(
    (await api.listApplications({ size: 1, page: 1 })).items.map(
      (item) => item.id,
    ),
    ["app-002"],
  );
  assert.equal(
    (await api.listApplications({ sort: "createdAt,desc" })).items[0].id,
    "app-002",
  );
  const app = await api.createApplication({
    name: "  Loyalty Sandbox  ",
    environment: "DEVELOPMENT",
  });
  assert.equal(app.name, "Loyalty Sandbox");
  assert.equal(app.id, "app-new-001");
  assert.equal(app.createdAt, "2026-10-17T10:10:00.001Z");
  assert.equal(app.status, "ACTIVE");
  assert.equal((await api.listApplications()).totalItems, 3);
  assert.equal((await api.listEvents({ applicationId: app.id })).totalItems, 0);
  assert.equal((await api.listRules({ applicationId: app.id })).totalItems, 0);
  assert.equal((await api.getOverview()).stats.observedEvents, 30);
});
test("events literal case-insensitive search, trim and AND application/status filters", async () => {
  const { api } = fresh();
  assert.deepEqual(
    (
      await api.listEvents({
        search: " ORDER-PAID-1003 ",
        applicationId: "app-001",
        status: "CONFIRMED",
      })
    ).items.map((event) => event.id),
    ["evt-003"],
  );
  assert.equal(
    (await api.listEvents({ search: "1003", applicationId: "app-002" }))
      .totalItems,
    0,
  );
  assert.equal((await api.listEvents({ search: "evt-003" })).totalItems, 0);
  assert.equal((await api.listEvents({ search: "%" })).totalItems, 0);
  assert.equal((await api.listEvents({ status: "UNKNOWN" })).totalItems, 8);
  assert.equal(
    (await api.listEvents({ applicationId: "app-001", status: "UNKNOWN" }))
      .totalItems,
    5,
  );
  assert.equal((await api.listEvents({ status: "FAILED" })).totalItems, 2);
  assert.equal(
    (await api.listEvents({ search: " ", applicationId: " ", status: "" }))
      .totalItems,
    30,
  );
});
test("events default stable order, page totals, out-of-range page and filter-before-page", async () => {
  const { api } = fresh();
  const page = await api.listEvents();
  assert.deepEqual(
    page.items.map((event) => event.id),
    [
      "evt-005",
      "evt-004",
      "evt-003",
      "evt-002",
      "evt-001",
      "evt-015",
      "evt-014",
      "evt-013",
      "evt-012",
      "evt-011",
    ],
  );
  assert.equal(page.page, 0);
  assert.equal(page.size, 10);
  assert.equal(page.totalItems, 30);
  assert.equal(page.totalPages, 3);
  assert.equal((await api.listEvents({ page: 2, size: 10 })).items.length, 10);
  const beyond = await api.listEvents({ page: 99 });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.page, 99);
  assert.equal(beyond.totalItems, 30);
  const filtered = await api.listEvents({
    status: "UNKNOWN",
    size: 2,
    page: 2,
  });
  assert.equal(filtered.items.length, 2);
  assert.equal(filtered.totalItems, 8);
  assert.equal(filtered.totalPages, 4);
  const empty = await api.listEvents({ applicationId: "app-missing" });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalPages, 0);
});
test("ties always use ID ASC in either direction; null timestamps always last", async () => {
  const dataset = createFixtures();
  for (const event of dataset.events) event.occurredAt = "2026-10-17T10:00:00Z";
  dataset.events[0].observationStatus = "REPORTED_ONLY";
  dataset.events[0].occurredAt = null;
  const { api } = createMockMonitorApi({ latencyMs: 0, dataset });
  for (const sort of ["occurredAt,asc", "occurredAt,desc"] as const) {
    const rows = (await api.listEvents({ sort, size: 100 })).items;
    assert.equal(rows.at(-1)?.id, "evt-001");
    assert.equal(rows[0].id, "evt-002");
    assert.equal(rows[1].id, "evt-003");
  }
  assert.ok(
    compareText("\ue000", "😀") < 0,
    "Unicode code points, not UTF-16 order",
  );
});
test("DS01 one effect and normal processing; DS02 two attempts, one effect, no duplicate incident", async () => {
  const { api } = fresh();
  const normal = await api.getEventDetail("evt-001");
  assert.equal(normal.processingStatus, "CONFIRMED");
  assert.equal(
    normal.evidence.find((item) => item.ledger)?.ledger?.effectCount,
    1,
  );
  const retry = await api.getEventDetail("evt-002");
  assert.equal(retry.attempts.length, 2);
  assert.deepEqual(
    retry.reports.map((report) => report.reportedStatus),
    ["FAILED", "SUCCEEDED"],
  );
  assert.equal(
    retry.evidence.find((item) => item.ledger)?.ledger?.totalDelta,
    "100",
  );
  assert.ok(
    retry.evaluations.every((evaluation) => evaluation.outcome === "PASS"),
  );
  assert.equal(retry.relatedIncidentId, null);
  assert.equal(retry.hasReportConflict, false);
});
test("DS03 proves two injected effects; evt-003/inc-001 links and linked violation evaluations", async () => {
  const { api } = fresh(),
    event = await api.getEventDetail("evt-003"),
    incident = await api.getIncidentDetail("inc-001");
  assert.equal(event.relatedIncidentId, incident.id);
  assert.equal(incident.observedEventId, event.id);
  assert.equal(incident.primaryRule.id, "rule-002");
  assert.equal(event.processingStatus, "CONFIRMED");
  assert.deepEqual(
    event.evaluations.map((item) => item.outcome),
    ["PASS", "VIOLATION", "VIOLATION"],
  );
  const proof = event.evidence.find((item) => item.id === "ev-003-ledger");
  assert.ok(proof);
  assert.equal(proof.scope.runId, "run-ds03");
  assert.equal(proof.sourceLabel, "Sandbox injected faulty ledger");
  assert.deepEqual(
    proof.ledger?.effects.map((item) => item.id),
    ["eff-003-1", "eff-003-2"],
  );
  assert.equal(proof.ledger?.totalDelta, "200");
  assert.equal(incident.linkedEvaluations.length, 2);
});
test("DS04 no invented attempts/effects, three UNKNOWNs, candidate at 420 seconds and no incident", async () => {
  const { api } = fresh(),
    event = await api.getEventDetail("evt-004");
  assert.deepEqual(event.attempts, []);
  assert.deepEqual(event.reports, []);
  assert.equal(event.processingStatus, "UNKNOWN");
  assert.equal(event.reportedAttemptCount, 0);
  assert.equal(event.relatedIncidentId, null);
  assert.ok(
    event.evaluations.every((evaluation) => evaluation.outcome === "UNKNOWN"),
  );
  assert.equal(event.evaluations[0].reasonCode, "TIMEOUT_CANDIDATE");
  assert.match(event.evaluations[0].reason, /420/);
  assert.equal(event.evidence[0].ledger, null);
  assert.ok(event.evidence[0].gaps.length);
});
test("DS05 independent evidence supports business PASS while processing and TIMEOUT remain UNKNOWN", async () => {
  const { api } = fresh(),
    event = await api.getEventDetail("evt-005");
  assert.deepEqual(event.attempts, []);
  assert.deepEqual(event.reports, []);
  assert.equal(event.processingStatus, "UNKNOWN");
  assert.deepEqual(
    event.evaluations.map((evaluation) => evaluation.outcome),
    ["UNKNOWN", "PASS", "PASS"],
  );
  assert.equal(event.evidence[0].ledger?.effectCount, 1);
  assert.equal(event.relatedIncidentId, null);
});
test("same-attempt terminal conflict keeps both reports and historical generation; DS02 remains distinct", async () => {
  const { api } = fresh(),
    event = await api.getEventDetail("evt-010");
  assert.equal(event.attempts.length, 1);
  assert.equal(event.reports.length, 2);
  assert.equal(event.attempts[0].status, "CONFLICTED");
  assert.equal(event.attempts[0].finishedAt, null);
  assert.equal(event.processingStatus, "UNKNOWN");
  assert.equal(event.hasReportConflict, true);
  assert.equal(event.evaluations.length, 6);
  assert.equal(
    event.evaluations.filter(
      (item) => !item.isLatest && item.outcome === "PASS",
    ).length,
    3,
  );
  assert.deepEqual(
    event.ruleResults.map((item) => item.outcome),
    ["UNKNOWN", "PASS", "PASS"],
  );
  assert.equal(event.evaluationGeneration, "2");
});
test("get missing resources returns structured 404; invalid path is 400 and logical eventId does not alias observation ID", async () => {
  const { api } = fresh();
  await rejectsApi(api.getEventDetail("missing-id"), 404, "RESOURCE_NOT_FOUND");
  await rejectsApi(
    api.getIncidentDetail("missing-id"),
    404,
    "RESOURCE_NOT_FOUND",
  );
  await rejectsApi(
    api.getEventDetail("order-paid-1003"),
    404,
    "RESOURCE_NOT_FOUND",
  );
  await rejectsApi(
    api.getEventDetail("evt-003/extra"),
    400,
    "VALIDATION_ERROR",
  );
  await rejectsApi(
    api.updateRule("missing-id", { enabled: false }),
    404,
    "RESOURCE_NOT_FOUND",
  );
});
for (const body of ruleBodies)
  test(`create ${body.ruleType} instance allows duplicate configuration and keeps historical evaluations`, async () => {
    const { api } = fresh(),
      before = await api.getEventDetail("evt-003");
    const first = await api.createRule({
      ...body,
      name: "  Rule instance  ",
      description: "  Description  ",
    });
    const second = await api.createRule(body);
    assert.equal(first.id, "rule-new-001");
    assert.equal(second.id, "rule-new-002");
    assert.equal(first.name, "Rule instance");
    assert.equal(first.description, "Description");
    assert.equal(first.enabled, true);
    assert.equal(first.configVersion, "1");
    assert.deepEqual(first.relatedEventIds, []);
    assert.equal((await api.listRules()).totalItems, 8);
    assert.deepEqual(
      (await api.getEventDetail("evt-003")).evaluations,
      before.evaluations,
    );
    assert.equal((await api.getOverview()).stats.unknownEvaluations, 26);
  });
test("new rule creation preserves false enabled, default description, ownership and Unicode name order", async () => {
  const { api } = fresh();
  const rule = await api.createRule({ ...ruleBodies[0], enabled: false });
  assert.equal(rule.enabled, false);
  assert.equal(rule.description, "");
  assert.equal(
    (await api.listRules({ applicationId: "app-002" })).totalItems,
    3,
  );
  assert.equal(
    (await api.listRules({ applicationId: "missing" })).totalItems,
    0,
  );
  await rejectsApi(
    api.createRule({ ...ruleBodies[0], applicationId: "app-missing" }),
    404,
    "RESOURCE_NOT_FOUND",
  );
  const listed = await api.listRules({ sort: "name,asc" });
  const names = listed.items.map((item) => item.name.toLowerCase());
  assert.deepEqual(names, [...names].sort(compareText));
});
test("rule enabled update changes only config state/timestamp; same state is no-op and historical data stays intact", async () => {
  const { api } = fresh(),
    before = await api.getEventDetail("evt-003");
  const changed = await api.updateRule("rule-002", { enabled: false });
  assert.equal(changed.enabled, false);
  assert.equal(changed.configVersion, "1");
  assert.equal(changed.updatedAt, "2026-10-17T10:10:00.001Z");
  assert.deepEqual(
    await api.updateRule("rule-002", { enabled: false }),
    changed,
  );
  assert.equal((await api.getOverview()).asOf, changed.updatedAt);
  assert.deepEqual(
    (await api.getEventDetail("evt-003")).evaluations,
    before.evaluations,
  );
  assert.equal((await api.getIncidentDetail("inc-001")).status, "OPEN");
  assert.equal(
    (await api.listRules()).items.find((item) => item.id === "rule-002")
      ?.enabled,
    false,
  );
});
test("incident filters combine AND, sorted pages include resolved cases and unknown app returns empty", async () => {
  const { api } = fresh();
  assert.deepEqual(
    (await api.listIncidents({ status: "OPEN", severity: "HIGH" })).items.map(
      (item) => item.id,
    ),
    ["inc-001"],
  );
  assert.deepEqual(
    (
      await api.listIncidents({ status: "INVESTIGATING", severity: "HIGH" })
    ).items.map((item) => item.id),
    ["inc-002"],
  );
  assert.deepEqual(
    (
      await api.listIncidents({ status: "RESOLVED", severity: "HIGH" })
    ).items.map((item) => item.id),
    ["inc-004"],
  );
  assert.equal(
    (await api.listIncidents({ applicationId: "app-002", status: "OPEN" }))
      .totalItems,
    0,
  );
  const paged = await api.listIncidents({ size: 2, page: 2 });
  assert.equal(paged.items.length, 1);
  assert.equal(paged.totalItems, 5);
  assert.equal(paged.totalPages, 3);
  assert.equal(
    (await api.listIncidents({ sort: "openedAt,asc" })).items[0].id,
    "inc-004",
  );
  assert.equal(
    (await api.listIncidents({ applicationId: "missing" })).totalPages,
    0,
  );
});
test("OPEN → INVESTIGATING → RESOLVED atomically updates version/history/list/overview; never repairs ledger", async () => {
  const { api } = fresh(),
    event = await api.getEventDetail("evt-003");
  const investigating = await api.updateIncidentStatus("inc-001", {
    status: "INVESTIGATING",
    expectedVersion: "0",
    note: "Reviewing evidence",
  });
  assert.equal(investigating.version, "1");
  assert.equal(investigating.history.length, 2);
  assert.equal(investigating.history[1].note, "Reviewing evidence");
  assert.equal(investigating.history[1].createdAt, investigating.updatedAt);
  assert.equal(investigating.history[1].id, "hist-new-001");
  assert.equal(investigating.resolvedAt, null);
  assert.equal((await api.getOverview()).stats.openIncidents, 3);
  const resolved = await api.updateIncidentStatus("inc-001", {
    status: "RESOLVED",
    expectedVersion: "1",
  });
  assert.equal(resolved.version, "2");
  assert.equal(resolved.history.length, 3);
  assert.equal(resolved.resolvedAt, "2026-10-17T10:10:00.002Z");
  assert.equal(resolved.resolvedAt, resolved.updatedAt);
  assert.equal((await api.getOverview()).stats.openIncidents, 2);
  assert.equal((await api.getOverview({ range: "1h" })).stats.openIncidents, 0);
  assert.deepEqual(await api.getEventDetail("evt-003"), event);
  assert.equal((await api.listIncidents({ status: "RESOLVED" })).totalItems, 3);
  assert.equal(resolved.evidence[0].ledger?.totalDelta, "200");
  assert.deepEqual(
    (await api.getIncidentDetail("inc-001")).history,
    resolved.history,
  );
});
test("invalid transitions fail without clock/version/history changes, and stale version wins over transition validation", async () => {
  const { api } = fresh(),
    initial = await api.getIncidentDetail("inc-001");
  await rejectsApi(
    api.updateIncidentStatus("inc-001", {
      status: "RESOLVED",
      expectedVersion: "0",
    }),
    409,
    "INVALID_STATE_TRANSITION",
  );
  assert.deepEqual(await api.getIncidentDetail("inc-001"), initial);
  assert.equal((await api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  await api.updateIncidentStatus("inc-001", {
    status: "INVESTIGATING",
    expectedVersion: "0",
  });
  await assert.rejects(
    api.updateIncidentStatus("inc-001", {
      status: "OPEN",
      expectedVersion: "0",
    }),
    (error: unknown) =>
      error instanceof MonitorApiError &&
      error.code === "VERSION_CONFLICT" &&
      error.response.currentVersion === "1",
  );
  await rejectsApi(
    api.updateIncidentStatus("inc-001", {
      status: "OPEN",
      expectedVersion: "1",
    }),
    409,
    "INVALID_STATE_TRANSITION",
  );
  for (const status of ["OPEN", "INVESTIGATING"] as IncidentStatus[])
    await rejectsApi(
      api.updateIncidentStatus("inc-004", { status, expectedVersion: "2" }),
      409,
      "INVALID_STATE_TRANSITION",
    );
});
test("same status/current version is a no-op; stale same status still conflicts", async () => {
  const { api } = fresh(),
    before = await api.getIncidentDetail("inc-001");
  assert.deepEqual(
    await api.updateIncidentStatus("inc-001", {
      status: "OPEN",
      expectedVersion: "0",
      note: "Must not add a row",
    }),
    before,
  );
  assert.equal((await api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  await rejectsApi(
    api.updateIncidentStatus("inc-004", {
      status: "RESOLVED",
      expectedVersion: "1",
    }),
    409,
    "VERSION_CONFLICT",
  );
});
test("concurrent requests using the same expectedVersion produce exactly one commit", async () => {
  const { api } = fresh();
  const outcomes = await Promise.allSettled([
    api.updateIncidentStatus("inc-001", {
      status: "INVESTIGATING",
      expectedVersion: "0",
    }),
    api.updateIncidentStatus("inc-001", {
      status: "INVESTIGATING",
      expectedVersion: "0",
    }),
  ]);
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    1,
  );
  const failed = outcomes.find((item) => item.status === "rejected");
  assert.ok(
    failed?.status === "rejected" &&
      failed.reason instanceof MonitorApiError &&
      failed.reason.code === "VERSION_CONFLICT",
  );
  assert.equal((await api.getIncidentDetail("inc-001")).history.length, 2);
  assert.equal((await api.getOverview()).asOf, "2026-10-17T10:10:00.001Z");
});

const invalidQueries: [keyof MonitorApi, unknown][] = [
  ["listEvents", { page: -1 }],
  ["listEvents", { page: "0" }],
  ["listEvents", { page: 0.5 }],
  ["listEvents", { size: 0 }],
  ["listEvents", { size: 101 }],
  ["listEvents", { status: "PASS" }],
  ["listEvents", { status: ["UNKNOWN", "FAILED"] }],
  ["listEvents", { sort: "id,asc" }],
  ["listEvents", { search: "x".repeat(129) }],
  ["listEvents", { applicationId: "app /bad" }],
  ["listEvents", { extra: true }],
  ["listApplications", { applicationId: "app-001" }],
  ["listRules", { ruleType: "TIMEOUT" }],
  ["listIncidents", { status: "FAILED" }],
  ["listIncidents", { severity: "CRITICAL" }],
  ["listIncidents", { search: "inc-001" }],
  ["getOverview", { range: "30d" }],
  ["getOverview", { bucket: "minute" }],
  ["getOverview", { latestIncidentsLimit: 0 }],
  ["getOverview", { latestIncidentsLimit: 6 }],
  ["getOverview", { page: 0 }],
  ["listEvents", null],
];
for (const [method, query] of invalidQueries)
  test(`${method} rejects invalid query ${JSON.stringify(query)}`, async () => {
    await rejectsApi(
      invalidCall(fresh().api, method, query),
      400,
      "INVALID_QUERY",
    );
  });

const invalidBodies: [keyof MonitorApi, unknown[]][] = [
  ["createApplication", [{ name: " ", environment: "SANDBOX" }]],
  ["createApplication", [{ name: "x".repeat(101), environment: "SANDBOX" }]],
  ["createApplication", [{ name: "App", environment: "PRODUCTION" }]],
  ["createApplication", [{ name: "App", environment: null }]],
  [
    "createApplication",
    [{ name: "App", environment: "SANDBOX", credentials: "forbidden" }],
  ],
  ["createRule", [{ ...ruleBodies[0], config: ruleBodies[1].config }]],
  ["createRule", [{ ...ruleBodies[0], enabled: "false" }]],
  ["createRule", [{ ...ruleBodies[0], description: null }]],
  [
    "createRule",
    [
      {
        ...ruleBodies[0],
        config: {
          thresholdSeconds: 0,
          completionBasis: "FIRST_TRUSTED_SUCCESS",
        },
      },
    ],
  ],
  [
    "createRule",
    [
      {
        ...ruleBodies[0],
        config: {
          thresholdSeconds: 86401,
          completionBasis: "FIRST_TRUSTED_SUCCESS",
        },
      },
    ],
  ],
  [
    "createRule",
    [
      {
        ...ruleBodies[0],
        config: {
          thresholdSeconds: 1.5,
          completionBasis: "FIRST_TRUSTED_SUCCESS",
        },
      },
    ],
  ],
  [
    "createRule",
    [
      {
        ...ruleBodies[1],
        config: { maxEffects: 2, sourcePolicy: "EVENT_BOUND_SOURCE" },
      },
    ],
  ],
  ["createRule", [{ ...ruleBodies[0], script: "not allowed" }]],
  ["updateRule", ["rule-001", { enabled: "false" }]],
  ["updateRule", ["rule-001", { enabled: false, name: "Cannot edit" }]],
  [
    "updateIncidentStatus",
    ["inc-001", { status: "INVESTIGATING", expectedVersion: 0 }],
  ],
  [
    "updateIncidentStatus",
    ["inc-001", { status: "INVESTIGATING", expectedVersion: "01" }],
  ],
  [
    "updateIncidentStatus",
    [
      "inc-001",
      { status: "INVESTIGATING", expectedVersion: "0", note: "x".repeat(501) },
    ],
  ],
];
for (const [index, [method, args]] of invalidBodies.entries())
  test(`validation case ${index + 1}: ${method} rejects invalid body with no state mutation`, async () => {
    const { api } = fresh();
    await rejectsApi(
      invalidCall(api, method, ...args),
      400,
      "VALIDATION_ERROR",
    );
    assert.equal((await api.listApplications()).totalItems, 2);
    assert.equal((await api.listRules()).totalItems, 6);
    assert.equal((await api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  });

test("injected failures are one-shot before commit, do not consume IDs/clock and never turn API errors into UNKNOWN", async () => {
  const { api, controls } = fresh();
  controls.failNext("createApplication");
  await rejectsApi(
    api.createApplication({ name: "New", environment: "SANDBOX" }),
    503,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal((await api.listApplications()).totalItems, 2);
  assert.equal((await api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  const result = await api.createApplication({
    name: "New",
    environment: "SANDBOX",
  });
  assert.equal(result.id, "app-new-001");
  assert.equal(result.createdAt, "2026-10-17T10:10:00.001Z");
  const before = await api.getEventDetail("evt-003");
  controls.failNext("getEventDetail", "INTERNAL_ERROR");
  await rejectsApi(api.getEventDetail("evt-003"), 500, "INTERNAL_ERROR");
  assert.deepEqual(await api.getEventDetail("evt-003"), before);
});
test("rule and incident injected save failures preserve previous state/history and consume no counters", async () => {
  const { api, controls } = fresh();
  controls.failNext("updateRule");
  await rejectsApi(
    api.updateRule("rule-001", { enabled: false }),
    503,
    "SERVICE_UNAVAILABLE",
  );
  assert.equal(
    (await api.listRules()).items.find((item) => item.id === "rule-001")
      ?.enabled,
    true,
  );
  controls.failNext("createRule");
  await rejectsApi(api.createRule(ruleBodies[0]), 503, "SERVICE_UNAVAILABLE");
  assert.equal((await api.createRule(ruleBodies[0])).id, "rule-new-001");
  const before = await api.getIncidentDetail("inc-001");
  controls.failNext("updateIncidentStatus");
  await rejectsApi(
    api.updateIncidentStatus("inc-001", {
      status: "INVESTIGATING",
      expectedVersion: "0",
    }),
    503,
    "SERVICE_UNAVAILABLE",
  );
  assert.deepEqual(await api.getIncidentDetail("inc-001"), before);
  assert.equal(
    (
      await api.updateIncidentStatus("inc-001", {
        status: "INVESTIGATING",
        expectedVersion: "0",
      })
    ).history.at(-1)?.id,
    "hist-new-001",
  );
});
test("fault controls support structured 400/401/403/404/409/500/503 errors", async () => {
  const { api, controls } = fresh();
  for (const [code, status] of [
    ["INVALID_QUERY", 400],
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["RESOURCE_NOT_FOUND", 404],
    ["INVALID_STATE_TRANSITION", 409],
    ["INTERNAL_ERROR", 500],
    ["SERVICE_UNAVAILABLE", 503],
  ] as const) {
    if (code === "RESOURCE_NOT_FOUND") {
      controls.failNext("getEventDetail", code);
      await rejectsApi(api.getEventDetail("evt-003"), status, code);
    } else if (code === "INVALID_STATE_TRANSITION") {
      controls.failNext("updateIncidentStatus", code);
      await rejectsApi(
        api.updateIncidentStatus("inc-001", {
          status: "INVESTIGATING",
          expectedVersion: "0",
        }),
        status,
        code,
      );
    } else {
      controls.failNext("getOverview", code);
      await rejectsApi(api.getOverview(), status, code);
    }
  }
  assert.throws(() =>
    controls.failNext("getOverview", "INVALID_STATE_TRANSITION"),
  );
  assert.equal((await api.getOverview()).stats.observedEvents, 30);
});
test("response objects and submitted bodies cannot mutate shared state outside the API", async () => {
  const { api } = fresh();
  const event = await api.getEventDetail("evt-003");
  event.evidence[1].ledger = null;
  event.evaluations.length = 0;
  assert.equal((await api.getEventDetail("evt-003")).evaluations.length, 3);
  const body = { name: "Original", environment: "SANDBOX" as const },
    pending = api.createApplication(body);
  body.name = "External edit";
  assert.equal((await pending).name, "Original");
  const listed = await api.listRules();
  listed.items[0].enabled = false;
  assert.equal((await api.listRules()).items[0].enabled, true);
});
test("reset restores fixture snapshot, ID counters, fault controls and independent state instances", async () => {
  const left = fresh(),
    right = fresh();
  await left.api.createApplication({ name: "New", environment: "SANDBOX" });
  assert.equal((await right.api.listApplications()).totalItems, 2);
  left.controls.failNext("getOverview");
  left.controls.reset();
  assert.equal((await left.api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  assert.equal((await left.api.listApplications()).totalItems, 2);
  assert.equal(
    (
      await left.api.createApplication({
        name: "Again",
        environment: "SANDBOX",
      })
    ).id,
    "app-new-001",
  );
  assert.deepEqual(createFixtures(), createFixtures());
});
test("empty mode is successful empty data with zero totals, not a simulated failure", async () => {
  const { api, controls } = fresh();
  controls.reset("empty");
  const summary = await api.getOverview();
  assert.deepEqual(summary.stats, {
    observedEvents: 0,
    confirmedProcessing: 0,
    openIncidents: 0,
    unknownEvaluations: 0,
  });
  assert.ok(summary.volumeBuckets.every((bucket) => bucket.count === 0));
  for (const page of await Promise.all([
    api.listApplications(),
    api.listEvents(),
    api.listRules(),
    api.listIncidents(),
  ])) {
    assert.deepEqual(page.items, []);
    assert.equal(page.totalItems, 0);
    assert.equal(page.totalPages, 0);
  }
  await rejectsApi(api.getEventDetail("evt-003"), 404, "RESOURCE_NOT_FOUND");
  controls.reset();
  assert.equal((await api.listEvents()).totalItems, 30);
});
test("AbortSignal cancellation and reset during pending calls cannot commit a stale mutation", async () => {
  const { api, controls } = createMockMonitorApi({ latencyMs: 10 });
  const signal = new AbortController();
  const pending = api.createApplication(
    { name: "Cancelled", environment: "SANDBOX" },
    { signal: signal.signal },
  );
  signal.abort();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof TransportError && error.kind === "aborted",
  );
  assert.equal((await api.listApplications()).totalItems, 2);
  const stale = api.createApplication({
    name: "Stale",
    environment: "SANDBOX",
  });
  controls.reset();
  await assert.rejects(
    stale,
    (error: unknown) =>
      error instanceof TransportError && error.kind === "aborted",
  );
  assert.equal((await api.getOverview()).asOf, FIXTURE_METADATA.snapshot);
  assert.equal(
    (await api.createApplication({ name: "First", environment: "SANDBOX" })).id,
    "app-new-001",
  );
});
test("default mock latency yields a real pending Promise and can be controlled for tests", async () => {
  const { api } = createMockMonitorApi();
  let settled = false;
  const request = api.listApplications().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  await request;
  assert.equal(settled, true);
  const { controls } = fresh();
  assert.throws(() => controls.setLatency(-1));
});
