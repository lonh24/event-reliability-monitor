import test from "node:test";
import assert from "node:assert/strict";
import { createFixtures, FIXTURE_METADATA } from "../src/mocks/fixtures.ts";
import { isDto } from "../src/services/contractValidation.ts";
import { compareText, compareTime } from "../src/services/projections.ts";

const fixtures = createFixtures();
const unique = (ids: string[]) =>
  assert.equal(
    new Set(ids).size,
    ids.length,
    "Identifiers must be unique in their domain",
  );
test("exact deterministic catalogue and counts from Mock Spec, not only minimum counts", () => {
  assert.deepEqual(createFixtures(), fixtures);
  assert.equal(FIXTURE_METADATA.seed, 20261017);
  assert.equal(fixtures.applications.length, 2);
  assert.equal(fixtures.events.length, 30);
  assert.equal(fixtures.rules.length, 6);
  assert.equal(fixtures.incidents.length, 5);
  const flat = fixtures.events.flatMap((event) => event.evaluations);
  assert.equal(flat.length, 93);
  assert.equal(flat.filter((item) => item.isLatest).length, 90);
  assert.deepEqual(
    ["PASS", "VIOLATION", "UNKNOWN"].map(
      (outcome) =>
        flat.filter((item) => item.isLatest && item.outcome === outcome).length,
    ),
    [56, 8, 26],
  );
  assert.equal(fixtures.events.flatMap((event) => event.attempts).length, 25);
  assert.equal(fixtures.events.flatMap((event) => event.reports).length, 27);
  assert.equal(fixtures.events.flatMap((event) => event.evidence).length, 58);
  assert.equal(
    fixtures.incidents.flatMap((incident) => incident.linkedEvaluations).length,
    8,
  );
  assert.equal(
    fixtures.incidents.flatMap((incident) => incident.history).length,
    10,
  );
  for (const key of ["applications", "events", "rules", "incidents"] as const)
    unique(fixtures[key].map((item) => item.id));
  unique(
    fixtures.events.map((event) => `${event.applicationId}:${event.eventId}`),
  );
  unique(
    fixtures.events.flatMap((event) => event.attempts.map((item) => item.id)),
  );
  unique(
    fixtures.events.flatMap((event) => event.reports.map((item) => item.id)),
  );
  unique(
    fixtures.events.flatMap((event) =>
      event.evaluations.map((item) => item.id),
    ),
  );
  unique(
    fixtures.events.flatMap((event) => event.evidence.map((item) => item.id)),
  );
});

for (const event of fixtures.events)
  test(`${event.id}: schema, referential integrity, chronology, evidence arithmetic and no hidden data`, () => {
    assert.ok(isDto("EventDetailResponse", event));
    const app = fixtures.applications.find(
      (item) => item.id === event.applicationId,
    );
    assert.ok(app);
    assert.equal(event.applicationName, app.name);
    assert.ok(event.occurredAt);
    assert.ok(Date.parse(event.firstSeenAt) >= Date.parse(event.occurredAt));
    assert.equal(event.reportedAttemptCount, event.attempts.length);
    for (const attempt of event.attempts) {
      assert.ok(attempt.reportIds.length);
      for (const id of attempt.reportIds)
        assert.equal(
          event.reports.find((report) => report.id === id)?.attemptId,
          attempt.id,
        );
      if (attempt.startedAt && attempt.finishedAt)
        assert.ok(
          Date.parse(attempt.finishedAt) >= Date.parse(attempt.startedAt),
        );
    }
    for (const report of event.reports) {
      assert.ok(
        event.attempts.some((attempt) => attempt.id === report.attemptId),
      );
      assert.ok(Date.parse(report.receivedAt) >= Date.parse(report.reportedAt));
      if (report.startedAt && report.finishedAt)
        assert.ok(
          Date.parse(report.finishedAt) >= Date.parse(report.startedAt),
        );
    }
    for (const evaluation of event.evaluations) {
      const rule = fixtures.rules.find((item) => item.id === evaluation.ruleId);
      assert.ok(rule);
      assert.equal(rule.applicationId, event.applicationId);
      assert.equal(rule.ruleType, evaluation.ruleType);
      assert.deepEqual(rule.config, evaluation.configSnapshot);
      assert.equal(evaluation.ruleVersion, rule.configVersion);
      assert.equal(evaluation.observedEventId, event.id);
      for (const id of evaluation.evidenceIds) {
        const item = event.evidence.find((evidence) => evidence.id === id);
        assert.ok(item);
        assert.equal(item.observedEventId, event.id);
        assert.ok(
          Date.parse(item.collectedAt) <= Date.parse(evaluation.evaluatedAt),
        );
      }
    }
    unique(
      event.evaluations
        .filter((item) => item.isLatest)
        .map((item) => item.ruleId),
    );
    assert.deepEqual(
      new Set(event.ruleResults.map((item) => item.evaluationId)),
      new Set(
        event.evaluations
          .filter((item) => item.isLatest)
          .map((item) => item.id),
      ),
    );
    for (const item of event.evidence) {
      assert.equal(item.scope.eventId, event.eventId);
      if (item.snapshotAt)
        assert.ok(Date.parse(item.collectedAt) >= Date.parse(item.snapshotAt));
      if (item.supersedesEvidenceId)
        assert.ok(
          event.evidence.some(
            (prior) => prior.id === item.supersedesEvidenceId,
          ),
        );
      for (const id of item.reportIds)
        assert.ok(event.reports.some((report) => report.id === id));
      if (item.ledger) {
        assert.equal(item.ledger.effectCount, item.ledger.effects.length);
        assert.equal(
          BigInt(item.ledger.totalDelta ?? "-1"),
          item.ledger.effects.reduce(
            (sum, effect) => sum + BigInt(effect.delta),
            0n,
          ),
        );
        unique(item.ledger.effects.map((effect) => effect.id));
        for (const effect of item.ledger.effects) {
          assert.equal(effect.eventId, event.eventId);
          assert.equal(effect.customerRef, event.customerRef);
          if (effect.createdAt && item.snapshotAt)
            assert.ok(
              Date.parse(effect.createdAt) <= Date.parse(item.snapshotAt),
            );
        }
        if (item.sourceKey === "loyalty-fault-v1") {
          assert.equal(item.sourceLabel, "Sandbox injected faulty ledger");
          assert.ok(item.scope.runId);
        }
      }
    }
    if (event.relatedIncidentId)
      assert.equal(
        fixtures.incidents.find(
          (incident) => incident.id === event.relatedIncidentId,
        )?.observedEventId,
        event.id,
      );
    const serialized = JSON.stringify(event);
    for (const forbidden of [
      "actualAttempts",
      "actualEffects",
      "att-004-1",
      "eff-004-1",
      "att-005-1",
      "password",
      "credential",
      "connectionString",
    ])
      assert.equal(serialized.includes(forbidden), false);
  });

