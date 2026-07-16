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
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
  }), /requires audited production bootstrap evidence/);
});

test("audited production bootstrap allows identical or ahead candidates only", () => {
  for (const [bootstrapBase, comparison] of [
    [b, {
      status: "identical",
      ahead_by: 0,
      base_commit: { sha: b },
      merge_base_commit: { sha: b },
      head_commit: { sha: b },
    }],
    [a, {
      status: "ahead",
      ahead_by: 2,
      base_commit: { sha: a },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    }],
  ]) {
    assert.deepEqual(validateDeployOrder({
      candidateSha: b,
      candidateRunId: 20,
      candidateRunAttempt: 1,
      candidateArtifactDigest: digestB,
      currentHeadSha: b,
      bootstrapBase,
      comparison,
    }), { action: "deploy", reason: "audited-production-bootstrap" });
  }

  for (const comparison of [
    {
      status: "behind",
      ahead_by: 0,
      base_commit: { sha: a },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    },
    {
      status: "diverged",
      ahead_by: 1,
      base_commit: { sha: a },
      merge_base_commit: { sha: c },
      head_commit: { sha: b },
    },
  ]) {
    assert.throws(() => validateDeployOrder({
      candidateSha: b,
      candidateRunId: 20,
      candidateRunAttempt: 1,
      candidateArtifactDigest: digestB,
      currentHeadSha: b,
      bootstrapBase: a,
      comparison,
    }), /not proven to descend from bootstrap baseline/);
  }
});

test("a proven descendant of the deployed release is allowed", () => {
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: a,
    deployedRunId: 10,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestA,
    comparison: {
      status: "ahead",
      ahead_by: 2,
      base_commit: { sha: a },
      merge_base_commit: { sha: a },
      head_commit: { sha: b },
    },
  }).action, "deploy");
});

test("same-SHA runs are monotonic and only the exact artifact is a no-op", () => {
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 20,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestB,
  }).action, "noop");
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 20,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestA,
  }), /same source\/run record has a different artifact digest/);
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateRunId: 21,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 20,
    deployedRunAttempt: 3,
    deployedArtifactDigest: digestA,
  }).action, "deploy");
  assert.equal(validateDeployOrder({
    candidateSha: b,
    candidateRunId: 21,
    candidateRunAttempt: 2,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 21,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestA,
  }).action, "deploy");
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateRunId: 19,
    candidateRunAttempt: 9,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 20,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestB,
  }), /older than deployed run/);
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 20,
    deployedRunAttempt: 2,
    deployedArtifactDigest: digestB,
  }), /older than deployed run/);
});

test("late A cannot roll production back after B became main or deployed", () => {
  assert.throws(() => validateDeployOrder({
    candidateSha: a,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestA,
    currentHeadSha: b,
    deployedSha: b,
    deployedRunId: 21,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestB,
  }), /stale/);
  assert.throws(() => validateDeployOrder({
    candidateSha: b,
    candidateRunId: 20,
    candidateRunAttempt: 1,
    candidateArtifactDigest: digestB,
    currentHeadSha: b,
    deployedSha: c,
    deployedRunId: 19,
    deployedRunAttempt: 1,
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
