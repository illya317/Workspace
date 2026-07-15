import assert from "node:assert/strict";
import test from "node:test";

import { consolidationSourceIdentityMatches } from "./consolidation-source-identity";

const frozen = {
  workpaperId: 7,
  workpaperVersion: 3,
  sourceStatus: "submitted",
  sourceChecksum: "checksum-a",
  sourcePackageId: 11,
  sourcePackageRevision: 2,
  sourcePackageStatus: "submitted",
  sourcePackageChecksum: "checksum-a",
};
const current = {
  id: 7,
  version: 3,
  status: "submitted",
  sourceChecksum: "checksum-a",
  sourcePackageId: 11,
  sourcePackageRevision: 2,
  sourcePackage: {
    id: 11,
    revision: 2,
    status: "submitted",
    fileChecksum: "checksum-a",
  },
};

test("accepts the exact workpaper and source-package identity", () => {
  assert.equal(consolidationSourceIdentityMatches(frozen, current), true);
});

test("rejects old metadata paired with a different workpaper or package checksum", () => {
  assert.equal(consolidationSourceIdentityMatches(frozen, { ...current, id: 8 }), false);
  assert.equal(consolidationSourceIdentityMatches(frozen, {
    ...current,
    sourcePackage: { ...current.sourcePackage, fileChecksum: "checksum-b" },
  }), false);
  assert.equal(consolidationSourceIdentityMatches(frozen, { ...current, version: 4 }), false);
});

test("rejects a workpaper created after a system-source snapshot was generated", () => {
  assert.equal(consolidationSourceIdentityMatches({
    ...frozen,
    workpaperId: null,
    workpaperVersion: null,
    sourceStatus: "available",
    sourceChecksum: null,
    sourcePackageId: null,
    sourcePackageRevision: null,
    sourcePackageStatus: null,
    sourcePackageChecksum: null,
  }, current), false);
});
