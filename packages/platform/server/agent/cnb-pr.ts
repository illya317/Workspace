import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SessionUser } from "@workspace/platform/types";

import type { ProposalExecutors } from "./proposals";

const execFile = promisify(execFileCallback);

const DEFAULT_REPO = "illya317/Workspace";
const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "agent/";
const MAX_PATCH_BYTES = 180_000;

type CnbPrPayload = {
  title: string;
  summary: string;
  files: string[];
  validation: string[];
  risks: string[];
  patch: string;
  baseBranch?: string;
};

type GitEnv = Record<string, string | undefined>;

function cnbRepo() {
  return (process.env.CNB_PR_REPO || process.env.AGENT_SOURCE_REPO_SLUG || DEFAULT_REPO).trim();
}

function cnbApiBase() {
  return (process.env.CNB_API_BASE_URL || "https://api.cnb.cool").replace(/\/+$/, "");
}

function cnbGitBase() {
  return (process.env.CNB_GIT_BASE_URL || "https://cnb.cool").replace(/\/+$/, "");
}

function cnbBranchPrefix() {
  const prefix = (process.env.CNB_PR_BRANCH_PREFIX || DEFAULT_BRANCH_PREFIX).trim() || DEFAULT_BRANCH_PREFIX;
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function cnbToken() {
  return process.env.CNB_PR_TOKEN || process.env.CNB_TOKEN || "";
}

function normalizePayload(value: Record<string, unknown>): CnbPrPayload {
  const title = String(value.title ?? "").trim().slice(0, 180);
  const summary = String(value.summary ?? "").trim().slice(0, 10_000);
  const patch = String(value.patch ?? "").trim();
  const files = normalizeStringArray(value.files, 40, 260);
  const validation = normalizeStringArray(value.validation, 20, 260);
  const risks = normalizeStringArray(value.risks, 20, 260);
  const baseBranch = String(value.baseBranch ?? value.base ?? DEFAULT_BASE_BRANCH).trim().slice(0, 120) || DEFAULT_BASE_BRANCH;

  if (!title) throw new Error("PR 草案缺少 title");
  if (!summary) throw new Error("PR 草案缺少 summary");
  if (!patch) throw new Error("PR 草案缺少 patch，不能提交代码 PR");
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) throw new Error("PR patch 过大，请缩小修改范围");
  if (!files.length) throw new Error("PR 草案缺少 files");

  return { title, summary, files, validation, risks, patch, baseBranch };
}

function normalizeStringArray(value: unknown, maxItems: number, maxChars: number) {
  const raw = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  return raw
    .map((item) => String(item ?? "").trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "proposal";
}

function branchName(title: string) {
  const suffix = `${Date.now().toString(36)}-${slugify(title)}`;
  return `${cnbBranchPrefix()}${suffix}`;
}

function gitUrl(repo: string) {
  return `${cnbGitBase()}/${repo}.git`;
}

function redactSecret(value: string) {
  const token = cnbToken();
  return token ? value.split(token).join("[REDACTED_CNB_TOKEN]") : value;
}

async function run(command: string, args: string[], options: { cwd?: string; env?: GitEnv; timeout?: number } = {}) {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeout ?? 30_000,
      maxBuffer: 6 * 1024 * 1024,
      encoding: "utf8",
    });
    return { stdout: String(stdout).trim(), stderr: String(stderr).trim() };
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string };
    const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(redactSecret(detail));
  }
}

async function createAskPassScript(dir: string) {
  const script = path.join(dir, "cnb-askpass.sh");
  await writeFile(script, [
    "#!/bin/sh",
    "case \"$1\" in",
    "  *Username*) printf '%s\\n' \"cnb\" ;;",
    "  *) printf '%s\\n' \"$CNB_PR_TOKEN\" ;;",
    "esac",
    "",
  ].join("\n"), "utf8");
  await chmod(script, 0o700);
  return script;
}

function proposalBody(payload: CnbPrPayload) {
  const lines = [
    payload.summary,
    "",
    "## Files",
    ...payload.files.map((file) => `- \`${file}\``),
    "",
    "## Validation",
    ...(payload.validation.length ? payload.validation.map((item) => `- ${item}`) : ["- Codex review required"]),
    "",
    "## Risks",
    ...(payload.risks.length ? payload.risks.map((item) => `- ${item}`) : ["- Review generated patch carefully before merge"]),
    "",
    "---",
    "Generated from a Workspace agent PR draft. Kimi produced the patch; Codex/server executor applied it and opened this PR.",
  ];
  return lines.join("\n");
}

