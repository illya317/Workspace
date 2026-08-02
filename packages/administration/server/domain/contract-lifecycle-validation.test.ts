import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContractStateReverseCommand,
  buildContractStateTransitionCommand,
} from "./contract-lifecycle-validation";

test("contract lifecycle commands carry the persisted idempotency key", () => {
  const result = buildContractStateTransitionCommand({
    contractId: 7,
    userId: 3,
    expectedVersion: 2,
    idempotencyKey: "contract-7-state-1",
    body: { axis: "signature", toState: "signed", effectiveOn: "2026-01-01", reason: "双方完成签署" },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.idempotencyKey, "contract-7-state-1");
});

test("contract lifecycle commands reject an empty idempotency key", () => {
  const result = buildContractStateReverseCommand({
    contractId: 7,
    eventId: 11,
    userId: 3,
    expectedVersion: 2,
    idempotencyKey: "  ",
    body: { reason: "录入错误" },
  });
  assert.equal(result.ok, false);
});
