#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STATES = new Set(["error", "failure", "inactive", "in_progress", "queued", "pending", "success"]);

function requireSha(value) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error("--sha must be a full lowercase Git SHA");
  return value;
}

function requireRepository(value) {
  if (!REPOSITORY_PATTERN.test(value ?? "")) throw new Error("--repository must be owner/name");
  return value;
}

function requirePositiveInteger(value, label) {
  if (!/^\d+$/.test(value ?? "") || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function parseArguments(argv) {
  const [command, ...values] = argv;
  const options = { command };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = values[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

export function buildDeploymentPayload({ sha, environment = "production", runId, runAttempt, artifactDigest }) {
  requireSha(sha);
  requirePositiveInteger(String(runId), "runId");
  requirePositiveInteger(String(runAttempt), "runAttempt");
  if (!/^sha256:[0-9a-f]{64}$/.test(artifactDigest ?? "")) {
    throw new Error("artifactDigest must be a sha256: digest");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(environment)) throw new Error("environment contains unsafe characters");
  return {
    ref: sha,
    task: "deploy",
    auto_merge: false,
    required_contexts: [],
    environment,
    description: `Workspace ${sha.slice(0, 12)} production deployment`,
    transient_environment: false,
    production_environment: true,
    payload: {
      sourceSha: sha,
      githubRunId: Number(runId),
      githubRunAttempt: Number(runAttempt),
      artifactDigest,
    },
  };
}

export function buildStatusPayload({ state, description }) {
  if (!STATES.has(state)) throw new Error(`unsupported deployment state: ${state}`);
  if (typeof description !== "string" || description.length < 1 || description.length > 140) {
    throw new Error("description must contain 1-140 characters");
  }
  return {
    state,
    description,
    auto_inactive: false,
  };
}

function ghApi(repository, endpoint, { method = "GET", payload } = {}) {
  const args = [
    "api",
    "--method", method,
    `repos/${repository}${endpoint}`,
  ];
  if (payload !== undefined) args.push("--input", "-");
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input: payload === undefined ? undefined : `${JSON.stringify(payload)}\n`,
  });
  if (result.error?.code === "ENOENT") throw new Error("gh CLI is required");
  if (result.status !== 0) throw new Error(result.stderr.trim() || `gh api failed with ${result.status}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("gh api did not return JSON");
  }
}

function createDeployment(repository, payload) {
  const deployment = ghApi(repository, "/deployments", { method: "POST", payload });
  return requirePositiveInteger(String(deployment?.id), "GitHub deployment id");
}

function createStatus(repository, deploymentId, payload) {
  const status = ghApi(repository, `/deployments/${deploymentId}/statuses`, { method: "POST", payload });
  if (!Number.isInteger(status?.id) || status.id < 1 || status.state !== payload.state) {
    throw new Error("GitHub deployment status response is invalid");
  }
  return status.id;
}

export function deploymentMatchesEvidence(record, { sha, runId, runAttempt, artifactDigest }) {
  return record?.payload?.sourceSha === sha
    && Number(record.payload.githubRunId) === Number(runId)
    && Number(record.payload.githubRunAttempt) === Number(runAttempt)
    && record.payload.artifactDigest === artifactDigest;
}

export function selectDeploymentForReconciliation(records, evidence) {
  const sorted = records
    .filter((record) => deploymentMatchesEvidence(record, evidence))
    .sort((left, right) => Number(right.id) - Number(left.id));
  return sorted.find((record) => record.state === "success")
    ?? sorted.find((record) => [null, "pending", "queued", "in_progress"].includes(record.state))
    ?? null;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const repository = requireRepository(options.repository);
  if (options.command === "create") {
    const payload = buildDeploymentPayload({
      sha: options.sha,
      environment: options.environment ?? "production",
      runId: options.run_id,
      runAttempt: options.run_attempt,
      artifactDigest: options.artifact_digest,
    });
    const deploymentId = createDeployment(repository, payload);
    process.stdout.write(`${deploymentId}\n`);
    return;
  }
  if (options.command === "status") {
    const deploymentId = requirePositiveInteger(options.deployment_id, "--deployment-id");
    const payload = buildStatusPayload({ state: options.state, description: options.description });
    process.stdout.write(`${createStatus(repository, deploymentId, payload)}\n`);
    return;
  }
  if (options.command === "reconcile-success") {
    const deploymentPayload = buildDeploymentPayload({
      sha: options.sha,
      environment: options.environment ?? "production",
      runId: options.run_id,
      runAttempt: options.run_attempt,
      artifactDigest: options.artifact_digest,
    });
    const deployments = ghApi(repository, `/deployments?environment=${encodeURIComponent(deploymentPayload.environment)}&sha=${options.sha}&per_page=100`);
    if (!Array.isArray(deployments)) throw new Error("GitHub deployments response must be an array");
    const records = deployments.map((deployment) => {
      const id = requirePositiveInteger(String(deployment?.id), "GitHub deployment id");
      const statuses = ghApi(repository, `/deployments/${id}/statuses?per_page=1`);
      if (!Array.isArray(statuses)) throw new Error(`GitHub deployment ${id} statuses must be an array`);
      return { id, state: statuses[0]?.state ?? null, payload: deployment.payload };
    });
    const selected = selectDeploymentForReconciliation(records, {
      sha: options.sha,
      runId: options.run_id,
      runAttempt: options.run_attempt,
      artifactDigest: options.artifact_digest,
    });
    const deploymentId = selected?.id ?? createDeployment(repository, deploymentPayload);
    if (selected?.state !== "success") {
      createStatus(repository, deploymentId, buildStatusPayload({
        state: "success",
        description: options.description,
      }));
    }
    process.stdout.write(`${deploymentId}\n`);
    return;
  }
  throw new Error("usage: production-deployment.mjs create|status|reconcile-success [options]");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
