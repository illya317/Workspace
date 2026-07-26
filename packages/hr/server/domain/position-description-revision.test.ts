import assert from "node:assert/strict";
import test from "node:test";

import {
  nextPositionDescriptionRevision,
  pickPositionDescriptionRevisionAsOf,
} from "./position-description-revision";

test("as-of selection ignores future revisions and treats null effective date as the baseline", () => {
  const revisions = [
    { id: 1, sequence: 1, effectiveDate: null },
    { id: 2, sequence: 2, effectiveDate: "2026-07-01" },
    { id: 3, sequence: 3, effectiveDate: "2026-08-01" },
  ];
  assert.equal(pickPositionDescriptionRevisionAsOf(revisions, "2026-06-30")?.id, 1);
  assert.equal(pickPositionDescriptionRevisionAsOf(revisions, "2026-07-27")?.id, 2);
});

test("same-day revisions are sequenced deterministically", () => {
  const selected = pickPositionDescriptionRevisionAsOf([
    { id: 1, sequence: 1, effectiveDate: "2026-07-27" },
    { id: 2, sequence: 2, effectiveDate: "2026-07-27" },
  ], "2026-07-27");
  assert.equal(selected?.id, 2);
});

test("normal changes preserve lineage while corrections explicitly supersede the latest revision", () => {
  assert.deepEqual(nextPositionDescriptionRevision({
    latest: { id: 7, sequence: 3 },
    expectedSequence: 3,
    changeKind: "change",
  }), { ok: true, sequence: 4, supersedesRevisionId: null });
  assert.deepEqual(nextPositionDescriptionRevision({
    latest: { id: 7, sequence: 3 },
    expectedSequence: 3,
    changeKind: "correction",
  }), { ok: true, sequence: 4, supersedesRevisionId: 7 });
  assert.equal(nextPositionDescriptionRevision({
    latest: { id: 7, sequence: 4 },
    expectedSequence: 3,
    changeKind: "change",
  }).ok, false);
});
