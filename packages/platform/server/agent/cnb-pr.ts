import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentExecutionContext } from "./execution";
import type { ProposalExecutorControl, ProposalExecutors } from "./proposals";
const execFile = promisify(execFileCallback);
const DEFAULT_REPO = "illya317/Workspace";
const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_BRANCH_PREFIX = "agent/";
const MAX_PATCH_BYTES = 180_000;
const MAX_DECLARED_FILES = 40;
const MAX_FILE_PATH_CHARS = 260;
export type CnbPullRequestProposalBinding = {
  repository: string; repositoryUrl: string;
  apiBaseUrl: string; gitBaseUrl: string;
  baseBranch: string; baseCommit: string;
  branch: string; patchSha256: string;
};
type CnbPrPayload = {
  title: string;
  summary: string;
  files: string[];
  validation: string[];
  risks: string[];
  patch: string;
  binding: CnbPullRequestProposalBinding;
};
type GitEnv = Record<string, string | undefined>;

function cnbRepo() {
  return normalizeRepositorySlug(process.env.CNB_PR_REPO || process.env.AGENT_SOURCE_REPO_SLUG || DEFAULT_REPO);
}
function cnbApiBase() {
  return normalizeHttpUrl(process.env.CNB_API_BASE_URL || "https://api.cnb.cool", "CNB API base URL");
}
function cnbGitBase() {
  return normalizeHttpUrl(process.env.CNB_GIT_BASE_URL || "https://cnb.cool", "CNB Git base URL");
}
function cnbBaseBranch() {
  return normalizeGitRef(
    process.env.CNB_PR_BASE_BRANCH || process.env.AGENT_SOURCE_BRANCH || DEFAULT_BASE_BRANCH,
    "CNB PR base branch",
  );
}
function cnbBranchPrefix() {
  const prefix = (process.env.CNB_PR_BRANCH_PREFIX || DEFAULT_BRANCH_PREFIX).trim() || DEFAULT_BRANCH_PREFIX;
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  normalizeGitRef(`${normalized}proposal`, "CNB PR branch prefix");
  return normalized;
}
function cnbToken() {
  return process.env.CNB_PR_TOKEN || process.env.CNB_TOKEN || "";
}

