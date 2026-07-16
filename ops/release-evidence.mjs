#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  validateBootstrapContext,
  verifyBootstrapContext,
} from "../scripts/ci/production-bootstrap-receipt.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_NAME_PATTERN = /^[A-Za-z0-9_. /:@+-]+$/;

function fail(message) {
  process.stderr.write(`[release-evidence] ${message}\n`);
  process.exit(1);
}

function parseArgs(values) {
  const args = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) fail(`unknown argument: ${key ?? "<empty>"}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`missing value for ${key}`);
    args.set(key.slice(2), value);
    index += 1;
  }
  return args;
}

function required(args, key) {
  const value = args.get(key);
  if (!value) fail(`--${key} is required`);
  return value;
}

function positiveInteger(value, label, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) fail(`${label} must be a positive integer`);
  return Number(value);
}

function nonNegativeInteger(value, label, fallback = 0) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) fail(`${label} must be a non-negative integer`);
  return Number(value);
}

function validateSha(value, label) {
  if (!SHA_PATTERN.test(value)) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function validateSafeName(value, label) {
  if (!SAFE_NAME_PATTERN.test(value) || value.includes("..")) fail(`${label} contains unsafe characters`);
  return value;
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`${label} must be a string array`);
  }
  const normalized = [...new Set(value)].sort();
  if (JSON.stringify(value) !== JSON.stringify(normalized)) fail(`${label} must be unique and sorted`);
  return value;
}

function ghApi(endpoint, fields = {}) {
  const args = ["api", "--method", "GET", endpoint];
  for (const [key, value] of Object.entries(fields)) args.push("-f", `${key}=${value}`);
  const result = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") fail("gh CLI is required to verify remote CI evidence");
  if (result.status !== 0) {
    const detail = (result.stderr || "GitHub API request failed").trim().split("\n").at(-1);
    fail(`GitHub API request failed for ${endpoint}: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`GitHub API returned invalid JSON for ${endpoint}`);
  }
}

function writeJsonAtomic(path, value) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, absolute);
}

