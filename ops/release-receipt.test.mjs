import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main, normalizeDeployedRelease } from "./release-receipt.mjs";

const a = "a".repeat(40);
const b = "b".repeat(40);
const c = "c".repeat(40);
const d = "d".repeat(40);
const digest = (value) => value.repeat(64);

test("legacy CNB receipts normalize to one runtime and canonical source", () => {
  for (const record of [
    {
      schemaVersion: 1,
      source: { commitSha: a, treeSha: b },
      artifact: { sha256: digest("1"), manifestSha256: digest("2") },
      cnb: { repository: "illya317/Workspace", sourceBranch: "main", injectionSha: c },
    },
    {
      schemaVersion: 2,
      source: { commitSha: a, treeSha: b },
      artifact: { sha256: digest("1"), manifestSha256: digest("2") },
      cnb: { repository: "illya317/Workspace", sourceBranch: "main", releaseCommitSha: c },
    },
  ]) {
    const normalized = normalizeDeployedRelease(record, { expectedRepository: "illya317/Workspace" });
    assert.equal(normalized.transport, "cnb");
    assert.equal(normalized.runtimeSource.commitSha, a);
    assert.equal(normalized.canonicalSource.commitSha, a);
    assert.equal(normalized.cnb.injectionSha, c);
  }
});

test("v3 receipts reject unsupported transports", () => {
  assert.throws(() => normalizeDeployedRelease({
    schemaVersion: 3,
    source: { commitSha: d, treeSha: c },
    canonicalSource: { commitSha: a, treeSha: b },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "ssh-hotfix", scopePolicy: "off" },
    cnb: { repository: "illya317/Workspace", sourceBranch: "main", injectionSha: c },
    deployment: { releaseId: `20260717170000-${d.slice(0, 8)}`, releaseDir: `/srv/releases/${d.slice(0, 8)}` },
  }, { expectedRepository: "illya317/Workspace" }), /unsupported release transport: ssh-hotfix/);
});

test("v3 CNB receipt cannot claim a different canonical source", () => {
  assert.throws(() => normalizeDeployedRelease({
    schemaVersion: 3,
    source: { commitSha: d, treeSha: c },
    canonicalSource: { commitSha: a, treeSha: b },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "cnb" },
    cnb: { repository: "illya317/Workspace", sourceBranch: "main", injectionSha: c },
  }), /bind runtime and canonical source equally/);
});

test("write creates an atomic schema-v3 receipt that assert can verify", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "workspace-release-receipt-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "deployed-release.json");
  await main([
    "write",
    "--file", file,
    "--runtime-source", d,
    "--runtime-tree", c,
    "--canonical-source", d,
    "--canonical-tree", c,
    "--artifact-sha", digest("1"),
    "--manifest-sha", digest("2"),
    "--migration-set", digest("3"),
    "--cnb-repository", "illya317/Workspace",
    "--cnb-branch", "main",
    "--cnb-injection", c,
    "--release-id", `20260717170000-${d.slice(0, 8)}`,
    "--release-dir", `/srv/releases/${d.slice(0, 8)}`,
  ]);
  const record = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.transport.kind, "cnb");
  await main([
    "assert",
    "--file", file,
    "--expected-repository", "illya317/Workspace",
    "--runtime-source", d,
    "--canonical-source", d,
    "--artifact-sha", digest("1"),
  ]);
});

test("retired transport options cannot recreate a secondary receipt", async () => {
  await assert.rejects(() => main([
    "write",
    "--file", "/tmp/unused-release-receipt.json",
    "--transport", "ssh-hotfix",
  ]), /--transport is no longer supported/);
});
