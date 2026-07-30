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