export function validateCnbPullRequestProposalPayload(value: Record<string, unknown>): CnbPrPayload {
  const title = String(value.title ?? "").trim().slice(0, 180);
  const summary = String(value.summary ?? "").trim().slice(0, 10_000);
  const patch = String(value.patch ?? "").trim();
  const files = normalizeCnbPrDeclaredFiles(value.files);
  const validation = normalizeStringArray(value.validation, 20, 260);
  const risks = normalizeStringArray(value.risks, 20, 260);

  if (!title) throw new Error("PR 草案缺少 title");
  if (!summary) throw new Error("PR 草案缺少 summary");
  if (!patch) throw new Error("PR 草案缺少 patch，不能提交代码 PR");
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) throw new Error("PR patch 过大，请缩小修改范围");
  if (!files.length) throw new Error("PR 草案缺少 files");

  const binding = normalizeProposalBinding(value.binding);
  const actualPatchSha256 = sha256(patch);
  if (binding.patchSha256 !== actualPatchSha256) {
    throw new Error(`PR patch SHA-256 不匹配：proposal=${binding.patchSha256} actual=${actualPatchSha256}`);
  }

  const currentBinding = buildStaticCnbPullRequestProposalBinding({ title, patch });
  for (const key of Object.keys(currentBinding) as Array<keyof typeof currentBinding>) {
    if (binding[key] !== currentBinding[key]) {
      throw new Error(`CNB PR proposal 目标已漂移（${key}），请重新生成并确认草案`);
    }
  }

  return { title, summary, files, validation, risks, patch, binding };
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
function branchName(title: string, patchSha256: string) {
  return normalizeGitRef(
    `${cnbBranchPrefix()}${patchSha256}-${slugify(title)}`,
    "CNB PR branch",
  );
}
function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function hasControlCharacters(value: string) {
  return /[\u0000-\u001f\u007f-\u009f]/.test(value);
}
function normalizeRepositorySlug(value: unknown) {
  const repository = String(value ?? "").trim();
  const segments = repository.split("/");
  if (
    !repository
    || repository.length > 240
    || hasControlCharacters(repository)
    || segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    throw new Error("CNB PR repository 必须是安全的 owner/repository slug");
  }
  return repository;
}
function normalizeHttpUrl(value: unknown, label: string) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} 不是合法 URL`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || hasControlCharacters(raw)
  ) {
    throw new Error(`${label} 只能使用无凭据、无 query/hash 的 HTTP(S) URL`);
  }
  return raw;
}
function normalizeGitRef(value: unknown, label: string) {
  const ref = String(value ?? "").trim();
  if (
    !ref
    || ref.length > 180
    || hasControlCharacters(ref)
    || /[ ~^:?*[\\]/.test(ref)
    || ref.includes("..")
    || ref.includes("@{")
    || ref.includes("//")
    || ref.startsWith("/")
    || ref.endsWith("/")
    || ref.startsWith(".")
    || ref.endsWith(".")
    || ref.split("/").some((segment) => !segment || segment.startsWith(".") || segment.endsWith(".lock"))
  ) {
    throw new Error(`${label} 不是合法 Git ref`);
  }
  return ref;
}
function normalizeProposalBinding(value: unknown): CnbPullRequestProposalBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CNB PR proposal 缺少服务端目标绑定");
  }
  const record = value as Record<string, unknown>;
  const patchSha256 = String(record.patchSha256 ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(patchSha256)) throw new Error("CNB PR proposal patch SHA-256 无效");
  return {
    repository: normalizeRepositorySlug(record.repository),
    repositoryUrl: normalizeHttpUrl(record.repositoryUrl, "CNB repository URL"),
    apiBaseUrl: normalizeHttpUrl(record.apiBaseUrl, "CNB API base URL"),
    gitBaseUrl: normalizeHttpUrl(record.gitBaseUrl, "CNB Git base URL"),
    baseBranch: normalizeGitRef(record.baseBranch, "CNB PR base branch"),
    baseCommit: normalizeGitCommit(record.baseCommit),
    branch: normalizeGitRef(record.branch, "CNB PR branch"),
    patchSha256,
  };
}
function normalizeGitCommit(value: unknown) {
  const commit = String(value ?? "").trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) {
    throw new Error("CNB PR base commit 不是完整 Git object ID");
  }
  return commit;
}
function buildStaticCnbPullRequestProposalBinding(input: { title: string; patch: string }) {
  const title = String(input.title ?? "").trim();
  const patch = String(input.patch ?? "").trim();
  if (!title) throw new Error("PR 草案缺少 title");
  if (!patch) throw new Error("PR 草案缺少 patch，不能提交代码 PR");
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) throw new Error("PR patch 过大，请缩小修改范围");
  const patchSha256 = sha256(patch);
  const repository = cnbRepo();
  const gitBaseUrl = cnbGitBase();
  return {
    repository,
    repositoryUrl: `${gitBaseUrl}/${repository}.git`,
    apiBaseUrl: cnbApiBase(),
    gitBaseUrl,
    baseBranch: cnbBaseBranch(),
    branch: branchName(title, patchSha256),
    patchSha256,
  };
}

type RemoteBaseCommitResolver = (input: {
  repositoryUrl: string;
  baseBranch: string;
  proposalBranch: string;
}) => Promise<string>;

async function resolveRemoteBaseCommit(input: {
  repositoryUrl: string;
  baseBranch: string;
  proposalBranch: string;
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-cnb-binding-"));
  const askPass = await createAskPassScript(root);
  const gitEnv: GitEnv = {
    CNB_PR_TOKEN: cnbToken(),
    GIT_ASKPASS: askPass,
    GIT_TERMINAL_PROMPT: "0",
  };
  const baseRef = `refs/heads/${input.baseBranch}`;
  const proposalRef = `refs/heads/${input.proposalBranch}`;
  try {
    const output = await run("git", ["ls-remote", "--exit-code", input.repositoryUrl, baseRef, proposalRef], {
      env: gitEnv,
      timeout: 30_000,
    });
    const refs = new Map(output.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [commit, ref] = line.split(/\s+/, 2);
      return [ref, commit] as const;
    }));
    if (refs.has(proposalRef)) {
      throw new Error(`确定性 proposal branch 已存在，拒绝生成重复草案：${input.proposalBranch}`);
    }
    const baseCommit = refs.get(baseRef);
    if (!baseCommit) throw new Error(`CNB PR base branch 不存在：${input.baseBranch}`);
    return normalizeGitCommit(baseCommit);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function buildCnbPullRequestProposalBinding(
  input: { title: string; patch: string },
  dependencies: { remoteBaseCommitResolver?: RemoteBaseCommitResolver } = {},
): Promise<CnbPullRequestProposalBinding> {
  const target = buildStaticCnbPullRequestProposalBinding(input);
  const baseCommit = await (dependencies.remoteBaseCommitResolver ?? resolveRemoteBaseCommit)({
    repositoryUrl: target.repositoryUrl,
    baseBranch: target.baseBranch,
    proposalBranch: target.branch,
  });
  return { ...target, baseCommit: normalizeGitCommit(baseCommit) };
}

export async function buildCnbPullRequestProposalDraft(input: {
  title: string;
  summary: string;
  files: unknown;
  validation: string[];
  risks: string[];
  patch: string;
}, dependencies: { remoteBaseCommitResolver?: RemoteBaseCommitResolver } = {}) {
  const files = normalizeCnbPrDeclaredFiles(input.files);
  if (!files.length) throw new Error("PR 草案缺少 files");
  const binding = await buildCnbPullRequestProposalBinding(input, dependencies);
  const target = {
    repository: binding.repository,
    repositoryUrl: binding.repositoryUrl,
    apiBaseUrl: binding.apiBaseUrl,
    gitBaseUrl: binding.gitBaseUrl,
    baseBranch: binding.baseBranch,
    baseCommit: binding.baseCommit,
    branch: binding.branch,
  };
  return {
    files,
    binding,
    payload: { ...input, files, binding },
    diff: {
      title: input.title,
      files,
      validation: input.validation,
      risks: input.risks,
      patch: input.patch,
      patchSha256: binding.patchSha256,
      target,
    },
  };
}

export function normalizeCnbPrDeclaredFiles(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  if (raw.length > MAX_DECLARED_FILES) throw new Error(`PR 草案 files 不能超过 ${MAX_DECLARED_FILES} 个`);
  const normalized = raw.map((item) => normalizeRepoRelativePath(item));
  return [...new Set(normalized)];
}

function normalizeRepoRelativePath(value: unknown) {
  const raw = String(value ?? "");
  const file = raw.trim();
  const segments = file.split("/");
  if (
    !file
    || raw !== file
    || file.length > MAX_FILE_PATH_CHARS
    || hasControlCharacters(file)
    || file.includes("\\")
    || path.posix.isAbsolute(file)
    || path.win32.isAbsolute(file)
    || path.posix.normalize(file) !== file
    || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.toLowerCase() === ".git")
  ) {
    throw new Error(`PR 文件路径不是规范的仓库相对路径：${JSON.stringify(file)}`);
  }
  return file;
}

export function assertCnbPrStagedFilesMatch(declaredValue: unknown, stagedValue: unknown) {
  const declared = normalizeCnbPrDeclaredFiles(declaredValue).sort();
  const staged = normalizeCnbPrDeclaredFiles(stagedValue).sort();
  if (declared.length !== staged.length || declared.some((file, index) => file !== staged[index])) {
    throw new Error(`patch 实际暂存文件与 proposal 声明不一致：declared=${JSON.stringify(declared)} staged=${JSON.stringify(staged)}`);
  }
}

export function buildCnbCreateOnlyPushArgs(branchValue: unknown) {
  const remoteRef = `refs/heads/${normalizeGitRef(branchValue, "CNB PR branch")}`;
  return ["push", `--force-with-lease=${remoteRef}:`, "origin", `HEAD:${remoteRef}`];
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
    "## Bound target",
    `- Repository: \`${payload.binding.repository}\``,
    `- Base branch: \`${payload.binding.baseBranch}\``,
    `- Base commit: \`${payload.binding.baseCommit}\``,
    `- Proposal branch: \`${payload.binding.branch}\``,
    `- Patch SHA-256: \`${payload.binding.patchSha256}\``,
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
    "Generated from a Workspace agent PR draft. Kimi produced the patch; the automated server executor applied it and opened this PR.",
  ];
  return lines.join("\n");
}

