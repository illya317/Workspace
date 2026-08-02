import assert from "node:assert/strict";
import test from "node:test";

import { validateBusinessTemporalBaselineMutation } from "./business-temporal-baseline";

test("baseline supplements may patch only fields recorded as missing", () => {
  assert.deepEqual(validateBusinessTemporalBaselineMutation({
    kind: "supplement-missing",
    missingFields: ["content.legalRelation"],
    changedFields: ["content.legalRelation"],
  }), { ok: true });
  assert.deepEqual(validateBusinessTemporalBaselineMutation({
    kind: "supplement-missing",
    missingFields: ["content.legalRelation"],
    changedFields: ["content.company"],
  }), {
    ok: false,
    reason: "mixed-semantics",
    conflictingFields: ["content.company"],
  });
});

test("baseline corrections may change only facts that already exist", () => {
  assert.deepEqual(validateBusinessTemporalBaselineMutation({
    kind: "correct-existing",
    missingFields: ["content.legalRelation"],
    changedFields: ["content.company"],
  }), { ok: true });
  assert.deepEqual(validateBusinessTemporalBaselineMutation({
    kind: "correct-existing",
    missingFields: ["content.legalRelation"],
    changedFields: ["content.legalRelation"],
  }), {
    ok: false,
    reason: "mixed-semantics",
    conflictingFields: ["content.legalRelation"],
  });
});

test("baseline mutations reject empty patches", () => {
  assert.deepEqual(validateBusinessTemporalBaselineMutation({
    kind: "correct-existing",
    missingFields: [],
    changedFields: [],
  }), { ok: false, reason: "no-fields", conflictingFields: [] });
});
