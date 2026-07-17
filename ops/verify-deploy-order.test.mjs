import assert from "node:assert/strict";
import test from "node:test";

import { validateDeployOrder } from "./verify-deploy-order.mjs";

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const digestA = `sha256:${"1".repeat(64)}`;
const digestB = `sha256:${"2".repeat(64)}`;

test("missing deployed state requires audited production bootstrap evidence", () => {
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
  }), /requires audited production bootstrap evidence/);
});

test("audited production bootstrap allows identical or ahead candidates only", () => {
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    bootstrapBase: a,
    comparison: {
      status: "ahead",
      ahead_by: 2,
      base_commit: { sha: a },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    },
  }).action, "deploy");
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    bootstrapBase: a,
    comparison: {
      status: "diverged",
      ahead_by: 1,
      base_commit: { sha: a },
      merge_base_commit: { sha: c },
      head_commit: { sha: b },
    },
  }), /not proven to descend/);
});

test("a proven descendant deploys and the same source is a no-op", () => {
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: a,
    deployedArtifactDigest: digestA,
    comparison: {
      status: "ahead",
      ahead_by: 2,
      base_commit: { sha: a },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    },
  }).action, "deploy");
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedArtifactDigest: digestA,
  }).action, "noop");
});

test("late or diverged candidates cannot roll production back", () => {
  assert.throws(() => validateDeployOrder({
    candidateSha: a,
    candidateArtifactDigest: digestA,
    currentHeadSha: b,
    deployedSha: b,
    deployedArtifactDigest: digestB,
  }), /stale/);
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: c,
    deployedArtifactDigest: digestA,
    comparison: {
      status: "diverged",
      ahead_by: 1,
      base_commit: { sha: c },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    },
  }), /not a proven descendant/);
});
