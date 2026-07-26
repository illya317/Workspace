import assert from "node:assert/strict";
import test from "node:test";

import { validateDeployOrder } from "./verify-deploy-order.mjs";

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);

test("missing deployed state requires an audited production bootstrap", () => {
  assert.throws(() => validateDeployOrder({ candidateSha: b, currentHeadSha: b }), /requires audited production bootstrap/);
});

test("audited production bootstrap allows only the baseline or a descendant", () => {
  for (const [bootstrapBase, comparison] of [
    [b, { status: "identical", ahead_by: 0, base_commit: { sha: b }, merge_base_commit: { sha: b }, head_commit: { sha: b } }],
    [a, { status: "ahead", ahead_by: 2, base_commit: { sha: a }, merge_base_commit: { sha: a }, head_commit: { sha: b } }],
  ]) {
    assert.deepEqual(validateDeployOrder({ candidateSha: b, currentHeadSha: b, bootstrapBase, comparison }), {
      action: "deploy",
      reason: "audited-production-bootstrap",
    });
  }

  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    currentHeadSha: b,
    bootstrapBase: a,
    comparison: { status: "diverged", ahead_by: 1, base_commit: { sha: a }, merge_base_commit: { sha: c }, head_commit: { sha: b } },
  }), /not proven to descend from bootstrap baseline/);
});

test("a proven descendant of the deployed source is allowed", () => {
  assert.deepEqual(validateDeployOrder({
    candidateSha: b,
    currentHeadSha: b,
    deployedSha: a,
    comparison: { status: "ahead", ahead_by: 2, base_commit: { sha: a }, merge_base_commit: { sha: a }, head_commit: { sha: b } },
  }), { action: "deploy", reason: "monotonic-upgrade" });
});

test("retired transport inputs cannot reopen a second deployment path", () => {
  assert.throws(() => validateDeployOrder({
    candidateSha: c,
    currentHeadSha: c,
    deployedSha: b,
    candidateTransport: "ssh-hotfix",
  }), /candidateTransport is no longer supported/);
});

test("same source is a no-op and stale or divergent candidates are rejected", () => {
  assert.deepEqual(validateDeployOrder({ candidateSha: b, currentHeadSha: b, deployedSha: b }), {
    action: "noop",
    reason: "source-already-deployed",
  });
  assert.throws(() => validateDeployOrder({ candidateSha: a, currentHeadSha: b, deployedSha: b }), /stale/);
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    currentHeadSha: b,
    deployedSha: c,
    comparison: { status: "diverged", ahead_by: 1, base_commit: { sha: c }, merge_base_commit: { sha: a }, head_commit: { sha: b } },
  }), /not a proven descendant/);
});
