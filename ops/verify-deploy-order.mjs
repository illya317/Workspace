#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PUBLISHABLE_EVENTS = new Set(["push", "workflow_dispatch"]);
const SAME_SHA_EVENTS = new Set([...PUBLISHABLE_EVENTS, "schedule"]);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireRunId(value, label) {
  if (!Number.isInteger(Number(value)) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(value);
}

function verifyBranchProtectionContract(protection, requiredJob, requiredCheckAppId) {
  if (!requiredJob || !/^[A-Za-z0-9 ._/-]+$/.test(requiredJob)) {
    throw new Error("required job name is invalid");
  }
  const normalizedCheckAppId = requireRunId(requiredCheckAppId, "required check app id");
  const checks = protection?.required_status_checks?.checks ?? [];
  const exactChecks = checks.filter((check) => (
    check?.context === requiredJob && Number(check?.app_id) === normalizedCheckAppId
  ));
  const legacyContexts = protection?.required_status_checks?.contexts ?? [];
  const bypass = protection?.required_pull_request_reviews?.bypass_pull_request_allowances;
  const noPullRequestBypass = bypass
    && [bypass.users, bypass.teams, bypass.apps]
      .every((actors) => Array.isArray(actors) && actors.length === 0);
  if (protection?.required_status_checks?.strict !== true
    || exactChecks.length !== 1
    || legacyContexts.includes(requiredJob)
    || protection?.enforce_admins?.enabled !== true
    || !protection?.required_pull_request_reviews
    || protection.required_pull_request_reviews.require_code_owner_reviews !== true
    || protection.required_pull_request_reviews.dismiss_stale_reviews !== true
    || protection.required_pull_request_reviews.require_last_push_approval !== false
    || !noPullRequestBypass
    || protection?.required_linear_history?.enabled !== true
    || protection?.allow_force_pushes?.enabled !== false
    || protection?.allow_deletions?.enabled !== false
    || protection?.required_conversation_resolution?.enabled !== true) {
    throw new Error("protected branch policy is weaker than the production release contract");
  }
}

export function validateDeployOrder({
  candidateSha,
  candidateRunId,
  candidateRunAttempt,
  candidateArtifactDigest,
  currentHeadSha,
  bootstrapBase,
  deployedSha,
  deployedRunId,
  deployedRunAttempt,
  deployedArtifactDigest,
  comparison,
}) {
  requireSha(candidateSha, "candidate SHA");
  const normalizedCandidateRunId = requireRunId(candidateRunId, "candidate run id");
  const normalizedCandidateRunAttempt = requireRunId(candidateRunAttempt, "candidate run attempt");
  if (!DIGEST_PATTERN.test(candidateArtifactDigest ?? "")) throw new Error("candidate artifact digest is invalid");
  requireSha(currentHeadSha, "current protected-main SHA");
  if (candidateSha !== currentHeadSha) {
    throw new Error(`candidate ${candidateSha} is stale; protected main is ${currentHeadSha}`);
  }
  if (bootstrapBase) {
    requireSha(bootstrapBase, "production bootstrap baseline");
    if (deployedSha) throw new Error("production bootstrap evidence is forbidden after a deployed record exists");
    if (!comparison
      || !["ahead", "identical"].includes(comparison.status)
      || comparison.base_commit?.sha !== bootstrapBase
      || comparison.merge_base_commit?.sha !== bootstrapBase
      || comparison.head_commit?.sha !== candidateSha
      || !Number.isInteger(comparison.ahead_by)
      || comparison.ahead_by < 0) {
      throw new Error(`candidate ${candidateSha} is not proven to descend from bootstrap baseline ${bootstrapBase}`);
    }
    return { action: "deploy", reason: "audited-production-bootstrap" };
  }
  if (!deployedSha) throw new Error("initial deployment requires audited production bootstrap evidence");
  requireSha(deployedSha, "deployed SHA");
  const normalizedDeployedRunId = requireRunId(deployedRunId, "deployed run id");
  const normalizedDeployedRunAttempt = requireRunId(deployedRunAttempt, "deployed run attempt");
  if (!DIGEST_PATTERN.test(deployedArtifactDigest ?? "")) throw new Error("deployed artifact digest is invalid");
  if (deployedSha === candidateSha) {
    if (normalizedCandidateRunId === normalizedDeployedRunId
      && normalizedCandidateRunAttempt === normalizedDeployedRunAttempt) {
      if (candidateArtifactDigest !== deployedArtifactDigest) {
        throw new Error("same source/run record has a different artifact digest");
      }
      return { action: "noop", reason: "exact-artifact-already-deployed" };
    }
    if (normalizedCandidateRunId > normalizedDeployedRunId
      || (normalizedCandidateRunId === normalizedDeployedRunId
        && normalizedCandidateRunAttempt > normalizedDeployedRunAttempt)) {
      return { action: "deploy", reason: "newer-run-attempt-for-same-source" };
    }
    throw new Error(`candidate run ${normalizedCandidateRunId}/${normalizedCandidateRunAttempt} is older than deployed run ${normalizedDeployedRunId}/${normalizedDeployedRunAttempt} for ${candidateSha}`);
  }
  if (!comparison || comparison.status !== "ahead"
    || comparison.base_commit?.sha !== deployedSha
    || comparison.merge_base_commit?.sha !== deployedSha
    || comparison.head_commit?.sha !== candidateSha
    || !Number.isInteger(comparison.ahead_by)
    || comparison.ahead_by < 1) {
    throw new Error(`candidate ${candidateSha} is not a proven descendant of deployed ${deployedSha}`);
  }
  return { action: "deploy", reason: "monotonic-upgrade" };
}

async function githubJson(url, fetchImpl) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    headers,
  });
  if (!response.ok) throw new Error(`GitHub API ${url} failed with HTTP ${response.status}`);
  return response.json();
}

