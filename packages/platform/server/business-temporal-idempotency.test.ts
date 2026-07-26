import assert from "node:assert/strict";
import test from "node:test";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "./business-temporal-idempotency";

test("business temporal request fingerprints are canonical across object key order", () => {
  const left = businessTemporalRequestFingerprint({ expectedVersion: 2, command: { kind: "end", reason: "done" } });
  const right = businessTemporalRequestFingerprint({ command: { reason: "done", kind: "end" }, expectedVersion: 2 });
  assert.equal(left, right);
  assert.equal(businessTemporalIdempotencyMatches(left, right), true);
});

test("business temporal request fingerprints bind command payload and expected version", () => {
  const original = businessTemporalRequestFingerprint({ expectedVersion: 2, command: { kind: "end", reason: "done" } });
  assert.notEqual(original, businessTemporalRequestFingerprint({ expectedVersion: 3, command: { kind: "end", reason: "done" } }));
  assert.notEqual(original, businessTemporalRequestFingerprint({ expectedVersion: 2, command: { kind: "end", reason: "changed" } }));
  assert.equal(businessTemporalIdempotencyMatches(null, original), false);
});