async function createCnbPullRequest(input: {
  repo: string;
  apiBaseUrl: string;
  gitBaseUrl: string;
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  token: string;
}) {
  const response = await fetch(`${input.apiBaseUrl}/${input.repo}/-/pulls`, {
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
        : `${input.gitBaseUrl}/${input.repo}/-/pulls`;
  const number = record.number ?? record.iid ?? record.id ?? null;
  return { url, number, raw: data };
}

export async function executeCnbPullRequestProposal(
  payloadValue: Record<string, unknown>, _execution?: AgentExecutionContext, control?: ProposalExecutorControl,
) {
  const payload = validateCnbPullRequestProposalPayload(payloadValue);
  const binding = payload.binding;
  const token = cnbToken();

  if (process.env.CNB_PR_DRY_RUN === "1") {
    return {
      dryRun: true,
      ...binding,
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
    await run("git", ["clone", "--no-checkout", "--single-branch", "--branch", binding.baseBranch, binding.repositoryUrl, repoDir], {
      env: gitEnv,
      timeout: 90_000,
    });
    await run("git", ["cat-file", "-e", `${binding.baseCommit}^{commit}`], { cwd: repoDir, env: gitEnv }).catch(() => {
      throw new Error(`绑定的 base commit 已不在远端 base branch 历史中：${binding.baseCommit}`);
    });
    await run("git", ["merge-base", "--is-ancestor", binding.baseCommit, `origin/${binding.baseBranch}`], { cwd: repoDir, env: gitEnv }).catch(() => {
      throw new Error(`绑定的 base commit 已不属于 ${binding.baseBranch}，拒绝在漂移基线上执行`);
    });
    await run("git", ["checkout", "-b", binding.branch, binding.baseCommit], { cwd: repoDir, env: gitEnv });
    await writeFile(patchFile, `${payload.patch}\n`, "utf8");
    await run("git", ["apply", "--check", "--whitespace=nowarn", patchFile], { cwd: repoDir, env: gitEnv });
    await run("git", ["apply", "--whitespace=nowarn", patchFile], { cwd: repoDir, env: gitEnv });
    await run("git", ["diff", "--check"], { cwd: repoDir, env: gitEnv });
    await run("git", ["config", "user.name", process.env.CNB_PR_GIT_AUTHOR_NAME || "Workspace Agent"], { cwd: repoDir, env: gitEnv });
    await run("git", ["config", "user.email", process.env.CNB_PR_GIT_AUTHOR_EMAIL || "workspace-agent@example.invalid"], { cwd: repoDir, env: gitEnv });
    await run("git", ["add", "-A"], { cwd: repoDir, env: gitEnv });
    const stagedFiles = (await run("git", ["diff", "--cached", "--name-only", "-z"], { cwd: repoDir, env: gitEnv })).stdout
      .split("\0")
      .filter(Boolean);
    assertCnbPrStagedFilesMatch(payload.files, stagedFiles);
    await run("git", ["diff", "--cached", "--quiet"], { cwd: repoDir, env: gitEnv }).then(() => {
      throw new Error("patch 没有产生任何变更");
    }).catch((err) => {
      if (err instanceof Error && err.message === "patch 没有产生任何变更") throw err;
    });
    await run("git", ["commit", "-m", payload.title], { cwd: repoDir, env: gitEnv });
    const sha = (await run("git", ["rev-parse", "HEAD"], { cwd: repoDir, env: gitEnv })).stdout;
    control?.markExternalDispatchStarted();
    await run("git", buildCnbCreateOnlyPushArgs(binding.branch), { cwd: repoDir, env: gitEnv, timeout: 90_000 });

    const pr = await createCnbPullRequest({
      repo: binding.repository,
      apiBaseUrl: binding.apiBaseUrl,
      gitBaseUrl: binding.gitBaseUrl,
      title: payload.title,
      body: proposalBody(payload),
      branch: binding.branch,
      baseBranch: binding.baseBranch,
      token,
    });

    return {
      ...binding,
      commit: sha,
      pullRequestUrl: pr.url,
      pullRequestNumber: pr.number,
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const sourceAgentProposalExecutors: ProposalExecutors = {
  "source.submitCnbPullRequest": {
    toolKey: "source.proposePullRequest",
    requiredPermissions: [{ resourceKey: "agent.source", action: "submit" }],
    delegatedExecution: true,
    requiresAgentProfile: true,
    failureMayHaveSideEffects: true,
    uncertainFailureBoundary: "external_dispatch",
    execute: executeCnbPullRequestProposal,
  },
};