async function createCnbPullRequest(input: { repo: string; title: string; body: string; branch: string; baseBranch: string; token: string }) {
  const response = await fetch(`${cnbApiBase()}/${input.repo}/-/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.baseBranch,
      head_repo: input.repo,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CNB create PR failed ${response.status}: ${redactSecret(text).slice(0, 500)}`);
  }

  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const record = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const url = typeof record.web_url === "string"
    ? record.web_url
    : typeof record.url === "string"
      ? record.url
      : typeof record.html_url === "string"
        ? record.html_url
        : `https://cnb.cool/${input.repo}/-/pulls`;
  const number = record.number ?? record.iid ?? record.id ?? null;
  return { url, number, raw: data };
}

export async function executeCnbPullRequestProposal(payloadValue: Record<string, unknown>, user: SessionUser) {
  if (!(user.visibleSubmitResourceKeys || []).includes("agent")) {
    throw new Error("无 agent 权限");
  }

  const payload = normalizePayload(payloadValue);
  const repo = cnbRepo();
  const token = cnbToken();
  const branch = branchName(payload.title);

  if (process.env.CNB_PR_DRY_RUN === "1") {
    return {
      dryRun: true,
      repo,
      branch,
      baseBranch: payload.baseBranch,
      title: payload.title,
      files: payload.files,
      patchBytes: Buffer.byteLength(payload.patch, "utf8"),
    };
  }

  if (!token) throw new Error("CNB_PR_TOKEN 未配置");

  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-cnb-pr-"));
  const repoDir = path.join(root, "repo");
  const patchFile = path.join(root, "proposal.patch");
  const askPass = await createAskPassScript(root);
  const gitEnv: GitEnv = {
    CNB_PR_TOKEN: token,
    GIT_ASKPASS: askPass,
    GIT_TERMINAL_PROMPT: "0",
  };

  try {
    await run("git", ["clone", "--depth=1", "--branch", payload.baseBranch || DEFAULT_BASE_BRANCH, gitUrl(repo), repoDir], {
      env: gitEnv,
      timeout: 90_000,
    });
    await run("git", ["checkout", "-b", branch], { cwd: repoDir, env: gitEnv });
    await writeFile(patchFile, `${payload.patch}\n`, "utf8");
    await run("git", ["apply", "--check", "--whitespace=nowarn", patchFile], { cwd: repoDir, env: gitEnv });
    await run("git", ["apply", "--whitespace=nowarn", patchFile], { cwd: repoDir, env: gitEnv });
    await run("git", ["diff", "--check"], { cwd: repoDir, env: gitEnv });
    await run("git", ["config", "user.name", process.env.CNB_PR_GIT_AUTHOR_NAME || "Workspace Agent"], { cwd: repoDir, env: gitEnv });
    await run("git", ["config", "user.email", process.env.CNB_PR_GIT_AUTHOR_EMAIL || "workspace-agent@example.invalid"], { cwd: repoDir, env: gitEnv });
    await run("git", ["add", "-A"], { cwd: repoDir, env: gitEnv });
    await run("git", ["diff", "--cached", "--quiet"], { cwd: repoDir, env: gitEnv }).then(() => {
      throw new Error("patch 没有产生任何变更");
    }).catch((err) => {
      if (err instanceof Error && err.message === "patch 没有产生任何变更") throw err;
    });
    await run("git", ["commit", "-m", payload.title], { cwd: repoDir, env: gitEnv });
    const sha = (await run("git", ["rev-parse", "HEAD"], { cwd: repoDir, env: gitEnv })).stdout;
    await run("git", ["push", "origin", `HEAD:${branch}`], { cwd: repoDir, env: gitEnv, timeout: 90_000 });

    const pr = await createCnbPullRequest({
      repo,
      title: payload.title,
      body: proposalBody(payload),
      branch,
      baseBranch: payload.baseBranch || DEFAULT_BASE_BRANCH,
      token,
    });

    return {
      repo,
      branch,
      baseBranch: payload.baseBranch || DEFAULT_BASE_BRANCH,
      commit: sha,
      pullRequestUrl: pr.url,
      pullRequestNumber: pr.number,
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const sourceAgentProposalExecutors: ProposalExecutors = {
  "source.submitCnbPullRequest": executeCnbPullRequestProposal,
};
