import test from "node:test";
import assert from "node:assert/strict";
import { createHttpMonitorApi } from "../src/services/httpMonitorApi.ts";
import { createMockMonitorApi } from "../src/services/mockMonitorApi.ts";
import { createMonitorApi } from "../src/services/index.ts";
import { TransportError } from "../src/services/apiErrors.ts";
import { rejectsApi, jsonResponse } from "./testHelpers.ts";
import type { MonitorApi } from "../src/services/monitorApi.ts";
import type { ApiErrorResponse, CreateRuleRequest } from "../src/types/api.ts";

function errorBody(
  code: ApiErrorResponse["code"],
  currentVersion: string | null = null,
): ApiErrorResponse {
  return {
    code,
    message: "Safe server error message.",
    requestId: "test-request",
    fieldErrors: [],
    currentVersion,
  };
}
test("all eleven HTTP operations map to method/path/body and validated mock-server DTOs", async () => {
  const { api: server } = createMockMonitorApi({ latencyMs: 0 });
  const rule: CreateRuleRequest = {
    applicationId: "app-001",
    name: "HTTP timeout",
    ruleType: "TIMEOUT",
    config: { thresholdSeconds: 60, completionBasis: "FIRST_TRUSTED_SUCCESS" },
  };
  const requests: { url: string; options: RequestInit | undefined }[] = [];
  let responding: (() => Promise<unknown>) | undefined;
  let status = 200;
  const fetcher: typeof globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    assert.ok(responding);
    return jsonResponse(await responding(), status);
  };
  const api = createHttpMonitorApi({ baseUrl: "/api/v1/", fetch: fetcher });
  const call = async (
    client: () => Promise<unknown>,
    remote: () => Promise<unknown>,
    method: string,
    path: string,
    success = 200,
    expectedBody?: unknown,
  ) => {
    responding = remote;
    status = success;
    const result = await client();
    const request = requests.at(-1);
    assert.ok(request);
    assert.equal(request.options?.method, method);
    assert.equal(
      new URL(request.url, "http://test.local").pathname,
      `/api/v1${path}`,
    );
    assert.equal(request.url.includes("/api/v1/api/v1"), false);
    assert.equal(
      new Headers(request.options?.headers).get("Accept"),
      "application/json",
    );
    if (expectedBody !== undefined) {
      assert.equal(
        new Headers(request.options?.headers).get("Content-Type"),
        "application/json",
      );
      assert.deepEqual(JSON.parse(String(request.options?.body)), expectedBody);
    } else assert.equal(request.options?.body, undefined);
    return result;
  };
  await call(
    () => api.getOverview(),
    () => server.getOverview(),
    "GET",
    "/overview",
  );
  await call(
    () => api.listApplications(),
    () => server.listApplications(),
    "GET",
    "/applications",
  );
  await call(
    () => api.createApplication({ name: " HTTP App ", environment: "SANDBOX" }),
    () =>
      server.createApplication({ name: "HTTP App", environment: "SANDBOX" }),
    "POST",
    "/applications",
    201,
    { name: "HTTP App", environment: "SANDBOX" },
  );
  await call(
    () =>
      api.listEvents({
        search: " ORDER-PAID-1003 ",
        status: "CONFIRMED",
        page: 0,
        size: 1,
      }),
    () =>
      server.listEvents({
        search: "ORDER-PAID-1003",
        status: "CONFIRMED",
        size: 1,
      }),
    "GET",
    "/events",
  );
  const query = new URL(requests.at(-1)?.url ?? "", "http://test.local")
    .searchParams;
  assert.equal(query.get("search"), "ORDER-PAID-1003");
  assert.equal(query.get("status"), "CONFIRMED");
  assert.equal(query.get("size"), "1");
  assert.equal(query.get("page"), "0");
  await call(
    () => api.getEventDetail("evt-003"),
    () => server.getEventDetail("evt-003"),
    "GET",
    "/events/evt-003",
  );
  await call(
    () => api.listRules({ applicationId: "app-001", sort: "name,desc" }),
    () => server.listRules({ applicationId: "app-001", sort: "name,desc" }),
    "GET",
    "/rules",
  );
  await call(
    () => api.createRule(rule),
    () => server.createRule(rule),
    "POST",
    "/rules",
    201,
    rule,
  );
  await call(
    () => api.updateRule("rule-001", { enabled: false }),
    () => server.updateRule("rule-001", { enabled: false }),
    "PATCH",
    "/rules/rule-001",
    200,
    { enabled: false },
  );
  await call(
    () =>
      api.listIncidents({
        status: "OPEN",
        severity: "HIGH",
        applicationId: "app-001",
      }),
    () =>
      server.listIncidents({
        status: "OPEN",
        severity: "HIGH",
        applicationId: "app-001",
      }),
    "GET",
    "/incidents",
  );
  await call(
    () => api.getIncidentDetail("inc-001"),
    () => server.getIncidentDetail("inc-001"),
    "GET",
    "/incidents/inc-001",
  );
  await call(
    () =>
      api.updateIncidentStatus("inc-001", {
        status: "INVESTIGATING",
        expectedVersion: "0",
        note: "Review",
      }),
    () =>
      server.updateIncidentStatus("inc-001", {
        status: "INVESTIGATING",
        expectedVersion: "0",
        note: "Review",
      }),
    "PATCH",
    "/incidents/inc-001/status",
    200,
    { status: "INVESTIGATING", expectedVersion: "0", note: "Review" },
  );
  assert.equal(requests.length, 11);
});
test("query serialization uses URLSearchParams, omits empty selectors and never leaks options into query", async () => {
  let captured = "";
  const { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const api = createHttpMonitorApi({
    baseUrl: "http://localhost:8080/api/v1/",
    fetch: async (url) => {
      captured = String(url);
      return jsonResponse(await fixture.listEvents({ search: "a+b & c" }));
    },
  });
  await api.listEvents({ search: " a+b & c ", applicationId: " ", status: "" });
  const url = new URL(captured);
  assert.equal(url.pathname, "/api/v1/events");
  assert.equal(url.searchParams.get("search"), "a+b & c");
  assert.equal(url.searchParams.has("status"), false);
  assert.equal(url.searchParams.has("applicationId"), false);
  assert.equal(url.searchParams.has("signal"), false);
});
test("path ID uses encodeURIComponent while invalid paths fail before fetch", async () => {
  let captured = "",
    calls = 0;
  const { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const api = createHttpMonitorApi({
    fetch: async (url) => {
      captured = String(url);
      calls++;
      return jsonResponse(await fixture.getEventDetail("evt-003"));
    },
  });
  await api.getEventDetail("event:with-colon");
  assert.ok(captured.includes("event%3Awith-colon"));
  await rejectsApi(api.getEventDetail("../events"), 400, "VALIDATION_ERROR");
  assert.equal(calls, 1);
});
for (const [code, status] of [
  ["VALIDATION_ERROR", 400],
  ["UNAUTHENTICATED", 401],
  ["FORBIDDEN", 403],
  ["RESOURCE_NOT_FOUND", 404],
  ["VERSION_CONFLICT", 409],
  ["INVALID_STATE_TRANSITION", 409],
  ["INTERNAL_ERROR", 500],
  ["SERVICE_UNAVAILABLE", 503],
] as const)
  test(`HTTP ${status} ${code} preserves structured API error without synthesizing UNKNOWN`, async () => {
    const api = createHttpMonitorApi({
      fetch: async () =>
        jsonResponse(
          errorBody(code, code === "VERSION_CONFLICT" ? "4" : null),
          status,
        ),
    });
    if (status === 409)
      await rejectsApi(
        api.updateIncidentStatus("inc-001", {
          status: "INVESTIGATING",
          expectedVersion: "0",
        }),
        status,
        code,
      );
    else if (status === 404)
      await rejectsApi(api.getIncidentDetail("missing-id"), status, code);
    else await rejectsApi(api.getOverview(), status, code);
  });
test("HTTP validation rejects unknown fields and invalid types before any network call", async () => {
  let calls = 0;
  const api = createHttpMonitorApi({
    fetch: async () => {
      calls++;
      return jsonResponse({});
    },
  });
  const call = async (
    method: keyof MonitorApi,
    ...args: unknown[]
  ): Promise<unknown> => Reflect.apply(api[method], api, args);
  await rejectsApi(
    call("createApplication", {
      name: "App",
      environment: "SANDBOX",
      credentials: "forbidden",
    }),
    400,
    "VALIDATION_ERROR",
  );
  await rejectsApi(
    call("updateRule", "rule-001", { enabled: "false" }),
    400,
    "VALIDATION_ERROR",
  );
  await rejectsApi(call("listEvents", { page: "0" }), 400, "INVALID_QUERY");
  assert.equal(calls, 0);
});
test("network errors are distinct from HTTP errors and POST is not retried automatically", async () => {
  let calls = 0;
  const api = createHttpMonitorApi({
    fetch: async () => {
      calls++;
      throw new TypeError("Network failure");
    },
  });
  await assert.rejects(
    api.createApplication({ name: "App", environment: "SANDBOX" }),
    (error: unknown) =>
      error instanceof TransportError && error.kind === "network",
  );
  assert.equal(calls, 1);
});
test("AbortSignal is forwarded, already-aborted calls do not fetch, and abort during response parsing stays aborted", async () => {
  let calls = 0;
  const controller = new AbortController(),
    { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const api = createHttpMonitorApi({
    fetch: async (_url, options) => {
      calls++;
      assert.equal(options?.signal, controller.signal);
      return jsonResponse(await fixture.listApplications());
    },
  });
  await api.listApplications({}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    api.listApplications({}, { signal: controller.signal }),
    (error: unknown) =>
      error instanceof TransportError && error.kind === "aborted",
  );
  assert.equal(calls, 1);
  const parsing = new AbortController();
  const response = new Response("not JSON", {
    headers: { "Content-Type": "application/json" },
  });
  const aborted = createHttpMonitorApi({
    fetch: async () => {
      parsing.abort();
      return response;
    },
  });
  await assert.rejects(
    aborted.listApplications({}, { signal: parsing.signal }),
    (error: unknown) =>
      error instanceof TransportError && error.kind === "aborted",
  );
});
test("invalid JSON, media type, missing fields, unexpected success and malformed API errors are protocol failures", async () => {
  const responses = [
    new Response("html error", { status: 500 }),
    new Response("{broken", {
      headers: { "Content-Type": "application/json" },
    }),
    jsonResponse({ stats: {} }),
    jsonResponse(errorBody("RESOURCE_NOT_FOUND"), 500),
    jsonResponse(errorBody("VERSION_CONFLICT"), 409),
    jsonResponse({ message: "missing fields" }, 404),
  ];
  for (const response of responses) {
    const api = createHttpMonitorApi({ fetch: async () => response });
    await assert.rejects(
      api.getOverview(),
      (error: unknown) =>
        error instanceof TransportError &&
        error.kind === "protocol" &&
        error.status === response.status,
    );
  }
  const { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const api = createHttpMonitorApi({
    fetch: async () =>
      jsonResponse(
        await fixture.createApplication({
          name: "App",
          environment: "SANDBOX",
        }),
        200,
      ),
  });
  await assert.rejects(
    api.createApplication({ name: "App", environment: "SANDBOX" }),
    (error: unknown) =>
      error instanceof TransportError && error.kind === "protocol",
  );
});
test("HTTP DTO validation retains null evidence and accepts business UNKNOWN as a successful response", async () => {
  const { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const api = createHttpMonitorApi({
    fetch: async () => jsonResponse(await fixture.getEventDetail("evt-004")),
  });
  const event = await api.getEventDetail("evt-004");
  assert.equal(event.processingStatus, "UNKNOWN");
  assert.equal(event.evidence[0].ledger, null);
  assert.ok(
    event.evaluations.every((evaluation) => evaluation.outcome === "UNKNOWN"),
  );
});
test("HTTP response invalid decimal numbers/overflow are rejected, not rounded or silently defaulted", async () => {
  const { api: fixture } = createMockMonitorApi({ latencyMs: 0 });
  const detail = await fixture.getIncidentDetail("inc-001");
  for (const version of [9007199254740992, "9223372036854775808"]) {
    const api = createHttpMonitorApi({
      fetch: async () => jsonResponse({ ...detail, version }),
    });
    await assert.rejects(
      api.getIncidentDetail("inc-001"),
      (error: unknown) =>
        error instanceof TransportError && error.kind === "protocol",
    );
  }
});
test("adapter selection defaults to mock, fails invalid configuration, and performs no HTTP I/O in mock mode", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected network");
  };
  try {
    const api = createMonitorApi({
      dataSource: "mock",
      apiBaseUrl: "intentionally-not-a-url",
    });
    assert.equal((await api.getOverview()).stats.observedEvents, 30);
    assert.equal((await createMonitorApi().listApplications()).totalItems, 2);
    assert.equal(calls, 0);
    assert.throws(
      () => createMonitorApi({ dataSource: "invalid" }),
      /VITE_DATA_SOURCE/,
    );
    assert.throws(
      () => createMonitorApi({ dataSource: "" }),
      /VITE_DATA_SOURCE/,
    );
    const http = createMonitorApi({ dataSource: "http" });
    assert.equal(Object.keys(http).length, 11);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("base URL rejects credentials, query strings and non-HTTP protocols", () => {
  for (const baseUrl of [
    "",
    "//external.example/api/v1",
    "javascript:bad",
    "https://user:secret@example.com/api/v1",
    "/api/v1?token=x",
    "/api/v1#fragment",
  ])
    assert.throws(() => createHttpMonitorApi({ baseUrl }));
});