function readBootstrapContext(filePath) {
  try {
    return validateBootstrapContext(JSON.parse(readFileSync(resolve(filePath), "utf8")));
  } catch (error) {
    fail(`invalid production bootstrap context: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadEvidence(path) {
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    fail(`cannot read release evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (evidence?.schemaVersion !== 1) fail("release evidence schemaVersion must be 1");
  if (evidence.deploymentBootstrap !== undefined) {
    try {
      validateBootstrapContext(evidence.deploymentBootstrap);
    } catch (error) {
      fail(`invalid production bootstrap evidence: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const sourceSha = validateSha(evidence?.source?.commitSha, "evidence source commit");
  const sourceTree = validateSha(evidence?.source?.treeSha, "evidence source tree");
  const github = evidence?.github;
  if (!github || !["push", "workflow_dispatch"].includes(github.event)) {
    fail("release evidence must come from a push or trusted workflow_dispatch workflow");
  }
  if (!github.branch || !github.branchProtected) fail("release evidence branch must be protected");
  if (github.headSha !== sourceSha) fail("release evidence workflow SHA does not match source SHA");
  if (!Number.isInteger(github.runId) || github.runId < 1) fail("release evidence runId is invalid");
  if (!Number.isInteger(github.runAttempt) || github.runAttempt < 1) fail("release evidence runAttempt is invalid");
  if (!Number.isInteger(github.requiredJobId) || github.requiredJobId < 1) fail("release evidence requiredJobId is invalid");
  if (!Number.isInteger(github.requiredCheckAppId) || github.requiredCheckAppId < 1) {
    fail("release evidence requiredCheckAppId is invalid");
  }
  if (!Number.isInteger(github.artifactId) || github.artifactId < 1) fail("release evidence artifactId is invalid");
  if (!DIGEST_PATTERN.test(github.artifactDigest)) fail("release evidence artifact digest is invalid");
  validateSafeName(github.repository, "evidence repository");
  validateSafeName(github.branch, "evidence branch");
  validateSafeName(github.workflowName, "evidence workflow name");
  validateSafeName(github.workflowPath, "evidence workflow path");
  validateSafeName(github.requiredJobName, "evidence required job name");
  validateSafeName(github.artifactName, "evidence artifact name");
  const protection = github.branchProtection;
  if (protection?.strict !== true
    || protection?.enforceAdmins !== true
    || protection?.pullRequestReviewsRequired !== true
    || protection?.codeOwnerReviewsRequired !== true
    || protection?.staleReviewsDismissed !== true
    || protection?.lastPushApprovalRequired !== false
    || protection?.pullRequestBypassAllowed !== false
    || protection?.linearHistoryRequired !== true
    || protection?.allowForcePushes !== false
    || protection?.allowDeletions !== false
    || protection?.conversationResolutionRequired !== true
    || protection?.requiredCheckContext !== github.requiredJobName
    || protection?.requiredCheckAppId !== github.requiredCheckAppId) {
    fail("release evidence branch protection proof is invalid");
  }
  if (github.release === null || github.release === undefined) {
    fail("release evidence requires a digest-pinned prerelease bridge");
  }
  {
    const release = github.release;
    if (release.tagName !== `ci-artifact-${sourceSha}-run-${github.runId}-attempt-${github.runAttempt}`) {
      fail("release evidence tag does not bind the exact source SHA and workflow run attempt");
    }
    if (!Number.isInteger(release.id) || release.id < 1) fail("release evidence prerelease id is invalid");
    if (release.prerelease !== true || release.draft !== false) fail("release evidence must reference a published prerelease");
    if (release.commitSha !== sourceSha) fail("release evidence prerelease tag does not resolve to source SHA");
    validateSafeName(release.tagName, "evidence prerelease tag");
    for (const [kind, asset] of [["artifact", release.artifact], ["manifest", release.manifest]]) {
      if (!Number.isInteger(asset?.id) || asset.id < 1) fail(`release evidence ${kind} asset id is invalid`);
      if (!DIGEST_PATTERN.test(asset?.digest)) fail(`release evidence ${kind} asset digest is invalid`);
      validateSafeName(asset?.name, `evidence ${kind} asset name`);
      let url;
      try {
        url = new URL(asset.browserDownloadUrl);
      } catch {
        fail(`release evidence ${kind} asset URL is invalid`);
      }
      if (url.protocol !== "https:" || url.hostname !== "github.com") {
        fail(`release evidence ${kind} asset URL must be an HTTPS github.com release URL`);
      }
      const [owner, repository, releases, download, tagName, assetName, ...extra] = url.pathname
        .split("/")
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
      if (`${owner}/${repository}` !== github.repository
        || releases !== "releases"
        || download !== "download"
        || tagName !== release.tagName
        || assetName !== asset.name
        || extra.length !== 0) {
        fail(`release evidence ${kind} asset URL does not match the pinned repository, tag, and asset`);
      }
    }
  }
  if (evidence.deploymentBootstrap !== undefined && github.event !== "workflow_dispatch") {
    fail("production bootstrap evidence must come from a fresh workflow_dispatch run");
  }
  return { evidence, sourceSha, sourceTree, github };
}

function resolveTagCommit(repository, tagName) {
  let object = ghApi(`repos/${repository}/git/ref/tags/${encodeURIComponent(tagName)}`)?.object;
  for (let depth = 0; depth < 5 && object?.type === "tag"; depth += 1) {
    object = ghApi(`repos/${repository}/git/tags/${object.sha}`)?.object;
  }
  if (object?.type !== "commit" || !SHA_PATTERN.test(object.sha)) {
    fail(`prerelease tag ${tagName} does not resolve to a Git commit`);
  }
  return object.sha;
}

function selectReleaseAsset(release, name, label) {
  const matches = (release?.assets ?? []).filter((asset) => asset.name === name);
  if (matches.length !== 1) fail(`expected exactly one ${label} release asset named ${name}, found ${matches.length}`);
  const asset = matches[0];
  if (asset.state !== "uploaded") fail(`${label} release asset ${name} is not uploaded`);
  if (!DIGEST_PATTERN.test(asset.digest)) fail(`${label} release asset ${name} has no trusted SHA-256 digest`);
  return {
    id: Number(asset.id),
    name: asset.name,
    digest: asset.digest,
    sizeBytes: Number(asset.size ?? 0),
    browserDownloadUrl: asset.browser_download_url,
  };
}

function requiredCheckRun(repository, requiredJob, requiredJobName, sourceSha) {
  let checkRunPath;
  try {
    const url = new URL(requiredJob.check_run_url);
    if (url.protocol !== "https:" || url.hostname !== "api.github.com") throw new Error("unexpected check-run host");
    checkRunPath = url.pathname.replace(/^\//, "");
  } catch {
    fail(`required job ${requiredJobName} has no trusted GitHub check-run URL`);
  }
  const checkRun = ghApi(checkRunPath);
  if (checkRun?.name !== requiredJobName
    || checkRun?.head_sha !== sourceSha
    || checkRun?.status !== "completed"
    || checkRun?.conclusion !== "success"
    || checkRun?.app?.slug !== "github-actions"
    || !Number.isInteger(checkRun?.app?.id)
    || checkRun.app.id < 1) {
    fail(`required job ${requiredJobName} is not a successful GitHub Actions check for ${sourceSha}`);
  }
  const expectedPrefix = `repos/${repository}/check-runs/`;
  if (!checkRunPath.startsWith(expectedPrefix)) fail("required check-run does not belong to the release repository");
  return checkRun;
}

function verifyBranchProtection(repository, branch, sourceSha, requiredJobName, requiredCheckAppId) {
  const branchState = ghApi(`repos/${repository}/branches/${encodeURIComponent(branch)}`);
  if (branchState?.protected !== true) fail(`${repository}:${branch} is not protected; production release is blocked`);
  if (branchState?.commit?.sha !== sourceSha) {
    fail(`protected branch head ${branchState?.commit?.sha ?? "<missing>"} does not match release SHA ${sourceSha}`);
  }
  const protection = ghApi(`repos/${repository}/branches/${encodeURIComponent(branch)}/protection`);
  const checks = protection?.required_status_checks?.checks ?? [];
  const exactChecks = checks.filter((check) => check.context === requiredJobName && check.app_id === requiredCheckAppId);
  const bypass = protection?.required_pull_request_reviews?.bypass_pull_request_allowances;
  const noPullRequestBypass = bypass === undefined
    || [bypass.users, bypass.teams, bypass.apps].every((actors) => Array.isArray(actors) && actors.length === 0);
  if (protection?.required_status_checks?.strict !== true
    || exactChecks.length !== 1
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
    fail(`${repository}:${branch} protection is weaker than the production release policy`);
  }
  return {
    strict: true,
    enforceAdmins: true,
    pullRequestReviewsRequired: true,
    codeOwnerReviewsRequired: true,
    staleReviewsDismissed: true,
    lastPushApprovalRequired: false,
    pullRequestBypassAllowed: false,
    linearHistoryRequired: true,
    allowForcePushes: false,
    allowDeletions: false,
    conversationResolutionRequired: true,
    requiredCheckContext: requiredJobName,
    requiredCheckAppId,
  };
}

function validateReleaseManifest(manifest, { sourceSha, sourceTree, selectedRun, event, releaseEvidence }) {
  const build = manifest?.build;
  if (manifest?.schemaVersion !== 1
    || manifest?.source?.commitSha !== sourceSha
    || manifest?.source?.treeSha !== sourceTree
    || build?.buildId !== sourceSha
    || String(build?.githubRunId) !== String(selectedRun.id)
    || String(build?.githubRunAttempt) !== String(selectedRun.run_attempt ?? 1)
    || build?.githubEventName !== event
    || build?.targetSha !== sourceSha) {
    fail("release manifest does not prove the selected workflow/source identity");
  }
  if (!/^[0-9a-f]{64}$/.test(manifest?.artifact?.sha256 ?? "")
    || manifest.artifact.fileName !== releaseEvidence.artifact.name
    || manifest.artifact.sizeBytes !== releaseEvidence.artifact.sizeBytes
    || `sha256:${manifest.artifact.sha256}` !== releaseEvidence.artifact.digest) {
    fail("release manifest does not match the digest-pinned standalone asset");
  }
  if (event === "workflow_dispatch"
    && (build.riskClass !== "C3" || build.e2eMode !== "full" || build.forceFull !== true)) {
    fail("workflow_dispatch artifact does not prove forced C3/full execution");
  }
  const requiredSuites = validateStringArray(build.requiredSuites, "release manifest required suites");
  const e2eSpecs = validateStringArray(build.e2eSpecs, "release manifest e2e specs");
  if (!build.classification
    || build.classification.schemaVersion !== 1
    || build.classification.riskClass !== build.riskClass
    || build.classification.e2eMode !== build.e2eMode
    || JSON.stringify(build.classification.requiredSuites) !== JSON.stringify(requiredSuites)
    || JSON.stringify(build.classification.e2eSpecs) !== JSON.stringify(e2eSpecs)) {
    fail("release manifest classifier provenance is inconsistent");
  }
}

async function verifyGithub(args) {
  const repository = validateSafeName(required(args, "repository"), "repository");
  const branch = validateSafeName(required(args, "branch"), "branch");
  const sourceSha = validateSha(required(args, "sha"), "source SHA");
  const sourceTree = validateSha(required(args, "tree"), "source tree");
  const workflowName = validateSafeName(required(args, "workflow-name"), "workflow name");
  const workflowPath = validateSafeName(required(args, "workflow-path"), "workflow path");
  const requiredJobName = validateSafeName(required(args, "required-job"), "required job name");
  const requestedArtifactName = args.get("artifact-name");
  const artifactNamePrefix = args.get("artifact-name-prefix");
  if (Boolean(requestedArtifactName) === Boolean(artifactNamePrefix)) {
    fail("production evidence requires exactly one of --artifact-name or --artifact-name-prefix");
  }
  if (requestedArtifactName) validateSafeName(requestedArtifactName, "artifact name");
  if (artifactNamePrefix) validateSafeName(artifactNamePrefix, "artifact name prefix");
  const event = args.get("event") ?? "push";
  if (!["push", "workflow_dispatch"].includes(event)) fail("--event must be push or workflow_dispatch");
  const requestedReleaseTag = args.get("release-tag");
  const releaseTagPrefix = args.get("release-tag-prefix");
  const releaseArtifactName = args.get("release-artifact-name");
  const releaseManifestName = args.get("release-manifest-name");
  if (Boolean(requestedReleaseTag) === Boolean(releaseTagPrefix)) {
    fail("production evidence requires exactly one of --release-tag or --release-tag-prefix");
  }
  if (!releaseArtifactName || !releaseManifestName) {
    fail("production evidence requires --release-artifact-name and --release-manifest-name");
  }
  if (requestedReleaseTag) validateSafeName(requestedReleaseTag, "release tag");
  if (releaseTagPrefix) validateSafeName(releaseTagPrefix, "release tag prefix");
  validateSafeName(releaseArtifactName, "release artifact name");
  validateSafeName(releaseManifestName, "release manifest name");
  const output = required(args, "output");
  let bootstrapContext;
  if (args.has("bootstrap-context")) {
    const candidateContext = readBootstrapContext(args.get("bootstrap-context"));
    try {
      bootstrapContext = verifyBootstrapContext({
        cwd: process.cwd(),
        candidateSha: sourceSha,
        context: candidateContext,
      });
    } catch (error) {
      fail(`production bootstrap context does not match Git history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const timeoutSeconds = positiveInteger(args.get("timeout-seconds"), "timeout", 900);
  const pollSeconds = positiveInteger(args.get("poll-seconds"), "poll interval", 10);
  const minimumRunId = nonNegativeInteger(args.get("minimum-run-id"), "minimum run id");

  const initialBranch = ghApi(`repos/${repository}/branches/${encodeURIComponent(branch)}`);
  if (initialBranch?.protected !== true || initialBranch?.commit?.sha !== sourceSha) {
    fail(`protected branch head must be the exact release SHA ${sourceSha}`);
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  let selectedRun;
  while (Date.now() <= deadline) {
    const response = ghApi(`repos/${repository}/actions/runs`, {
      branch,
      head_sha: sourceSha,
      per_page: "100",
    });
    const candidates = (response?.workflow_runs ?? [])
      .filter((run) => run.name === workflowName
        && run.path === workflowPath
        && ["push", "workflow_dispatch", "schedule"].includes(run.event)
        && run.head_branch === branch
        && run.head_sha === sourceSha)
      .sort((left, right) => Number(right.id) - Number(left.id));
    const latest = candidates.find((run) => run.event === event && Number(run.id) > minimumRunId);
    if (latest?.status === "completed") {
      if (latest.conclusion !== "success") fail(`latest matching workflow run ${latest.id} concluded ${latest.conclusion}`);
      const globalLatest = candidates[0];
      if (Number(globalLatest?.id) !== Number(latest.id)
        || Number(globalLatest?.run_attempt ?? 1) !== Number(latest.run_attempt ?? 1)
        || globalLatest?.status !== "completed"
        || globalLatest?.conclusion !== "success") {
        fail(`workflow run ${latest.id} is superseded by newer same-SHA run ${globalLatest?.id ?? "<missing>"} (${globalLatest?.status ?? "missing"}/${globalLatest?.conclusion ?? "none"})`);
      }
      selectedRun = latest;
      break;
    }
    if (Date.now() + pollSeconds * 1000 > deadline) break;
    process.stderr.write(`[release-evidence] waiting for ${workflowName} ${event} run at ${sourceSha.slice(0, 8)}\n`);
    await new Promise((resolveWait) => setTimeout(resolveWait, pollSeconds * 1000));
  }
  if (!selectedRun) fail(`no successful ${workflowName} ${event} run found for ${sourceSha} before timeout`);
  const selectedRunAttempt = Number(selectedRun.run_attempt ?? 1);
  const artifactName = requestedArtifactName
    ?? `${artifactNamePrefix}${selectedRun.id}-attempt-${selectedRunAttempt}`;
  const releaseTag = requestedReleaseTag
    ?? `${releaseTagPrefix}${selectedRun.id}-attempt-${selectedRunAttempt}`;
  if (releaseTag !== `ci-artifact-${sourceSha}-run-${selectedRun.id}-attempt-${selectedRunAttempt}`) {
    fail("release tag must bind the exact source SHA and selected workflow run attempt");
  }

  const jobsResponse = ghApi(`repos/${repository}/actions/runs/${selectedRun.id}/jobs`, { per_page: "100" });
  const matchingJobs = (jobsResponse?.jobs ?? []).filter((job) => job.name === requiredJobName);
  if (matchingJobs.length !== 1) fail(`expected exactly one required job named ${requiredJobName}, found ${matchingJobs.length}`);
  const requiredJob = matchingJobs[0];
  if (requiredJob.status !== "completed" || requiredJob.conclusion !== "success") {
    fail(`required job ${requiredJobName} did not succeed`);
  }
  const checkRun = requiredCheckRun(repository, requiredJob, requiredJobName, sourceSha);
  const branchProtection = verifyBranchProtection(repository, branch, sourceSha, requiredJobName, checkRun.app.id);

  const artifactsResponse = ghApi(`repos/${repository}/actions/runs/${selectedRun.id}/artifacts`, { per_page: "100" });
  const matchingArtifacts = (artifactsResponse?.artifacts ?? [])
    .filter((artifact) => artifact.name === artifactName && artifact.expired !== true);
  if (matchingArtifacts.length !== 1) fail(`expected exactly one live artifact named ${artifactName}, found ${matchingArtifacts.length}`);
  const artifact = matchingArtifacts[0];
  if (!DIGEST_PATTERN.test(artifact.digest)) fail(`artifact ${artifactName} has no trusted SHA-256 digest`);

  let releaseEvidence = null;
  if (releaseTag) {
    const release = ghApi(`repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`);
    if (release?.tag_name !== releaseTag || release.draft !== false || release.prerelease !== true) {
      fail(`release bridge ${releaseTag} must be a published prerelease`);
    }
    const tagCommit = resolveTagCommit(repository, releaseTag);
    if (tagCommit !== sourceSha) fail(`release bridge tag ${releaseTag} does not resolve to ${sourceSha}`);
    releaseEvidence = {
      id: Number(release.id),
      tagName: releaseTag,
      commitSha: tagCommit,
      prerelease: true,
      draft: false,
      artifact: selectReleaseAsset(release, releaseArtifactName, "standalone"),
      manifest: selectReleaseAsset(release, releaseManifestName, "manifest"),
    };
  }
  if (!releaseEvidence) fail("production release evidence requires a digest-pinned prerelease bridge");
  verifyBranchProtection(repository, branch, sourceSha, requiredJobName, checkRun.app.id);
  const finalRunsResponse = ghApi(`repos/${repository}/actions/runs`, {
    branch,
    head_sha: sourceSha,
    per_page: "100",
  });
  const finalLatest = (finalRunsResponse?.workflow_runs ?? [])
    .filter((run) => run.name === workflowName
      && run.path === workflowPath
      && ["push", "workflow_dispatch", "schedule"].includes(run.event)
      && run.head_branch === branch
      && run.head_sha === sourceSha)
    .sort((left, right) => Number(right.id) - Number(left.id))[0];
  if (Number(finalLatest?.id) !== Number(selectedRun.id)
    || Number(finalLatest?.run_attempt ?? 1) !== Number(selectedRun.run_attempt ?? 1)
    || finalLatest?.status !== "completed"
    || finalLatest?.conclusion !== "success") {
    fail("same-SHA workflow evidence changed during release verification");
  }
  if (bootstrapContext && event !== "workflow_dispatch") {
    fail("production bootstrap evidence requires a fresh workflow_dispatch run");
  }

  const evidence = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    source: {
      commitSha: sourceSha,
      treeSha: sourceTree,
    },
    github: {
      repository,
      branch,
      branchProtected: true,
      branchProtection,
      workflowName,
      workflowPath,
      runId: Number(selectedRun.id),
      runAttempt: Number(selectedRun.run_attempt ?? 1),
      event,
      headSha: selectedRun.head_sha,
      requiredJobName,
      requiredJobId: Number(requiredJob.id),
      requiredCheckAppId: Number(checkRun.app.id),
      artifactName,
      artifactId: Number(artifact.id),
      artifactDigest: artifact.digest,
      artifactSizeBytes: Number(artifact.size_in_bytes ?? 0),
      artifactArchiveDownloadUrl: artifact.archive_download_url,
      release: releaseEvidence,
    },
    ...(bootstrapContext ? { deploymentBootstrap: bootstrapContext } : {}),
  };
  writeJsonAtomic(output, evidence);
  process.stdout.write(`Verified protected-main CI run ${selectedRun.id} and release asset metadata.\n`);
}

function checkArtifactLive(args) {
  const repository = validateSafeName(required(args, "repository"), "repository");
  const runId = positiveInteger(required(args, "run-id"), "run id");
  const artifactName = validateSafeName(required(args, "artifact-name"), "artifact name");
  const response = ghApi(`repos/${repository}/actions/runs/${runId}/artifacts`, { per_page: "100" });
  const matching = (response?.artifacts ?? []).filter((artifact) => artifact.name === artifactName);
  const live = matching.filter((artifact) => artifact.expired !== true);
  if (live.length === 1) {
    process.stdout.write(`${live[0].id}\n`);
    return;
  }
  if (live.length > 1) fail(`multiple live Actions artifacts named ${artifactName} exist in run ${runId}`);
  process.stderr.write(`[release-evidence] Actions artifact ${artifactName} in run ${runId} is missing or expired\n`);
  process.exitCode = 3;
}

function checkRunViable(args) {
  const repository = validateSafeName(required(args, "repository"), "repository");
  const branch = validateSafeName(required(args, "branch"), "branch");
  const sourceSha = validateSha(required(args, "sha"), "source SHA");
  const workflowName = validateSafeName(required(args, "workflow-name"), "workflow name");
  const workflowPath = validateSafeName(required(args, "workflow-path"), "workflow path");
  const event = required(args, "event");
  if (!["push", "workflow_dispatch"].includes(event)) fail("--event must be push or workflow_dispatch");
  const runId = positiveInteger(required(args, "run-id"), "run id");
  const runAttempt = positiveInteger(required(args, "run-attempt"), "run attempt");
  const artifactName = validateSafeName(required(args, "artifact-name"), "artifact name");
  const response = ghApi(`repos/${repository}/actions/runs`, {
    branch,
    head_sha: sourceSha,
    per_page: "100",
  });
  const candidates = (response?.workflow_runs ?? [])
    .filter((run) => run.name === workflowName
      && run.path === workflowPath
      && ["push", "workflow_dispatch", "schedule"].includes(run.event)
      && run.head_branch === branch
      && run.head_sha === sourceSha)
    .sort((left, right) => Number(right.id) - Number(left.id));
  const latest = candidates[0];
  if (!latest
    || latest.event !== event
    || Number(latest.id) !== runId
    || Number(latest.run_attempt ?? 1) !== runAttempt
    || latest.status !== "completed"
    || latest.conclusion !== "success") {
    process.stderr.write(`[release-evidence] run ${runId}/${runAttempt} is no longer the latest successful ${event} evidence for ${sourceSha}\n`);
    process.exitCode = 3;
    return;
  }
  const artifacts = ghApi(`repos/${repository}/actions/runs/${runId}/artifacts`, { per_page: "100" });
  const matching = (artifacts?.artifacts ?? []).filter((artifact) => artifact.name === artifactName);
  const live = matching.filter((artifact) => artifact.expired !== true);
  if (live.length === 1) {
    process.stdout.write(`${live[0].id}\n`);
    return;
  }
  if (live.length > 1) fail(`multiple live Actions artifacts named ${artifactName} exist in run ${runId}`);
  process.stderr.write(`[release-evidence] Actions artifact ${artifactName} in run ${runId} is missing or expired\n`);
  process.exitCode = 3;
}

function validateFile(args) {
  const file = required(args, "file");
  const expectedSha = validateSha(required(args, "sha"), "expected source SHA");
  const expectedTree = validateSha(required(args, "tree"), "expected source tree");
  const { evidence, sourceSha, sourceTree, github } = loadEvidence(file);
  if (sourceSha !== expectedSha) fail("evidence source SHA does not match the canonical source commit");
  if (sourceTree !== expectedTree) fail("evidence source tree does not match the canonical source tree");
  if (args.has("bootstrap-production-base")
    && evidence.deploymentBootstrap?.baselineSha !== args.get("bootstrap-production-base")) {
    fail("evidence production bootstrap baseline does not match the requested baseline");
  }
  const expectedFields = [
    ["repository", github.repository],
    ["branch", github.branch],
    ["workflow-name", github.workflowName],
    ["workflow-path", github.workflowPath],
    ["required-job", github.requiredJobName],
    ["artifact-name", github.artifactName],
    ["release-tag", github.release.tagName],
    ["release-artifact-name", github.release.artifact.name],
    ["release-manifest-name", github.release.manifest.name],
  ];
  for (const [key, actual] of expectedFields) {
    if (args.has(key) && args.get(key) !== actual) fail(`evidence ${key} does not match the pinned release policy`);
  }
  if (args.has("artifact-name-prefix") && !github.artifactName.startsWith(args.get("artifact-name-prefix"))) {
    fail("evidence artifact-name-prefix does not match the pinned release policy");
  }
  if (args.has("release-tag-prefix") && !github.release.tagName.startsWith(args.get("release-tag-prefix"))) {
    fail("evidence release-tag-prefix does not match the pinned release policy");
  }
  if (args.get("format") === "lines") {
    const values = [
      sourceSha,
      sourceTree,
      github.repository,
      github.branch,
      github.event,
      String(github.runId),
      String(github.runAttempt),
      String(github.requiredJobId),
      String(github.requiredCheckAppId),
      github.artifactName,
      String(github.artifactId),
      github.artifactDigest,
      github.release ? String(github.release.id) : "",
      github.release?.tagName ?? "",
      github.release?.artifact?.digest ?? "",
      github.release?.manifest?.digest ?? "",
    ];
    process.stdout.write(`${values.join("\n")}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resolve(path))) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

function migrationSetDigest(directory) {
  const root = resolve(directory);
  const repositoryRoot = process.cwd();
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  walk(root);
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(relative(repositoryRoot, path).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function validateStandalone(args) {
  const manifestPath = resolve(required(args, "manifest"));
  const artifactPath = resolve(required(args, "artifact"));
  const sourceSha = validateSha(required(args, "sha"), "expected source SHA");
  const sourceTree = validateSha(required(args, "tree"), "expected source tree");
  const lockFile = resolve(args.get("lock-file") ?? "package-lock.json");
  const migrations = resolve(args.get("migrations") ?? "prisma/migrations");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`cannot read standalone manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest?.schemaVersion !== 1) fail("standalone manifest schemaVersion must be 1");
  if (manifest?.source?.commitSha !== sourceSha || manifest?.source?.treeSha !== sourceTree) {
    fail("standalone manifest source identity does not match release evidence");
  }
  if (manifest?.build?.buildId !== sourceSha
    || typeof manifest?.build?.packageVersion !== "string"
    || manifest.build.packageVersion.length === 0
    || typeof manifest?.build?.nextVersion !== "string"
    || manifest.build.nextVersion.length === 0) {
    fail("standalone manifest build identity/version fields are invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(manifest?.artifact?.sha256 ?? "")) fail("standalone manifest artifact hash is invalid");
  if (!/^[0-9a-f]{64}$/.test(manifest?.inputs?.packageLockSha256 ?? "")) fail("standalone manifest lock hash is invalid");
  if (!/^[0-9a-f]{64}$/.test(manifest?.inputs?.migrationSetSha256 ?? "")) fail("standalone manifest migration hash is invalid");
  if (manifest.artifact.fileName !== basename(artifactPath)) fail("standalone manifest artifact filename does not match downloaded artifact");
  const artifactDigest = (await hashFile(artifactPath)).slice("sha256:".length);
  const lockDigest = (await hashFile(lockFile)).slice("sha256:".length);
  const migrationsDigest = migrationSetDigest(migrations);
  if (manifest.artifact.sha256 !== artifactDigest) fail("standalone artifact hash does not match manifest");
  if (manifest.artifact.sizeBytes !== statSync(artifactPath).size) fail("standalone artifact size does not match manifest");
  if (manifest.inputs.packageLockSha256 !== lockDigest) fail("standalone manifest package-lock hash does not match source");
  if (manifest.inputs.migrationSetSha256 !== migrationsDigest) fail("standalone manifest migration-set hash does not match source");
  if (args.has("evidence")) {
    const { github } = loadEvidence(required(args, "evidence"));
    if (github.release) {
      if (github.release.artifact.name !== basename(artifactPath)) fail("release evidence artifact name does not match standalone artifact");
      if (github.release.manifest.name !== basename(manifestPath)) fail("release evidence manifest name does not match standalone manifest");
    }
    const manifestDigest = await hashFile(manifestPath);
    if (github.release.manifest.digest !== manifestDigest) {
      fail("standalone manifest digest does not match release metadata");
    }
    validateReleaseManifest(manifest, {
      sourceSha,
      sourceTree,
      selectedRun: { id: github.runId, run_attempt: github.runAttempt },
      event: github.event,
      releaseEvidence: github.release,
    });
  }
  process.stdout.write(`${artifactDigest}\n`);
}

function releaseAssetForKind(github, kind) {
  if (!github.release) fail("release evidence has no public prerelease bridge");
  if (kind !== "artifact" && kind !== "manifest") fail("--kind must be artifact or manifest");
  return github.release[kind];
}

async function validateArchive(args) {
  const file = required(args, "file");
  const archive = required(args, "archive");
  const kind = required(args, "kind");
  const { github } = loadEvidence(file);
  const asset = releaseAssetForKind(github, kind);
  const digest = await hashFile(archive);
  if (digest !== asset.digest) fail(`${kind} release asset digest does not match trusted GitHub metadata`);
  process.stdout.write(`${digest}\n`);
}

async function downloadAsset(args) {
  const file = required(args, "file");
  const kind = required(args, "kind");
  const output = resolve(required(args, "output"));
  const { github } = loadEvidence(file);
  const asset = releaseAssetForKind(github, kind);
  const temporary = `${output}.tmp-${process.pid}`;
  mkdirSync(dirname(output), { recursive: true });
  rmSync(temporary, { force: true });
  let response;
  try {
    response = await fetch(asset.browserDownloadUrl, { redirect: "follow" });
    if (!response.ok || !response.body) fail(`cannot download ${kind} release asset: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { mode: 0o600 }));
    const digest = await hashFile(temporary);
    if (digest !== asset.digest) fail(`${kind} release asset download digest mismatch`);
    renameSync(temporary, output);
    process.stdout.write(`${output}\n`);
  } finally {
    rmSync(temporary, { force: true });
  }
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (command === "verify-github") {
  await verifyGithub(args);
} else if (command === "check-run-viable") {
  checkRunViable(args);
} else if (command === "check-artifact-live") {
  checkArtifactLive(args);
} else if (command === "validate-file") {
  validateFile(args);
} else if (command === "validate-archive") {
  await validateArchive(args);
} else if (command === "download-asset") {
  await downloadAsset(args);
} else if (command === "validate-standalone") {
  await validateStandalone(args);
} else {
  fail("usage: release-evidence.mjs verify-github|check-run-viable|check-artifact-live|validate-file|validate-archive|download-asset|validate-standalone [options]");
}
