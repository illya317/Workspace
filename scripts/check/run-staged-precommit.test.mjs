import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve(import.meta.dirname, "run-staged-precommit.mjs");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("staged pre-commit executes the index content instead of later worktree edits", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "staged-precommit-test-"));
  try {
    git(repository, ["init", "-q"]);
    git(repository, ["config", "user.email", "checks@example.test"]);
    git(repository, ["config", "user.name", "Checks"]);
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({
      scripts: {
        "check:precommit:snapshot": "node verify.mjs",
      },
    }));
    fs.writeFileSync(path.join(repository, "verify.mjs"), [
      "import fs from 'node:fs';",
      "if (fs.readFileSync('candidate.txt', 'utf8') !== 'staged\\n') process.exit(17);",
    ].join("\n"));
    fs.mkdirSync(path.join(repository, "node_modules"));
    fs.writeFileSync(path.join(repository, "candidate.txt"), "base\n");
    git(repository, ["add", "."]);
    git(repository, ["commit", "-qm", "base"]);

    fs.writeFileSync(path.join(repository, "candidate.txt"), "staged\n");
    git(repository, ["add", "candidate.txt"]);
    fs.writeFileSync(path.join(repository, "candidate.txt"), "unstaged\n");

    const result = spawnSync(process.execPath, [script], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_INDEX_FILE: ".git/index",
        STAGED_PRECOMMIT_REPOSITORY_ROOT: repository,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(repository, "candidate.txt"), "utf8"), "unstaged\n");
    assert.equal(git(repository, ["show", ":candidate.txt"]), "staged");
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});
