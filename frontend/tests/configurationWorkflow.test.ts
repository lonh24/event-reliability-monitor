import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationInput,
  configurationFailure,
} from "../src/components/monitoring/configurationWorkflow.ts";
import { applicationDirectory } from "../src/components/monitoring/applicationDirectory.ts";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
import { apiError, TransportError } from "../src/services/apiErrors.ts";

for (const name of ["", "   ", "a".repeat(101)])
  test(`application input rejects ${name.length} character invalid name`, () => {
    assert.equal(applicationInput(name, "SANDBOX").body, null);
    assert.ok(applicationInput(name, "SANDBOX").errors.name);
  });
test("application input trims and preserves approved environment", () => {
  assert.deepEqual(applicationInput("  Demo  ", "DEVELOPMENT").body, {
    name: "Demo",
    environment: "DEVELOPMENT",
  });
});
test("application input counts Unicode code points at the contract boundary", () => {
  assert.equal(
    applicationInput("😀".repeat(100), "SANDBOX").body?.name.length,
    200,
  );
  assert.equal(applicationInput("😀".repeat(101), "SANDBOX").body, null);
});
for (const env of ["", "PRODUCTION", "sandbox"])
  test(`application input rejects environment ${env}`, () => {
    assert.equal(applicationInput("Demo", env).body, null);
    assert.ok(applicationInput("Demo", env).errors.environment);
  });
test("confirmed API rejection keeps field errors and does not imply uncertainty", () => {
  const fields = [{ field: "name", code: "INVALID", message: "Name rejected" }];
  const result = configurationFailure(
    apiError(400, "VALIDATION_ERROR", "invalid", { fieldErrors: fields }),
  );
  assert.equal(result.uncertain, false);
  assert.deepEqual(result.fieldErrors, fields);
});
for (const kind of ["network", "protocol", "aborted"] as const)
  test(`${kind} mutation failure requires reconciliation`, () => {
    const result = configurationFailure(
      new TransportError(kind, "sensitive raw error"),
    );
    assert.equal(result.uncertain, true);
    assert.ok(!result.message.includes("sensitive"));
  });
test("unrecognized mutation failure is conservative and never echoes a stack", () => {
  assert.equal(configurationFailure(new Error("secret")).uncertain, true);
  assert.ok(
    !configurationFailure(new Error("secret")).message.includes("secret"),
  );
});
test("application directory traverses every API page and new app has empty events/rules", async () => {
  const { api } = createMockMonitorApi({ latencyMs: 0 });
  for (let i = 0; i < 100; i++)
    await api.createApplication({ name: `App ${i}`, environment: "SANDBOX" });
  const all = await applicationDirectory(api);
  assert.equal(all.length, 102);
  assert.equal(new Set(all.map((x) => x.id)).size, 102);
  assert.equal(
    (await api.listEvents({ applicationId: all[0]!.id })).totalItems,
    0,
  );
  assert.equal(
    (await api.listRules({ applicationId: all[0]!.id })).totalItems,
    0,
  );
});
test("rule toggling preserves all event and incident aggregates and config versions", async () => {
  const { api, controls } = createMockMonitorApi({ latencyMs: 0 });
  const events = await api.listEvents({ size: 100 });
  const incidents = await api.listIncidents({ size: 100 });
  const beforeEvents = await Promise.all(
    events.items.map((e) => api.getEventDetail(e.id)),
  );
  const beforeIncidents = await Promise.all(
    incidents.items.map((i) => api.getIncidentDetail(i.id)),
  );
  const rules = await api.listRules({ size: 100 });
  for (const rule of rules.items) {
    const disabled = await api.updateRule(rule.id, { enabled: false });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.configVersion, rule.configVersion);
    const enabled = await api.updateRule(rule.id, { enabled: true });
    assert.equal(enabled.configVersion, rule.configVersion);
  }
  assert.deepEqual(
    await Promise.all(events.items.map((e) => api.getEventDetail(e.id))),
    beforeEvents,
  );
  assert.deepEqual(
    await Promise.all(incidents.items.map((i) => api.getIncidentDetail(i.id))),
    beforeIncidents,
  );
  controls.reset();
  assert.deepEqual(await api.listRules({ size: 100 }), rules);
});
