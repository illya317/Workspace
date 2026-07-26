import assert from "node:assert/strict";
import test from "node:test";

import { requestProposalSettlement } from "./proposal-settlement";

function response(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

test("successful settlement keeps mode-specific server message", async () => {
  const calls: string[] = [];
  const result = await requestProposalSettlement(41, "confirm", (async (input) => {
    calls.push(String(input));
    return response(true, { status: "confirmed", message: "已提交审批" });
  }) as typeof fetch);

  assert.deepEqual(result, { ok: true, message: "已提交审批", status: "confirmed" });
  assert.equal(calls.length, 1);
});

test("failed settlement refreshes terminal state without masking the original error", async () => {
  let calls = 0;
  const result = await requestProposalSettlement(42, "confirm", (async () => {
    calls += 1;
    return calls === 1
      ? response(false, { error: "人工校验失败" })
      : response(true, { status: "failed" });
  }) as typeof fetch);

  assert.deepEqual(result, { ok: false, message: "人工校验失败", status: "failed" });
  assert.equal(calls, 2);
});

test("status refresh failure still returns the original network error", async () => {
  let calls = 0;
  const result = await requestProposalSettlement(43, "cancel", (async () => {
    calls += 1;
    throw new Error(calls === 1 ? "network disconnected" : "refresh unavailable");
  }) as typeof fetch);

  assert.deepEqual(result, { ok: false, message: "network disconnected", status: null });
});
