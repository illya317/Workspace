const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { changedFileSets, parseNullSeparated } = require("./changed-files");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-changed-files-"));
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.email", "ci@example.invalid"]);
  git(cwd, ["config", "user.name", "Workspace CI"]);
  fs.writeFileSync(path.join(cwd, "alpha.ts"), "export const alpha = 1;\n");
  git(cwd, ["add", "alpha.ts"]);
  git(cwd, ["commit", "-qm", "base"]);
  const base = git(cwd, ["rev-parse", "HEAD"]);
  return { cwd, base };
}

test("parseNullSeparated preserves filenames containing newlines", () => {
  assert.deepEqual(parseNullSeparated(Buffer.from("a\nb.ts\0plain.ts\0")), ["a\nb.ts", "plain.ts"]);
});

test("explicit base/head diff works in a clean checkout", (t) => {
  const { cwd, base } = fixture();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "alpha.ts"), "export const alpha = 2;\n");
  fs.writeFileSync(path.join(cwd, "beta.ts"), "export const beta = 1;\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "head"]);
  const head = git(cwd, ["rev-parse", "HEAD"]);

  const result = changedFileSets({
    cwd,
    env: { WORKSPACE_DIFF_BASE: base, WORKSPACE_DIFF_HEAD: head },
  });

  assert.equal(result.source, "explicit-diff");
  assert.deepEqual(result.files, ["alpha.ts", "beta.ts"]);
});

test("local mode prefers the staged snapshot", (t) => {
  const { cwd } = fixture();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "alpha.ts"), "export const alpha = 2;\n");
  fs.writeFileSync(path.join(cwd, "untracked.ts"), "export const untracked = true;\n");
  git(cwd, ["add", "alpha.ts"]);

  const result = changedFileSets({ cwd, env: {} });

  assert.equal(result.source, "staged");
  assert.deepEqual(result.files, ["alpha.ts"]);
});

test("partial or invalid explicit refs fail closed", (t) => {
  const { cwd, base } = fixture();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  assert.throws(
    () => changedFileSets({ cwd, env: { WORKSPACE_DIFF_BASE: base } }),
    /must be set together/,
  );
  assert.throws(
    () => changedFileSets({ cwd, env: { WORKSPACE_DIFF_BASE: "--help", WORKSPACE_DIFF_HEAD: base } }),
    /must be HEAD or/,
  );
});
