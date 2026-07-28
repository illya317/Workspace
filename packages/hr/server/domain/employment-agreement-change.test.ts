import assert from "node:assert/strict";
import test from "node:test";

import { employmentAgreementChangeManifest } from "./employment-agreement-change";

test("agreement command ledger records effects without copying sensitive clause content", () => {
  const manifest = employmentAgreementChangeManifest({
    kind: "correct-existing",
    agreementUid: "agreement-1234",
    expectedVersion: 2,
    patch: {
      company: "Example",
    },
    sourceKind: "workspace-ui",
    sourceRef: null,
    reason: "条款变更",
  });
  assert.equal(manifest.agreementUid, "agreement-1234");
  assert.equal("patch" in manifest, false);
});

test("replacement ledger links the new agreement write to the replaced agreement", () => {
  const manifest = employmentAgreementChangeManifest({
    kind: "replace",
    agreementUid: "agreement-1234",
    expectedVersion: 2,
    employmentId: 7,
    isPrimary: false,
    effectiveFrom: "2026-08-01",
    effectiveThrough: null,
    termKind: "permanent",
    content: {
      company: "Example",
      insuranceStatus: null,
      legalRelation: "劳动关系",
      contractType: "劳动合同",
      employmentForm: "全日制",
      confidentialityDate: null,
      nonCompeteDate: null,
    },
    sourceKind: "workspace-ui",
    sourceRef: null,
    reason: "更换协议",
  });
  assert.equal(manifest.replacesAgreementUid, "agreement-1234");
  assert.equal(manifest.employmentId, 7);
  assert.equal("content" in manifest, false);
});
