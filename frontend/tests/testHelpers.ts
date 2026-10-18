import assert from "node:assert/strict";
import { MonitorApiError } from "../src/services/apiErrors.ts";
import { isDto } from "../src/services/contractValidation.ts";
import type { ApiErrorResponse } from "../src/types/api.ts";

export async function rejectsApi(
  action: Promise<unknown>,
  status: number,
  code: ApiErrorResponse["code"],
) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof MonitorApiError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.ok(isDto("ApiErrorResponse", error.response));
    return true;
  });
}
export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
