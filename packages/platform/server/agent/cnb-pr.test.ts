import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  assertCnbPrStagedFilesMatch,
  buildCnbCreateOnlyPushArgs,
  buildCnbPullRequestProposalBinding,
  buildCnbPullRequestProposalDraft,
  executeCnbPullRequestProposal,
  normalizeCnbPrDeclaredFiles,
} from "./cnb-pr";

const execFile = promisify(execFileCallback);

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFile("git", args, { cwd, encoding: "utf8" });
  return String(stdout).trim();
}

const ENV_KEYS = [
  "CNB_PR_REPO",
  "AGENT_SOURCE_REPO_SLUG",
  "CNB_API_BASE_URL",
  "CNB_GIT_BASE_URL",
  "CNB_PR_BASE_BRANCH",
  "AGENT_SOURCE_BRANCH",
  "CNB_PR_BRANCH_PREFIX",
  "CNB_PR_DRY_RUN",
] as const;

async function withTestEnvironment<T>(run: () => T | Promise<T>): Promise<T> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    CNB_PR_REPO: "workspace/BoundRepo",
    CNB_API_BASE_URL: "https://api.example.test/cnb",
    CNB_GIT_BASE_URL: "https://git.example.test",
    CNB_PR_BASE_BRANCH: "release/next",
    CNB_PR_BRANCH_PREFIX: "agent-bound",
    CNB_PR_DRY_RUN: "1",
  });
  delete process.env.AGENT_SOURCE_REPO_SLUG;
  delete process.env.AGENT_SOURCE_BRANCH;
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const patch = [
  "diff --git a/packages/example.ts b/packages/example.ts",
  "--- a/packages/example.ts",
  "+++ b/packages/example.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
].join("\n");
const baseCommit = "a".repeat(40);
const bindingDependencies = {
  remoteBaseCommitResolver: async () => baseCommit,
};

test("PR draft exposes and persists the exact patch and server-owned deterministic target binding", async () => {
  await withTestEnvironment(async () => {
    const draft = await buildCnbPullRequestProposalDraft({
      title: "Bind proposal target",
      summary: "Bind what the reviewer sees to what the executor runs.",
      files: ["packages/example.ts"],
      validation: ["npm test"],
      risks: ["Review the patch"],
      patch,
    }, bindingDependencies);
    const expectedHash = createHash("sha256").update(patch, "utf8").digest("hex");

    assert.equal(draft.diff.patch, patch);
    assert.equal(draft.diff.patchSha256, expectedHash);
    assert.equal(draft.binding.patchSha256, expectedHash);
    assert.deepEqual(draft.payload.binding, draft.binding);
    assert.deepEqual(draft.diff.target, {
      repository: "workspace/BoundRepo",
      repositoryUrl: "https://git.example.test/workspace/BoundRepo.git",
      apiBaseUrl: "https://api.example.test/cnb",
      gitBaseUrl: "https://git.example.test",
      baseBranch: "release/next",
      baseCommit,
      branch: draft.binding.branch,
    });
    assert.match(draft.binding.branch, new RegExp(`^agent-bound/${expectedHash}-bind-proposal-target$`));
    assert.deepEqual(
      await buildCnbPullRequestProposalBinding({ title: "Bind proposal target", patch }, bindingDependencies),
      draft.binding,
    );
  });
});

test("server binding resolves and validates the remote base branch commit", async () => {
  await withTestEnvironment(async () => {
    let resolverInput: Record<string, string> | null = null;
    const binding = await buildCnbPullRequestProposalBinding({ title: "Remote base", patch }, {
      remoteBaseCommitResolver: async (input) => {
        resolverInput = input;
        return baseCommit.toUpperCase();
      },
    });

    assert.deepEqual(resolverInput, {
      repositoryUrl: "https://git.example.test/workspace/BoundRepo.git",
      baseBranch: "release/next",
      proposalBranch: binding.branch,
    });
    assert.equal(binding.baseCommit, baseCommit);

    await assert.rejects(
      buildCnbPullRequestProposalBinding({ title: "Remote base", patch }, {
        remoteBaseCommitResolver: async () => "short-sha",
      }),
      /base commit 不是完整 Git object ID/,
    );
  });
});

