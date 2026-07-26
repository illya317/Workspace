import assert from "node:assert/strict";
import test from "node:test";
import { hashQcPayload } from "./batch-record";

test("QC signed payload hash is stable across JSON object key order", () => {
  const left = hashQcPayload({
    recordUid: "record-1",
    fields: { second: "2", first: "1" },
    signature: { role: "inspector", signerUserId: 7 },
  });
  const right = hashQcPayload({
    signature: { signerUserId: 7, role: "inspector" },
    fields: { first: "1", second: "2" },
    recordUid: "record-1",
  });
  assert.equal(left, right);
  assert.notEqual(left, hashQcPayload({ recordUid: "record-1", fields: { first: "changed", second: "2" } }));
});
