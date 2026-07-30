import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { preflightProductionDeploy } from "./production-deploy-preflight.mjs";

const digest = (character) => character.repeat(64);
const injectionSha = "f".repeat(40);

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commitAll(cwd, message) {
  git(cwd, "add", "--all");
  git(cwd, "commit", "-m", message);
  return {
    sha: git(cwd, "rev-parse", "HEAD"),
    tree: git(cwd, "rev-parse", "HEAD^{tree}"),
  };
}

function writeMigration(cwd, name, sql) {
  const directory = join(cwd, "prisma", "migrations", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "migration.sql"), sql);
}

function createRepository(context) {
  const cwd = mkdtempSync(join(tmpdir(), "workspace-production-preflight-"));
  context.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "init", "--initial-branch=main");
  git(cwd, "config", "user.name", "Workspace Test");
  git(cwd, "config", "user.email", "workspace-test@example.com");
  writeMigration(
    cwd,
    "20260718010000_base",
    "-- workspace:migration-mode=expand\nCREATE TABLE \"BaseRecord\" (\"id\" TEXT PRIMARY KEY);\n",
  );
  const production = commitAll(cwd, "base");
  const receiptFile = join(cwd, "deployed-release.json");
  writeFileSync(receiptFile, `${JSON.stringify({
    schemaVersion: 3,
    source: { commitSha: production.sha, treeSha: production.tree },
    canonicalSource: { commitSha: production.sha, treeSha: production.tree },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "local" },
    cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha },
    deployment: { releaseId: `20260718010000-${production.sha.slice(0, 8)}` },
  })}\n`);
  return { cwd, production, receiptFile };
}

test("production preflight accepts a canonical descendant and reports cumulative migration mode", (context) => {
  const fixture = createRepository(context);
  writeMigration(
    fixture.cwd,
    "20260718020000_add_metric",
    "-- workspace:migration-mode=maintenance\nALTER TABLE \"BaseRecord\" RENAME COLUMN \"id\" TO \"recordId\";\n",
  );
  const candidate = commitAll(fixture.cwd, "candidate");
  const result = preflightProductionDeploy({
    cwd: fixture.cwd,
    receiptFile: fixture.receiptFile,
    candidateSha: candidate.sha,
    candidateTreeSha: candidate.tree,
    expectedRepository: "example-owner/example-repo",
  });

  assert.equal(result.order.action, "deploy");
  assert.equal(result.production.deployedSha, fixture.production.sha);
  assert.equal(result.migration.diffMode, "two-dot");
  assert.equal(result.migration.requiresMaintenance, true);
});

test("production preflight rejects an unsafe expand migration before release trigger", (context) => {
  const fixture = createRepository(context);
  writeMigration(
    fixture.cwd,
    "20260718020000_unsafe_expand",
    "-- workspace:migration-mode=expand\nALTER TABLE \"BaseRecord\" RENAME COLUMN \"id\" TO \"recordId\";\n",
  );
  const candidate = commitAll(fixture.cwd, "unsafe candidate");

  assert.throws(() => preflightProductionDeploy({
    cwd: fixture.cwd,
    receiptFile: fixture.receiptFile,
    candidateSha: candidate.sha,
    candidateTreeSha: candidate.tree,
    expectedRepository: "example-owner/example-repo",
  }), /migration policy failed[\s\S]*\[rename\]/);
});

test("production preflight rejects a candidate outside the canonical lineage", (context) => {
  const fixture = createRepository(context);
  git(fixture.cwd, "checkout", "--orphan", "diverged");
  git(fixture.cwd, "rm", "-r", "--cached", ".");
  rmSync(join(fixture.cwd, "prisma"), { recursive: true, force: true });
  writeFileSync(join(fixture.cwd, "diverged.txt"), "diverged\n");
  const candidate = commitAll(fixture.cwd, "diverged candidate");

  assert.throws(() => preflightProductionDeploy({
    cwd: fixture.cwd,
    receiptFile: fixture.receiptFile,
    candidateSha: candidate.sha,
    candidateTreeSha: candidate.tree,
    expectedRepository: "example-owner/example-repo",
  }), /not a proven descendant/);
});

test("production preflight accepts one linear sanitized genesis lineage only with the deployed baseline", (context) => {
  const fixture = createRepository(context);
  git(fixture.cwd, "checkout", "--orphan", "genesis");
  git(fixture.cwd, "rm", "-r", "--cached", ".");
  rmSync(join(fixture.cwd, "prisma"), { recursive: true, force: true });
  writeMigration(
    fixture.cwd,
    "00000000000000_sanitized_baseline",
    "-- workspace:migration-mode=maintenance\nCREATE TABLE \"BaseRecord\" (\"id\" TEXT PRIMARY KEY);\n",
  );
  writeFileSync(join(fixture.cwd, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
  commitAll(fixture.cwd, "genesis");
  writeFileSync(join(fixture.cwd, "post-genesis-fix.txt"), "fix\n");
  const descendant = commitAll(fixture.cwd, "post genesis fix");
  const result = preflightProductionDeploy({
    cwd: fixture.cwd,
    receiptFile: fixture.receiptFile,
    candidateSha: descendant.sha,
    candidateTreeSha: descendant.tree,
    expectedRepository: "example-owner/example-repo",
    genesisFromSha: fixture.production.sha,
  });
  assert.equal(result.order.reason, "audited-genesis-reset");
  assert.equal(result.migration.diffMode, "genesis");

  assert.throws(() => preflightProductionDeploy({
    cwd: fixture.cwd,
    receiptFile: fixture.receiptFile,
    candidateSha: descendant.sha,
    candidateTreeSha: descendant.tree,
    expectedRepository: "example-owner/example-repo",
    genesisFromSha: "f".repeat(40),
  }), /not the authorized genesis baseline/);
});