test("confirmation rejects a changed patch or drifted server target before any CNB side effect", async () => {
  await withTestEnvironment(async () => {
    let dispatchStarted = false;
    const control = { markExternalDispatchStarted: () => { dispatchStarted = true; } };
    const draft = await buildCnbPullRequestProposalDraft({
      title: "Bind proposal target",
      summary: "Bound proposal",
      files: ["packages/example.ts"],
      validation: [],
      risks: [],
      patch,
    }, bindingDependencies);

    const dryRun = await executeCnbPullRequestProposal(draft.payload);
    assert.ok("dryRun" in dryRun);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.patchSha256, draft.binding.patchSha256);
    assert.equal(dryRun.repositoryUrl, draft.binding.repositoryUrl);

    await assert.rejects(
      executeCnbPullRequestProposal(
        { ...draft.payload, patch: `${patch}\n+tampered` },
        undefined,
        control,
      ),
      /patch SHA-256 不匹配/,
    );
    assert.equal(dispatchStarted, false);

    process.env.CNB_API_BASE_URL = "https://new-api.example.test";
    await assert.rejects(
      executeCnbPullRequestProposal(draft.payload, undefined, control),
      /目标已漂移（apiBaseUrl）/,
    );
    assert.equal(dispatchStarted, false);
  });
});

test("declared paths must be canonical safe repository-relative paths", () => {
  assert.deepEqual(
    normalizeCnbPrDeclaredFiles(["packages/a.ts", "packages/a.ts", "docs/guide.md"]),
    ["packages/a.ts", "docs/guide.md"],
  );

  for (const file of [
    "../secret",
    "packages/../secret",
    "/absolute.ts",
    "C:\\absolute.ts",
    "packages//a.ts",
    ".git/config",
    "packages/a.ts\npackages/b.ts",
    " packages/a.ts",
  ]) {
    assert.throws(() => normalizeCnbPrDeclaredFiles([file]), /仓库相对路径/);
  }
});

test("staged file set must exactly equal the proposal declaration", () => {
  assert.doesNotThrow(() => assertCnbPrStagedFilesMatch(
    ["packages/a.ts", "docs/guide.md"],
    ["docs/guide.md", "packages/a.ts"],
  ));
  assert.throws(
    () => assertCnbPrStagedFilesMatch(["packages/a.ts"], ["packages/a.ts", "packages/unseen.ts"]),
    /实际暂存文件与 proposal 声明不一致/,
  );
  assert.throws(
    () => assertCnbPrStagedFilesMatch(["packages/a.ts", "docs/missing.md"], ["packages/a.ts"]),
    /实际暂存文件与 proposal 声明不一致/,
  );
});

test("create-only proposal push atomically rejects a concurrent writer for the same deterministic branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-cnb-create-only-"));
  const seed = path.join(root, "seed");
  const remote = path.join(root, "remote.git");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  const branch = "agent/concurrent-proposal";

  try {
    await git(root, ["init", "-q", "-b", "main", seed]);
    await git(seed, ["config", "user.name", "CNB Push Test"]);
    await git(seed, ["config", "user.email", "cnb-push-test@example.invalid"]);
    await writeFile(path.join(seed, "base.txt"), "base\n", "utf8");
    await git(seed, ["add", "base.txt"]);
    await git(seed, ["commit", "-q", "-m", "base"]);
    await git(root, ["clone", "-q", "--bare", seed, remote]);
    await Promise.all([
      git(root, ["clone", "-q", remote, first]),
      git(root, ["clone", "-q", remote, second]),
    ]);

    for (const [repo, value] of [[first, "first"], [second, "second"]] as const) {
      await git(repo, ["config", "user.name", "CNB Push Test"]);
      await git(repo, ["config", "user.email", "cnb-push-test@example.invalid"]);
      await writeFile(path.join(repo, "proposal.txt"), `${value}\n`, "utf8");
      await git(repo, ["add", "proposal.txt"]);
      await git(repo, ["commit", "-q", "-m", `proposal ${value}`]);
    }

    const pushArgs = buildCnbCreateOnlyPushArgs(branch);
    assert.deepEqual(pushArgs, [
      "push",
      `--force-with-lease=refs/heads/${branch}:`,
      "origin",
      `HEAD:refs/heads/${branch}`,
    ]);
    await git(first, pushArgs);
    const firstCommit = await git(first, ["rev-parse", "HEAD"]);

    await assert.rejects(() => execFile("git", pushArgs, { cwd: second, encoding: "utf8" }));
    assert.equal(await git(root, [`--git-dir=${remote}`, "rev-parse", `refs/heads/${branch}`]), firstCommit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
