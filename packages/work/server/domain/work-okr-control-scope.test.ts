import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoredWorkOkrControlScope } from "./work-okr-control-scope";

test("stored OKR control scope stays bound independently of the current employee department", () => {
  assert.deepEqual(normalizeStoredWorkOkrControlScope("department", "12"), {
    type: "department",
    id: "12",
    targetType: "department",
    targetId: 12,
  });
  assert.deepEqual(normalizeStoredWorkOkrControlScope("global", ""), { type: "global", id: "" });
  assert.equal(normalizeStoredWorkOkrControlScope("department", "invalid"), null);
});
