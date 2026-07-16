import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createBootstrapContext, verifyBootstrapContext } from "./production-bootstrap-receipt.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "production-bootstrap-receipt-"));
  git(root, ["init"]);
  git(root, ["config", "user.name", "CI"]);
  git(root, ["config", "user.email", "ci@example.test"]);
  mkdirSync(path.join(root, "prisma/migrations/20200101000000_init"), { recursive: true });
  writeFileSync(path.join(root, "prisma/migrations/20200101000000_init/migration.sql"), "CREATE TABLE example(id INT);\n");
  writeFileSync(path.join(root, ".cnb.yml"), "placeholder\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  const baseline = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(path.join(root, ".cnb.yml"), "legacy release\n");
  git(root, ["add", ".cnb.yml"]);
  git(root, ["commit", "-m", "legacy injection"]);
  const legacy = git(root, ["rev-parse", "HEAD"]);
  git(root, ["checkout", "-b", "candidate", baseline]);
  writeFileSync(path.join(root, "README.md"), "candidate\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "candidate"]);
  const candidate = git(root, ["rev-parse", "HEAD"]);
  return { root, baseline, legacy, candidate };
}

test("receipt binds baseline migrations, legacy injection, and candidate ancestry", () => {
  const f = fixture();
  const context = createBootstrapContext({
    cwd: f.root,
    baselineSha: f.baseline,
    candidateSha: f.candidate,
    legacyCnbCommitSha: f.legacy,
    legacyReleaseId: `20260715164825-${f.legacy.slice(0, 8)}`,
    legacyCnbBuildSn: "cnb-8gh-1jtif23er",
    legacyRuntimeVersion: "local-1784105165477",
    legacyBuildId: "local-1784105165133",
    legacyCnbRepository: "illya317/Workspace",
  });
  assert.equal(context.database.migrationCount, 1);
  assert.match(context.database.migrationSetSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyBootstrapContext({ cwd: f.root, candidateSha: f.candidate, context }), context);
});

test("receipt rejects a legacy commit that is not a one-file child of baseline", () => {
  const f = fixture();
  assert.throws(() => createBootstrapContext({
    cwd: f.root,
    baselineSha: f.baseline,
    candidateSha: f.candidate,
    legacyCnbCommitSha: f.candidate,
    legacyReleaseId: `20260715164825-${f.candidate.slice(0, 8)}`,
    legacyCnbBuildSn: "cnb-8gh-1jtif23er",
    legacyRuntimeVersion: "local-1784105165477",
    legacyBuildId: "local-1784105165133",
    legacyCnbRepository: "illya317/Workspace",
  }), /legacy CNB injection commit/);
});
