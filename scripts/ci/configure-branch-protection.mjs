#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BRANCH = "main";
const DEFAULT_CHECK = "CI / required";

function fail(message) {
  throw new Error(message);
}

function gh(args, { input } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`gh ${args.join(" ")} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

function ghJson(args, options) {
  const output = gh(args, options);
  try {
    return JSON.parse(output);
  } catch {
    fail(`gh ${args.join(" ")} did not return JSON`);
  }
}

function apiJson(endpoint, { method = "GET", body } = {}) {
  const args = ["api", "--method", method, "-H", "Accept: application/vnd.github+json", endpoint];
  if (body !== undefined) args.push("--input", "-");
  return ghJson(args, { input: body === undefined ? undefined : `${JSON.stringify(body)}\n` });
}

function apiWrite(endpoint, body) {
  return gh([
    "api",
    "--method", "PUT",
    "-H", "Accept: application/vnd.github+json",
    endpoint,
    "--input", "-",
  ], { input: `${JSON.stringify(body)}\n` });
}

function parseArgs(argv) {
  const options = { apply: false, branch: DEFAULT_BRANCH, check: DEFAULT_CHECK, repo: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--repo") options.repo = argv[++index];
    else if (arg === "--branch") options.branch = argv[++index];
    else if (arg === "--check") options.check = argv[++index];
    else if (arg === "--help") options.help = true;
    else fail(`Unknown argument: ${arg}`);
  }
  for (const key of ["repo", "branch", "check"]) {
    if (options[key] !== undefined && !String(options[key]).trim()) fail(`--${key} cannot be empty`);
  }
  return options;
}

export function selectTrustedCheck(checkRuns, { branch, checkName, headSha }) {
  const matches = checkRuns.filter((run) => (
    run.name === checkName
    && run.head_sha === headSha
    && run.status === "completed"
    && run.conclusion === "success"
    && (run.check_suite?.head_branch === undefined || run.check_suite.head_branch === branch)
    && run.app?.slug === "github-actions"
    && Number.isInteger(run.app?.id)
  ));
  matches.sort((left, right) => new Date(right.completed_at ?? 0) - new Date(left.completed_at ?? 0));
  if (matches.length === 0) {
    fail(`No successful ${checkName} check from GitHub Actions exists for ${branch}@${headSha}`);
  }
  return matches[0];
}

export function buildProtectionPayload({ checkName, appId }) {
  return {
    required_status_checks: {
      strict: true,
      checks: [{ context: checkName, app_id: appId }],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: true,
    lock_branch: false,
    allow_fork_syncing: true,
  };
}

export function buildWorkflowPermissionsPayload() {
  return {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: true,
  };
}

export function verifyWorkflowPermissions(settings) {
  if (settings?.default_workflow_permissions !== "read"
    || settings?.can_approve_pull_request_reviews !== true) {
    fail("Actions workflow permissions do not allow the trusted promotion workflow to create PRs");
  }
}

export function verifyProtection(protection, { checkName, appId }) {
  const checks = protection.required_status_checks?.checks ?? [];
  const trustedCheck = checks.some((check) => check.context === checkName && check.app_id === appId);
  const bypass = protection.required_pull_request_reviews?.bypass_pull_request_allowances;
  const noPullRequestBypass = bypass === undefined
    || [bypass.users, bypass.teams, bypass.apps].every((actors) => Array.isArray(actors) && actors.length === 0);
  const valid = (
    protection.required_status_checks?.strict === true
    && trustedCheck
    && protection.enforce_admins?.enabled === true
    && protection.required_pull_request_reviews?.required_approving_review_count === 0
    && protection.required_pull_request_reviews?.require_code_owner_reviews === true
    && protection.required_pull_request_reviews?.dismiss_stale_reviews === true
    && protection.required_pull_request_reviews?.require_last_push_approval === false
    && noPullRequestBypass
    && protection.required_linear_history?.enabled === true
    && protection.allow_force_pushes?.enabled === false
    && protection.allow_deletions?.enabled === false
    && protection.required_conversation_resolution?.enabled === true
  );
  if (!valid) fail("Branch protection verification failed after update");
}

function usage() {
  process.stdout.write(`Usage: node scripts/ci/configure-branch-protection.mjs [options]\n\n`);
  process.stdout.write(`  --apply             Apply protection (default is a read-only plan)\n`);
  process.stdout.write(`  --repo OWNER/REPO   Repository (default: current gh repository)\n`);
  process.stdout.write(`  --branch NAME       Protected branch (default: ${DEFAULT_BRANCH})\n`);
  process.stdout.write(`  --check NAME        Required check context (default: ${DEFAULT_CHECK})\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const repo = options.repo ?? gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) fail(`Invalid repository name: ${repo}`);

  const branch = apiJson(`repos/${repo}/branches/${encodeURIComponent(options.branch)}`);
  const headSha = branch.commit?.sha;
  if (!/^[0-9a-f]{40}$/i.test(headSha ?? "")) fail(`Unable to resolve ${repo}:${options.branch}`);

  const checkResponse = apiJson(`repos/${repo}/commits/${headSha}/check-runs?per_page=100`);
  const trustedCheck = selectTrustedCheck(checkResponse.check_runs ?? [], {
    branch: options.branch,
    checkName: options.check,
    headSha,
  });
  const payload = buildProtectionPayload({ checkName: options.check, appId: trustedCheck.app.id });
  const workflowPermissions = buildWorkflowPermissionsPayload();
  const currentWorkflowPermissions = apiJson(`repos/${repo}/actions/permissions/workflow`);

  process.stdout.write(`${JSON.stringify({
    repo,
    branch: options.branch,
    headSha,
    check: options.check,
    appId: trustedCheck.app.id,
    currentWorkflowPermissions,
    plannedWorkflowPermissions: workflowPermissions,
  }, null, 2)}\n`);
  if (!options.apply) {
    process.stdout.write("Dry run only. Re-run with --apply after reviewing the resolved SHA/check/app.\n");
    return;
  }

  apiWrite(`repos/${repo}/actions/permissions/workflow`, workflowPermissions);
  verifyWorkflowPermissions(apiJson(`repos/${repo}/actions/permissions/workflow`));
  apiJson(`repos/${repo}/branches/${encodeURIComponent(options.branch)}/protection`, {
    method: "PUT",
    body: payload,
  });
  const protection = apiJson(`repos/${repo}/branches/${encodeURIComponent(options.branch)}/protection`);
  verifyProtection(protection, { checkName: options.check, appId: trustedCheck.app.id });
  process.stdout.write(`✓ ${repo}:${options.branch} now requires ${options.check} from app ${trustedCheck.app.id}.\n`);
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
