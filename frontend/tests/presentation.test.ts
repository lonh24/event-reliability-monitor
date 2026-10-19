import assert from "node:assert/strict";
import { test } from "node:test";
import { apiError, TransportError } from "../src/services/apiErrors.ts";
import {
  isResourceNotFound,
  requestErrorMessage,
  statusTone,
  utcTime,
} from "../src/components/monitoring/presentation.ts";

test("presentation preserves unknown timestamps and explicit UTC", () => {
  assert.equal(utcTime(null), "Not available");
  assert.equal(utcTime("2026-10-17T10:10:00Z"), "2026-10-17 10:10:00 UTC");
});
test("only the resource-not-found API error renders detail Not Found", () => {
  assert.equal(
    isResourceNotFound(apiError(404, "RESOURCE_NOT_FOUND", "missing")),
    true,
  );
  assert.equal(
    isResourceNotFound(new TransportError("protocol", "not JSON", 404)),
    false,
  );
  assert.equal(
    isResourceNotFound(apiError(503, "SERVICE_UNAVAILABLE", "down")),
    false,
  );
  assert.equal(isResourceNotFound(new Error("404")), false);
});
test("UI errors never echo unsafe payloads or convert errors into business outcomes", () => {
  for (const error of [
    new Error("secret-token"),
    new TransportError("network", "secret-token"),
    apiError(503, "SERVICE_UNAVAILABLE", "secret-token"),
  ]) {
    assert.ok(!requestErrorMessage(error).includes("secret-token"));
    assert.ok(!requestErrorMessage(error).includes("UNKNOWN"));
  }
});
test("UNKNOWN remains a neutral outcome, distinct from failed and violation", () => {
  assert.equal(statusTone("UNKNOWN"), "neutral");
  assert.equal(statusTone("FAILED"), "danger");
  assert.equal(statusTone("VIOLATION"), "danger");
  assert.equal(statusTone("PASS"), "success");
});