test("incident status/history and linked violations form a consistent case, including resolved-but-wrong", () => {
  for (const incident of fixtures.incidents) {
    assert.ok(isDto("IncidentDetailResponse", incident));
    assert.equal(incident.linkedEvent.id, incident.observedEventId);
    assert.equal(incident.linkedEvent.eventId, incident.eventId);
    const event = fixtures.events.find(
      (item) => item.id === incident.observedEventId,
    );
    assert.ok(event);
    assert.equal(event.applicationId, incident.applicationId);
    assert.equal(event.relatedIncidentId, incident.id);
    assert.equal(incident.history[0].action, "CREATED");
    assert.equal(incident.history[0].fromStatus, null);
    let status = "OPEN";
    for (const history of incident.history.slice(1)) {
      assert.equal(history.fromStatus, status);
      status = history.toStatus ?? "";
    }
    assert.equal(incident.status, status);
    assert.equal(incident.version, String(incident.history.length - 1));
    assert.equal(incident.status === "RESOLVED", incident.resolvedAt !== null);
    assert.equal(incident.history.at(-1)?.createdAt, incident.updatedAt);
    for (const evaluation of incident.linkedEvaluations) {
      assert.equal(evaluation.outcome, "VIOLATION");
      assert.ok(event.evaluations.some((item) => item.id === evaluation.id));
      for (const id of evaluation.evidenceIds)
        assert.ok(incident.evidence.some((item) => item.id === id));
    }
  }
  const resolved = fixtures.incidents.find((item) => item.id === "inc-004");
  assert.ok(resolved);
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.evidence[0].ledger?.totalDelta, "200");
});
test("rule related previews resolve, are bounded and sorted by the documented time/ID order", () => {
  for (const rule of fixtures.rules) {
    assert.ok(isDto("MonitoringRuleResponse", rule));
    assert.ok(
      rule.relatedEventIds.length <= 3 && rule.relatedIncidentIds.length <= 3,
    );
    const events = fixtures.events
      .filter((event) =>
        event.evaluations.some((evaluation) => evaluation.ruleId === rule.id),
      )
      .sort(
        (a, b) =>
          compareTime(a.occurredAt, b.occurredAt, true) ||
          compareText(a.id, b.id),
      );
    assert.deepEqual(
      rule.relatedEventIds,
      events.slice(0, 3).map((event) => event.id),
    );
    for (const id of rule.relatedIncidentIds)
      assert.ok(
        fixtures.incidents
          .find((incident) => incident.id === id)
          ?.linkedEvaluations.some(
            (evaluation) => evaluation.ruleId === rule.id,
          ),
      );
  }
});
