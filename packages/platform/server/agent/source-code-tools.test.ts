import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { AgentExecutionContext } from "./execution";

let recordedProposal: Record<string, unknown> | null = null;
mock.module("./cnb-pr", {
  namedExports: {
    buildCnbPullRequestProposalDraft: async (input: {
      title: string;
      summary: string;
      files: string[];
      validation: string[];
      risks: string[];
      patch: string;
    }) => {
      const patchSha256 = createHash("sha256").update(input.patch, "utf8").digest("hex");
      const repository = String(process.env.CNB_PR_REPO);
      const gitBaseUrl = String(process.env.CNB_GIT_BASE_URL);
      const binding = {
        repository,
        repositoryUrl: `${gitBaseUrl}/${repository}.git`,
        apiBaseUrl: String(process.env.CNB_API_BASE_URL),
        gitBaseUrl,
        baseBranch: String(process.env.CNB_PR_BASE_BRANCH),
        baseCommit: "b".repeat(40),
        branch: `agent/${patchSha256}-bound-patch`,
        patchSha256,
      };
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
        files: input.files,
        binding,
        payload: { ...input, binding },
        diff: { ...input, patchSha256, target },
      };
    },
  },
} as never);
mock.module("./proposals", {
  namedExports: {
    createProposal: async (_execution: AgentExecutionContext, input: Record<string, unknown>) => {
      recordedProposal = input;
      return { proposalId: 73 };
    },
  },
} as never);

const execFile = promisify(execFileCallback);

const { prProposalTool, sourceSearchTool } = await import("./source-code-tools");

const SOURCE_ENV_KEYS = [
  "AGENT_SOURCE_WORKTREE",
  "AGENT_SOURCE_CACHE_DIR",
  "AGENT_SOURCE_REPO_URL",
  "AGENT_SOURCE_BRANCH",
  "WORKSPACE_CONFIG_DIR",
  "GIT_ALLOW_PROTOCOL",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
] as const;

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFile("git", args, { cwd, encoding: "utf8" });
  return String(stdout).trim();
}

async function initializeGitRepo(repoDir: string) {
  await mkdir(repoDir, { recursive: true });
  await git(repoDir, ["init", "-q", "-b", "main"]);
  await git(repoDir, ["config", "user.email", "agent-source-test@example.invalid"]);
  await git(repoDir, ["config", "user.name", "Agent Source Test"]);
}

async function commitAll(repoDir: string, message: string) {
  await git(repoDir, ["add", "--all"]);
  await git(repoDir, ["commit", "-q", "-m", message]);
}

