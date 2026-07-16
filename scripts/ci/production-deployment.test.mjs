import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeploymentPayload,
  buildStatusPayload,
  deploymentMatchesEvidence,
  selectDeploymentForReconciliation,
} from "./production-deployment.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

test("production deployment record binds exact source, CI run, and artifact digest", () => {
  const payload = buildDeploymentPayload({ sha, runId: 42, runAttempt: 2, artifactDigest: digest });
  assert.equal(payload.ref, sha);
  assert.equal(payload.environment, "production");
  assert.equal(payload.auto_merge, false);
  assert.deepEqual(payload.required_contexts, []);
  assert.deepEqual(payload.payload, {
    sourceSha: sha,
    githubRunId: 42,
    githubRunAttempt: 2,
    artifactDigest: digest,
  });
});

test("production status cleanup is explicit because GitHub does not auto-inactivate production environments", () => {
  assert.deepEqual(buildStatusPayload({ state: "success", description: "deployed" }), {
    state: "success",
    description: "deployed",
    auto_inactive: false,
  });
  assert.equal(buildStatusPayload({ state: "in_progress", description: "deploying" }).auto_inactive, false);
});

test("deployment records reject weak identities and unknown states", () => {
  assert.throws(() => buildDeploymentPayload({ sha: "main", runId: 42, runAttempt: 1, artifactDigest: digest }), /full lowercase/);
  assert.throws(() => buildDeploymentPayload({ sha, runId: 0, runAttempt: 1, artifactDigest: digest }), /positive integer/);
  assert.throws(() => buildDeploymentPayload({ sha, runId: 42, runAttempt: 0, artifactDigest: digest }), /positive integer/);
  assert.throws(() => buildDeploymentPayload({ sha, runId: 42, runAttempt: 1, artifactDigest: "b".repeat(64) }), /sha256/);
  assert.throws(() => buildStatusPayload({ state: "done", description: "deployed" }), /unsupported/);
});

test("reconciliation reuses success or an unfinished deployment without reviving failures", () => {
  const evidence = { sha, runId: 42, runAttempt: 2, artifactDigest: digest };
  const payload = { sourceSha: sha, githubRunId: 42, githubRunAttempt: 2, artifactDigest: digest };
  assert.deepEqual(selectDeploymentForReconciliation([
    { id: 1, state: "failure", payload },
    { id: 2, state: "in_progress", payload },
    { id: 3, state: "success", payload },
  ], evidence), { id: 3, state: "success", payload });
  assert.deepEqual(selectDeploymentForReconciliation([
    { id: 1, state: "failure", payload },
    { id: 2, state: null, payload },
  ], evidence), { id: 2, state: null, payload });
  assert.equal(selectDeploymentForReconciliation([
    { id: 1, state: "failure", payload },
    { id: 2, state: "inactive", payload },
  ], evidence), null);
  assert.equal(deploymentMatchesEvidence({
    payload: { ...payload, githubRunId: 41 },
  }, evidence), false);
  assert.equal(deploymentMatchesEvidence({
    payload: { ...payload, githubRunAttempt: 1 },
  }, evidence), false);
  assert.equal(selectDeploymentForReconciliation([
    { id: 3, state: "success", payload: { ...payload, artifactDigest: `sha256:${"c".repeat(64)}` } },
  ], evidence), null);
});