export async function verifyRemoteDeployOrder({
  repository,
  branch,
  candidateSha,
  candidateRunId,
  candidateRunAttempt,
  candidateArtifactDigest,
  candidateEvent,
  workflowName,
  workflowPath,
  requiredJob,
  requiredCheckAppId,
  deployedSha,
  deployedRunId,
  deployedRunAttempt,
  deployedArtifactDigest,
  bootstrapBase,
  fetchImpl = fetch,
}) {
  if (!REPOSITORY_PATTERN.test(repository ?? "")) throw new Error("repository must be owner/name");
  if (!/^[A-Za-z0-9._/-]+$/.test(branch ?? "") || branch.includes("..")) {
    throw new Error("branch contains unsafe characters");
  }
  requireSha(candidateSha, "candidate SHA");
  if (!PUBLISHABLE_EVENTS.has(candidateEvent)) throw new Error("candidate event must be push or workflow_dispatch");
  if (!workflowName || !/^[A-Za-z0-9 ._/-]+$/.test(workflowName)) throw new Error("workflow name is invalid");
  if (!workflowPath || !/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(workflowPath)) {
    throw new Error("workflow path is invalid");
  }
  if (deployedSha) requireSha(deployedSha, "deployed SHA");
  const root = `https://api.github.com/repos/${repository}`;
  const branchState = await githubJson(`${root}/branches/${encodeURIComponent(branch)}`, fetchImpl);
  if (branchState?.protected !== true) {
    throw new Error(`protected branch ${branch} no longer has branch protection enabled`);
  }
  const currentHeadSha = requireSha(branchState?.commit?.sha, "GitHub branch head");
  const protection = await githubJson(`${root}/branches/${encodeURIComponent(branch)}/protection`, fetchImpl);
  verifyBranchProtectionContract(protection, requiredJob, requiredCheckAppId);
  const runsQuery = new URLSearchParams({ branch, head_sha: candidateSha, per_page: "100" });
  const runsState = await githubJson(`${root}/actions/runs?${runsQuery}`, fetchImpl);
  const latestSameShaRun = (runsState?.workflow_runs ?? [])
    .filter((run) => run?.name === workflowName
      && run?.path === workflowPath
      && SAME_SHA_EVENTS.has(run?.event)
      && run?.head_branch === branch
      && run?.head_sha === candidateSha)
    .sort((left, right) => Number(right.id) - Number(left.id)
      || Number(right.run_attempt ?? 1) - Number(left.run_attempt ?? 1))[0];
  if (!latestSameShaRun
    || latestSameShaRun.event !== candidateEvent
    || Number(latestSameShaRun.id) !== Number(candidateRunId)
    || Number(latestSameShaRun.run_attempt ?? 1) !== Number(candidateRunAttempt)
    || latestSameShaRun.status !== "completed"
    || latestSameShaRun.conclusion !== "success") {
    throw new Error(
      `candidate CI ${candidateRunId}/${candidateRunAttempt} is no longer the latest successful same-SHA run`
      + ` (latest ${latestSameShaRun?.id ?? "missing"}/${latestSameShaRun?.run_attempt ?? "missing"}`
      + ` ${latestSameShaRun?.status ?? "missing"}/${latestSameShaRun?.conclusion ?? "none"})`,
    );
  }
  let comparison = null;
  if (bootstrapBase) {
    requireSha(bootstrapBase, "production bootstrap baseline");
    comparison = await githubJson(`${root}/compare/${bootstrapBase}...${candidateSha}`, fetchImpl);
  } else if (deployedSha && deployedSha !== candidateSha) {
    comparison = await githubJson(`${root}/compare/${deployedSha}...${candidateSha}`, fetchImpl);
  }
  return validateDeployOrder({
    candidateSha,
    candidateRunId,
    candidateRunAttempt,
    candidateArtifactDigest,
    currentHeadSha,
    bootstrapBase,
    deployedSha,
    deployedRunId,
    deployedRunAttempt,
    deployedArtifactDigest,
    comparison,
  });
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const result = await verifyRemoteDeployOrder({
    repository: options.repository,
    branch: options.branch,
    candidateSha: options.candidate,
    candidateRunId: options.candidate_run_id,
    candidateRunAttempt: options.candidate_run_attempt,
    candidateArtifactDigest: options.candidate_artifact_digest,
    candidateEvent: options.candidate_event,
    workflowName: options.workflow_name,
    workflowPath: options.workflow_path,
    requiredJob: options.required_job,
    requiredCheckAppId: options.required_check_app_id,
    bootstrapBase: options.bootstrap_base,
    deployedSha: options.deployed,
    deployedRunId: options.deployed_run_id,
    deployedRunAttempt: options.deployed_run_attempt,
    deployedArtifactDigest: options.deployed_artifact_digest,
  });
  process.stdout.write(`${result.action}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