async function withSourceEnvironment<T>(
  values: Partial<Record<typeof SOURCE_ENV_KEYS[number], string>>,
  task: () => Promise<T>,
) {
  const previous = Object.fromEntries(SOURCE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of SOURCE_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return await task();
  } finally {
    for (const key of SOURCE_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function pathExists(target: string) {
  return Boolean(await lstat(target).catch(() => null));
}

const execution = {
  requester: { id: 11, username: "requester" },
  actor: { id: 22, username: "agent-dev", canLogin: false },
  profile: null,
} satisfies AgentExecutionContext;

test("source PR tool ignores model target hints and stores the full reviewable server binding", async () => {
  const previous = {
    repo: process.env.CNB_PR_REPO,
    api: process.env.CNB_API_BASE_URL,
    git: process.env.CNB_GIT_BASE_URL,
    base: process.env.CNB_PR_BASE_BRANCH,
    prefix: process.env.CNB_PR_BRANCH_PREFIX,
  };
  Object.assign(process.env, {
    CNB_PR_REPO: "server/AllowedRepo",
    CNB_API_BASE_URL: "https://api.allowed.test",
    CNB_GIT_BASE_URL: "https://git.allowed.test",
    CNB_PR_BASE_BRANCH: "main",
    CNB_PR_BRANCH_PREFIX: "agent",
  });

  const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new";
  try {
    const result = await prProposalTool.execute({
      title: "Bound patch",
      summary: "The exact patch is reviewable.",
      files: ["a.ts"],
      validation: ["npm test"],
      risks: [],
      patch,
      repository: "model/EvilRepo",
      baseBranch: "model-controlled",
    }, execution);

    assert.equal(result.type, "proposal");
    assert.ok(recordedProposal);
    const payload = recordedProposal.payload as Record<string, unknown>;
    const diff = recordedProposal.diff as Record<string, unknown>;
    const binding = payload.binding as Record<string, unknown>;
    const target = diff.target as Record<string, unknown>;
    const patchSha256 = createHash("sha256").update(patch, "utf8").digest("hex");

    assert.equal(recordedProposal.targetId, "https://git.allowed.test/server/AllowedRepo.git");
    assert.equal(payload.patch, patch);
    assert.equal(diff.patch, patch);
    assert.equal(diff.patchSha256, patchSha256);
    assert.equal(binding.repository, "server/AllowedRepo");
    assert.equal(binding.baseBranch, "main");
    assert.equal(binding.baseCommit, "b".repeat(40));
    assert.equal(target.repositoryUrl, "https://git.allowed.test/server/AllowedRepo.git");
    assert.equal(target.apiBaseUrl, "https://api.allowed.test");
    assert.equal(target.baseBranch, "main");
    assert.equal(target.baseCommit, binding.baseCommit);
    assert.equal(target.branch, binding.branch);
    assert.doesNotMatch(String(binding.branch), /model-controlled|EvilRepo/);
  } finally {
    for (const [key, value] of [
      ["CNB_PR_REPO", previous.repo],
      ["CNB_API_BASE_URL", previous.api],
      ["CNB_GIT_BASE_URL", previous.git],
      ["CNB_PR_BASE_BRANCH", previous.base],
      ["CNB_PR_BRANCH_PREFIX", previous.prefix],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("source search refuses tracked, untracked, startup, and route-seed symlink escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-source-symlink-"));
  const repoDir = path.join(root, "repo");
  const outsideFile = path.join(root, "host-secret.ts");
  const leakedValue = "LEAKED_HOST_VALUE_7f830d64";

  try {
    await initializeGitRepo(repoDir);
    await writeFile(outsideFile, `import "./also-host-only";\nexport const HOST_SECRET = "${leakedValue}";\n`, "utf8");
    await mkdir(path.join(repoDir, "docs", "engineering"), { recursive: true });
    await mkdir(path.join(repoDir, "packages", "platform", "server", "agent"), { recursive: true });
    await mkdir(path.join(repoDir, "app", "(modules)", "escape"), { recursive: true });
    await symlink(outsideFile, path.join(repoDir, "AGENTS.md"));
    await symlink(outsideFile, path.join(repoDir, "packages", "platform", "server", "agent", "tracked-escape.ts"));
    await symlink(outsideFile, path.join(repoDir, "app", "(modules)", "escape", "page.tsx"));
    await writeFile(path.join(repoDir, "docs", "README.md"), "# Safe docs\n", "utf8");
    await writeFile(path.join(repoDir, "docs", "engineering", "project-overview.md"), "# Safe overview\n", "utf8");
    await writeFile(path.join(repoDir, "docs", "engineering", "agent-startup.md"), "# Safe startup\n", "utf8");
    await writeFile(
      path.join(repoDir, "packages", "platform", "server", "agent", "safe.ts"),
      'export const HOST_SECRET = "SAFE_REPOSITORY_VALUE";\n',
      "utf8",
    );
    await commitAll(repoDir, "initial source fixture");
    await symlink(outsideFile, path.join(repoDir, "packages", "platform", "server", "agent", "untracked-escape.ts"));

    await withSourceEnvironment({ AGENT_SOURCE_WORKTREE: repoDir }, async () => {
      const result = await sourceSearchTool.execute({ query: "- path: /escape\nHOST_SECRET agent source" }, execution);
      assert.equal(result.type, "data");
      assert.doesNotMatch(JSON.stringify(result), new RegExp(leakedValue));

      const data = result.data as {
        startupContext: Array<{ file: string }>;
        routeContext: { seedFiles: string[] };
        snippets: Array<{ file: string; text: string }>;
      };
      assert.equal(data.startupContext.some((item) => item.file === "AGENTS.md"), false);
      assert.equal(data.routeContext.seedFiles.includes("app/(modules)/escape/page.tsx"), false);
      assert.equal(data.snippets.some((item) => item.file.includes("escape")), false);
      assert.ok(data.snippets.some((item) => item.file.endsWith("/safe.ts")));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote source cache refuses an existing unowned workspace without resetting human changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-source-unowned-"));
  const sharedRepo = path.join(root, "shared-workspace");
  const sourceFile = path.join(sharedRepo, "tracked.ts");

  try {
    await initializeGitRepo(sharedRepo);
    await writeFile(sourceFile, 'export const state = "committed";\n', "utf8");
    await commitAll(sharedRepo, "shared baseline");
    await writeFile(sourceFile, 'export const state = "human-uncommitted-work";\n', "utf8");
    const beforeHead = await git(sharedRepo, ["rev-parse", "HEAD"]);
    const beforeStatus = await git(sharedRepo, ["status", "--porcelain"]);

    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: sharedRepo,
      AGENT_SOURCE_REPO_URL: "https://example.invalid/expected.git",
      AGENT_SOURCE_BRANCH: "main",
    }, async () => {
      await assert.rejects(
        () => sourceSearchTool.execute({ query: "tracked state" }, execution),
        /Refusing unowned Agent source cache/,
      );
    });

    assert.equal(await readFile(sourceFile, "utf8"), 'export const state = "human-uncommitted-work";\n');
    assert.equal(await git(sharedRepo, ["rev-parse", "HEAD"]), beforeHead);
    assert.equal(await git(sharedRepo, ["status", "--porcelain"]), beforeStatus);
    assert.equal(await pathExists(`${sharedRepo}.workspace-agent-source.lock`), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("managed source cache safely initializes under cross-process contention and reclaims an owned stale lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-source-cache-"));
  const sourceRepo = path.join(root, "source");
  const remoteRepo = path.join(root, "remote.git");
  const cacheDir = path.join(root, "managed-cache");
  const lockPath = `${cacheDir}.workspace-agent-source.lock`;
  const moduleUrl = new URL("./source-repository.ts", import.meta.url).href;
  const childScript = `const { resolveSourceRepo } = await import(${JSON.stringify(moduleUrl)}); const repo = await resolveSourceRepo(); process.stdout.write(repo.commit);`;

  try {
    await initializeGitRepo(sourceRepo);
    await mkdir(path.join(sourceRepo, "docs", "engineering"), { recursive: true });
    await writeFile(path.join(sourceRepo, "AGENTS.md"), "# Agent fixture\n", "utf8");
    await writeFile(path.join(sourceRepo, "docs", "README.md"), "# Docs fixture\n", "utf8");
    await writeFile(path.join(sourceRepo, "docs", "engineering", "project-overview.md"), "# Overview fixture\n", "utf8");
    await writeFile(path.join(sourceRepo, "docs", "engineering", "agent-startup.md"), "# Startup fixture\n", "utf8");
    await writeFile(path.join(sourceRepo, "cache_query.ts"), 'export const CACHE_QUERY = "remote-source";\n', "utf8");
    await commitAll(sourceRepo, "remote source fixture");
    await git(root, ["clone", "-q", "--bare", sourceRepo, remoteRepo]);
    await writeFile(lockPath, `${JSON.stringify({
      owner: "workspace-agent-source-cache-lock",
      version: 1,
      token: "stale-owned-lock-token-0001",
      pid: 2_147_483_647,
      createdAt: "2000-01-01T00:00:00.000Z",
    })}\n`, "utf8");

    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: cacheDir,
      AGENT_SOURCE_REPO_URL: remoteRepo,
      AGENT_SOURCE_BRANCH: "main",
    }, async () => {
      const childEnv = { ...process.env, AGENT_SOURCE_WORKTREE: "" };
      const args = ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", childScript];
      const children = await Promise.all([
        execFile(process.execPath, args, { cwd: process.cwd(), env: childEnv, encoding: "utf8", timeout: 20_000 }),
        execFile(process.execPath, args, { cwd: process.cwd(), env: childEnv, encoding: "utf8", timeout: 20_000 }),
      ]);
      assert.equal(children[0].stdout.trim(), children[1].stdout.trim());

      const [first, second] = await Promise.all([
        sourceSearchTool.execute({ query: "CACHE_QUERY" }, execution),
        sourceSearchTool.execute({ query: "CACHE_QUERY" }, execution),
      ]);
      assert.equal(first.type, "data");
      assert.equal(second.type, "data");
    });

    const marker = JSON.parse(await readFile(path.join(cacheDir, ".workspace-agent-source-cache.json"), "utf8")) as Record<string, unknown>;
    assert.equal(marker.owner, "workspace-agent-source-cache");
    assert.equal(marker.version, 1);
    assert.equal(await pathExists(lockPath), false);

    await writeFile(lockPath, '{"owner":', "utf8");
    const expiredLockTime = new Date("2000-01-01T00:00:00.000Z");
    await utimes(lockPath, expiredLockTime, expiredLockTime);
    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: cacheDir,
      AGENT_SOURCE_REPO_URL: remoteRepo,
      AGENT_SOURCE_BRANCH: "main",
    }, async () => {
      const result = await sourceSearchTool.execute({ query: "CACHE_QUERY" }, execution);
      assert.equal(result.type, "data");
    });
    assert.equal(await pathExists(lockPath), false);

    const foreignLock = `${JSON.stringify({
      owner: "human-workspace-lock",
      version: 1,
      token: "foreign-lock-token-that-must-survive",
      pid: 2_147_483_647,
      createdAt: "2000-01-01T00:00:00.000Z",
    })}\n`;
    await writeFile(lockPath, foreignLock, "utf8");
    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: cacheDir,
      AGENT_SOURCE_REPO_URL: remoteRepo,
      AGENT_SOURCE_BRANCH: "main",
    }, async () => {
      await assert.rejects(
        () => sourceSearchTool.execute({ query: "CACHE_QUERY" }, execution),
        /unrecognized Agent source cache lock/,
      );
    });
    assert.equal(await readFile(lockPath, "utf8"), foreignLock);
    await rm(lockPath, { force: true });

    await git(cacheDir, ["remote", "set-url", "origin", path.join(root, "other.git")]);
    await writeFile(path.join(cacheDir, "cache_query.ts"), 'export const CACHE_QUERY = "human-cache-debug";\n', "utf8");
    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: cacheDir,
      AGENT_SOURCE_REPO_URL: remoteRepo,
      AGENT_SOURCE_BRANCH: "main",
    }, async () => {
      await assert.rejects(
        () => sourceSearchTool.execute({ query: "CACHE_QUERY" }, execution),
        /mismatched origin/,
      );
    });
    assert.equal(await readFile(path.join(cacheDir, "cache_query.ts"), "utf8"), 'export const CACHE_QUERY = "human-cache-debug";\n');
    assert.equal(await pathExists(lockPath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remote source snapshot and tool context never expose repository URL credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-source-redaction-"));
  const sourceRepo = path.join(root, "source");
  const remoteRepo = path.join(root, "remote.git");
  const cacheDir = path.join(root, "cache");
  const secret = "source-token-must-not-leak";

  try {
    await initializeGitRepo(sourceRepo);
    await writeFile(path.join(sourceRepo, "credential-check.ts"), 'export const CREDENTIAL_CHECK = "safe";\n', "utf8");
    await commitAll(sourceRepo, "credential redaction fixture");
    await git(root, ["clone", "-q", "--bare", sourceRepo, remoteRepo]);
    const origin = `https://agent-user:${secret}@source.example.test/workspace.git`;
    const repositoryIdentity = "https://source.example.test/workspace";

    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: cacheDir,
      AGENT_SOURCE_REPO_URL: origin,
      AGENT_SOURCE_BRANCH: "main",
      GIT_ALLOW_PROTOCOL: "file:https",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(remoteRepo).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: origin,
    }, async () => {
      const result = await sourceSearchTool.execute({ query: "CREDENTIAL_CHECK" }, execution);
      assert.notEqual(result.type, "error");
      const data = result.data as { repoUrl: string };
      assert.equal(data.repoUrl, repositoryIdentity);
      assert.doesNotMatch(JSON.stringify(result), /agent-user|source-token-must-not-leak/);
      assert.equal(await git(cacheDir, ["config", "--get", "remote.origin.url"]), origin);
    });

    await withSourceEnvironment({
      AGENT_SOURCE_CACHE_DIR: path.join(root, "failed-cache"),
      AGENT_SOURCE_REPO_URL: origin,
      AGENT_SOURCE_BRANCH: "main",
      GIT_ALLOW_PROTOCOL: "file:https",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(path.join(root, "missing.git")).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: origin,
    }, async () => {
      await assert.rejects(
        () => sourceSearchTool.execute({ query: "CREDENTIAL_CHECK" }, execution),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /agent-user|source-token-must-not-leak/);
          return true;
        },
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
