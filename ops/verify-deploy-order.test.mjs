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

test("SSH hotfixes advance from the running source", () => {
  assert.deepEqual(validateDeployOrder({
    candidateSha: c,
    currentHeadSha: c,
    candidateTransport: "ssh-hotfix",
    deployedSha: b,
    deployedCanonicalSha: a,
    deployedTransport: "ssh-hotfix",
    comparison: { status: "ahead", ahead_by: 1, base_commit: { sha: b }, merge_base_commit: { sha: b }, head_commit: { sha: c } },
  }), { action: "deploy", reason: "hotfix-monotonic-upgrade" });
});

test("formal CNB deployment replaces a hotfix from the canonical baseline", () => {
  for (const [candidateSha, comparison] of [
    [a, undefined],
    [c, { status: "ahead", ahead_by: 1, base_commit: { sha: a }, merge_base_commit: { sha: a }, head_commit: { sha: c } }],
  ]) {
    assert.deepEqual(validateDeployOrder({
      candidateSha,
      currentHeadSha: candidateSha,
      candidateTransport: "cnb",
      deployedSha: b,
      deployedCanonicalSha: a,
      deployedTransport: "ssh-hotfix",
      comparison,
    }), { action: "deploy", reason: "formal-replaces-hotfix" });
  }
});

test("formal CNB deployment does not need to descend from the temporary hotfix", () => {
  assert.deepEqual(validateDeployOrder({
    candidateSha: c,
    currentHeadSha: c,
    candidateTransport: "cnb",
    deployedSha: b,
    deployedCanonicalSha: a,
    deployedTransport: "ssh-hotfix",
    comparison: { status: "ahead", ahead_by: 1, base_commit: { sha: a }, merge_base_commit: { sha: a }, head_commit: { sha: c } },
  }), { action: "deploy", reason: "formal-replaces-hotfix" });
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
