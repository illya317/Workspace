import assert from "node:assert/strict";
import test from "node:test";

import { validateDeployOrder, verifyRemoteDeployOrder } from "./verify-deploy-order.mjs";

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const digestA = `sha256:${"1".repeat(64)}`;
const digestB = `sha256:${"2".repeat(64)}`;
const remoteCandidate = {
  repository: "acme/workspace",
  branch: "main",
  candidateSha: b,
  candidateRunId: 20,
  candidateRunAttempt: 1,
  candidateArtifactDigest: digestB,
  candidateEvent: "push",
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  requiredJob: "CI / required",
  requiredCheckAppId: 15368,
};

function workflowRun(overrides = {}) {
  return {
    id: 20,
    run_attempt: 1,
    event: "push",
    name: "CI",
    path: ".github/workflows/ci.yml",
    head_branch: "main",
    head_sha: b,
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

function branchProtection(overrides = {}) {
  return {
    required_status_checks: {
      strict: true,
      contexts: [],
      checks: [{ context: "CI / required", app_id: 15368 }],
    },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      require_code_owner_reviews: true,
      dismiss_stale_reviews: true,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
    ...overrides,
  };
}

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

test("remote verifier binds the live branch and exact comparison", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    let body;
    if (url.endsWith("/branches/main/protection")) body = branchProtection();
    else if (url.includes("/branches/")) body = { protected: true, commit: { sha: b } };
    else if (url.includes("/actions/runs?")) body = { workflow_runs: [workflowRun()] };
    else {
      body = {
          status: "ahead",
          ahead_by: 1,
          base_commit: { sha: a },
          merge_base_commit: { sha: a },
          head_commit: { sha: b },
      };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await verifyRemoteDeployOrder({
    ...remoteCandidate,
    deployedSha: a,
    deployedRunId: 10,
    deployedRunAttempt: 1,
    deployedArtifactDigest: digestA,
    fetchImpl,
  });
  assert.equal(result.action, "deploy");
  assert.equal(calls.length, 4);
});

test("remote verifier fetches the production bootstrap comparison", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    let body;
    if (url.endsWith("/branches/main/protection")) body = branchProtection();
    else if (url.includes("/branches/")) body = { protected: true, commit: { sha: b } };
    else if (url.includes("/actions/runs?")) body = { workflow_runs: [workflowRun()] };
    else if (url.endsWith(`/compare/${a}...${b}`)) {
      body = {
        status: "ahead",
        ahead_by: 1,
        base_commit: { sha: a },
        merge_base_commit: { sha: a },
        head_commit: { sha: b },
      };
    } else throw new Error(`unexpected URL ${url}`);
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await verifyRemoteDeployOrder({
    ...remoteCandidate,
    bootstrapBase: a,
    fetchImpl,
  });
  assert.deepEqual(result, { action: "deploy", reason: "audited-production-bootstrap" });
  assert.equal(calls.length, 4);
  assert.match(calls[3], new RegExp(`/compare/${a}\\.\\.\\.${b}$`));
});

test("remote verifier rejects evidence superseded by a newer failed or in-progress same-SHA run", async () => {
  for (const latest of [
    workflowRun({ id: 21, event: "schedule", status: "completed", conclusion: "failure" }),
    workflowRun({ id: 21, event: "workflow_dispatch", status: "in_progress", conclusion: null }),
  ]) {
    const fetchImpl = async (url) => {
      let body;
      if (url.endsWith("/branches/main/protection")) body = branchProtection();
      else if (url.includes("/branches/")) body = { protected: true, commit: { sha: b } };
      else if (url.includes("/actions/runs?")) body = { workflow_runs: [latest, workflowRun()] };
      else throw new Error(`unexpected URL ${url}`);
      return { ok: true, status: 200, json: async () => body };
    };
    await assert.rejects(
      () => verifyRemoteDeployOrder({ ...remoteCandidate, fetchImpl }),
      /no longer the latest successful same-SHA run/,
    );
  }
});

test("remote verifier fails closed if branch protection drifted after evidence creation", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ protected: false, commit: { sha: b } }),
  });
  await assert.rejects(() => verifyRemoteDeployOrder({
    ...remoteCandidate,
    fetchImpl,
  }), /no longer has branch protection/);
});

test("remote verifier fails closed if the detailed branch policy is weaker", async () => {
  const fetchImpl = async (url) => {
    let body;
    if (url.endsWith("/branches/main/protection")) {
      body = branchProtection({ allow_force_pushes: { enabled: true } });
    } else if (url.includes("/branches/")) {
      body = { protected: true, commit: { sha: b } };
    } else {
      throw new Error(`unexpected URL ${url}`);
    }
    return { ok: true, status: 200, json: async () => body };
  };
  await assert.rejects(() => verifyRemoteDeployOrder({
    ...remoteCandidate,
    fetchImpl,
  }), /policy is weaker than the production release contract/);
});
