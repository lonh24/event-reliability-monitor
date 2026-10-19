import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
import {
  apiError,
  MonitorApiError,
  TransportError,
} from "../src/services/apiErrors.ts";
import {
  incidentMutationFailure,
  incidentTransitionRequest,
  nextIncidentStatus,
} from "../src/components/monitoring/incidentWorkflow.ts";

test("UI transition requests carry the loaded version and persist exactly one history entry", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  const initial = await api.getIncidentDetail("inc-001");
  const updated = await api.updateIncidentStatus(
    initial.id,
    incidentTransitionRequest(initial, "  Inspect sandbox ledger  "),
  );
  assert.equal(updated.status, "INVESTIGATING");
  assert.equal(updated.version, "1");
  assert.equal(updated.history.length, initial.history.length + 1);
  assert.deepEqual(updated.history.slice(0, -1), initial.history);
  assert.equal(updated.history.at(-1)?.note, "Inspect sandbox ledger");
  assert.equal(initial.status, "OPEN");
  assert.equal(initial.version, "0");
});
test("second UI transition uses returned version; resolution preserves business proof and updates projections", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  const before = await api.getIncidentDetail("inc-001");
  const event = await api.getEventDetail("evt-003");
  const investigating = await api.updateIncidentStatus(
    before.id,
    incidentTransitionRequest(before, ""),
  );
  assert.equal((await api.getOverview()).stats.openIncidents, 3);
  const resolved = await api.updateIncidentStatus(
    before.id,
    incidentTransitionRequest(investigating, "Review complete"),
  );
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.version, "2");
  assert.equal(resolved.history.length, before.history.length + 2);
  assert.equal(resolved.resolvedAt, resolved.updatedAt);
  assert.deepEqual(resolved.evidence, before.evidence);
  assert.deepEqual(resolved.linkedEvaluations, before.linkedEvaluations);
  assert.deepEqual(await api.getEventDetail("evt-003"), event);
  assert.deepEqual((await api.getOverview()).stats, {
    observedEvents: 30,
    confirmedProcessing: 18,
    openIncidents: 2,
    unknownEvaluations: 26,
  });
  assert.equal(
    (
      await api.listIncidents({ status: "RESOLVED", severity: "HIGH" })
    ).items.some((item) => item.id === before.id),
    true,
  );
  assert.equal(nextIncidentStatus(resolved.status), null);
  assert.throws(
    () => incidentTransitionRequest(resolved, ""),
    /cannot be reopened/,
  );
});
test("stale UI request produces a real version conflict without changing winning history", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  const initial = await api.getIncidentDetail("inc-001");
  const request = incidentTransitionRequest(initial, "stale note");
  const winning = await api.updateIncidentStatus(
    initial.id,
    incidentTransitionRequest(initial, "other actor"),
  );
  await assert.rejects(
    api.updateIncidentStatus(initial.id, request),
    (error: unknown) => {
      assert.ok(error instanceof MonitorApiError);
      assert.equal(error.code, "VERSION_CONFLICT");
      assert.equal(incidentMutationFailure(error).kind, "version-conflict");
      return true;
    },
  );
  assert.deepEqual(await api.getIncidentDetail(initial.id), winning);
});
test("invalid direct transition is rejected separately from version conflict and does not invent history", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  const before = await api.getIncidentDetail("inc-001");
  await assert.rejects(
    api.updateIncidentStatus(before.id, {
      status: "RESOLVED",
      expectedVersion: before.version,
    }),
    (error: unknown) => {
      assert.ok(error instanceof MonitorApiError);
      assert.equal(error.code, "INVALID_STATE_TRANSITION");
      assert.equal(incidentMutationFailure(error).kind, "invalid-transition");
      return true;
    },
  );
  assert.deepEqual(await api.getIncidentDetail(before.id), before);
});
test("competing UI requests with the same revision commit once", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  const before = await api.getIncidentDetail("inc-001");
  const results = await Promise.allSettled([
    api.updateIncidentStatus(before.id, incidentTransitionRequest(before, "a")),
    api.updateIncidentStatus(before.id, incidentTransitionRequest(before, "b")),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const after = await api.getIncidentDetail(before.id);
  assert.equal(after.version, "1");
  assert.equal(after.history.length, before.history.length + 1);
});
test("UI note bounds use characters; BIGINT revision strings are never rounded", () => {
  const incident = { status: "OPEN", version: "9223372036854775806" } as const;
  const request = incidentTransitionRequest(incident, "😀".repeat(500));
  assert.equal(request.expectedVersion, incident.version);
  assert.equal(Array.from(request.note ?? "").length, 500);
  assert.throws(
    () => incidentTransitionRequest(incident, "x".repeat(501)),
    /at most 500/,
  );
});
test("mutation failure messages do not echo transport payloads or claim success", () => {
  for (const error of [
    new TransportError("network", "secret-token"),
    new TransportError("protocol", "secret-token"),
    new TransportError("aborted", "secret-token"),
    new Error("secret-token"),
  ]) {
    const failure = incidentMutationFailure(error);
    assert.equal(failure.kind, "uncertain");
    assert.ok(!failure.message.includes("secret-token"));
    assert.match(failure.message, /not be retried automatically/);
  }
  const failure = incidentMutationFailure(
    apiError(503, "SERVICE_UNAVAILABLE", "secret-token"),
  );
  assert.equal(failure.kind, "api");
  assert.match(failure.message, /503/);
  assert.ok(!failure.message.includes("secret-token"));
});
test("failed UI transition keeps history and reset restores mock session, not production persistence", async () => {
  const { api, controls } = createMockMonitorApi({ latencyMs: 0 });
  const before = await api.getIncidentDetail("inc-001");
  controls.failNext("updateIncidentStatus", "SERVICE_UNAVAILABLE");
  await assert.rejects(
    api.updateIncidentStatus(
      before.id,
      incidentTransitionRequest(before, "failed"),
    ),
  );
  assert.deepEqual(await api.getIncidentDetail(before.id), before);
  await api.updateIncidentStatus(
    before.id,
    incidentTransitionRequest(before, "saved"),
  );
  controls.reset();
  assert.deepEqual(await api.getIncidentDetail(before.id), before);
});
