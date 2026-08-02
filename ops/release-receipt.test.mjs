import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
    },
    {
      schemaVersion: 2,
      source: { commitSha: a, treeSha: b },
      artifact: { sha256: digest("1"), manifestSha256: digest("2") },
      cnb: { repository: "example-owner/example-repo", sourceBranch: "main", releaseCommitSha: c },
    },
  ]) {
    const normalized = normalizeDeployedRelease(record, { expectedRepository: "example-owner/example-repo" });
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
    cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
    deployment: { releaseId: `20260717170000-${d.slice(0, 8)}`, releaseDir: `/srv/releases/${d.slice(0, 8)}` },
  }, { expectedRepository: "example-owner/example-repo" }), /unsupported release transport: ssh-hotfix/);
});

test("v3 receipts preserve each governed release transport", () => {
  for (const transport of ["cnb", "local"]) {
    const normalized = normalizeDeployedRelease({
      schemaVersion: 3,
      source: { commitSha: d, treeSha: c },
      canonicalSource: { commitSha: d, treeSha: c },
      artifact: { sha256: digest("1"), manifestSha256: digest("2") },
      migration: { setSha256: digest("3") },
      transport: { kind: transport },
      cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
    });
    assert.equal(normalized.transport, transport);
    assert.equal(normalized.controller, null);
  }
});

test("v4 receipts require a complete controller identity", () => {
  const record = {
    schemaVersion: 4,
    source: { commitSha: d, treeSha: c },
    canonicalSource: { commitSha: d, treeSha: c },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "local" },
    cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
  };
  assert.throws(() => normalizeDeployedRelease(record), /schema v4 deployed-release controller is required/);
  record.controller = { sourceSha: b, treeId: a, controlDigest: digest("4"), receiptDigest: digest("5") };
  assert.deepEqual(normalizeDeployedRelease(record).controller, record.controller);
});

test("v3 CNB receipt cannot claim a different canonical source", () => {
  assert.throws(() => normalizeDeployedRelease({
    schemaVersion: 3,
    source: { commitSha: d, treeSha: c },
    canonicalSource: { commitSha: a, treeSha: b },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "cnb" },
    cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
  }), /bind runtime and canonical source equally/);
});

test("write creates atomic schema-v4 receipts with truthful transport and controller evidence", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "workspace-release-receipt-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const transport of ["cnb", "local"]) {
    const file = join(root, `deployed-release-${transport}.json`);
    await main([
      "write",
      "--file", file,
      "--transport", transport,
      "--runtime-source", d,
      "--runtime-tree", c,
      "--canonical-source", d,
      "--canonical-tree", c,
      "--artifact-sha", digest("1"),
      "--manifest-sha", digest("2"),
      "--migration-set", digest("3"),
      "--cnb-repository", "example-owner/example-repo",
      "--cnb-branch", "main",
      "--cnb-injection", c,
      "--controller-source", b,
      "--controller-tree", a,
      "--controller-control-digest", digest("4"),
      "--controller-receipt-digest", digest("5"),
      "--release-id", `20260717170000-${d.slice(0, 8)}`,
      "--release-dir", `/srv/releases/${d.slice(0, 8)}`,
    ]);
    const record = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(record.schemaVersion, 4);
    assert.equal(record.controller.sourceSha, b);
    assert.equal(record.transport.kind, transport);
    await main([
      "assert",
      "--file", file,
      "--expected-repository", "example-owner/example-repo",
      "--runtime-source", d,
      "--canonical-source", d,
      "--artifact-sha", digest("1"),
      "--transport", transport,
      "--controller-source", b,
      "--controller-receipt-digest", digest("5"),
    ]);
  }
});

test("controller activation preserves the deployed application identity and upgrades v3 atomically", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "workspace-controller-activation-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "deployed-release.json");
  const original = {
    schemaVersion: 3,
    source: { commitSha: d, treeSha: c },
    canonicalSource: { commitSha: d, treeSha: c },
    artifact: { sha256: digest("1"), manifestSha256: digest("2") },
    migration: { setSha256: digest("3") },
    transport: { kind: "local" },
    cnb: { repository: "example-owner/example-repo", sourceBranch: "main", injectionSha: c },
    deployment: { releaseId: `20260717170000-${d.slice(0, 8)}`, releaseDir: "/srv/releases/current", deployedAt: "2026-07-17T17:00:00.000Z" },
  };
  writeFileSync(file, `${JSON.stringify(original)}\n`);
  const args = [
    "activate-controller", "--file", file,
    "--expected-repository", "example-owner/example-repo",
    "--runtime-source", d, "--runtime-tree", c,
    "--canonical-source", d, "--canonical-tree", c,
    "--artifact-sha", digest("1"), "--migration-set", digest("3"), "--cnb-injection", c,
    "--controller-source", b, "--controller-tree", a,
    "--controller-control-digest", digest("4"), "--controller-receipt-digest", digest("5"),
  ];
  await main(args);
  const activated = JSON.parse(readFileSync(file, "utf8"));
  const { controller, ...applicationIdentity } = activated;
  assert.deepEqual({ ...applicationIdentity, schemaVersion: 3 }, original);
  assert.equal(activated.schemaVersion, 4);
  assert.deepEqual(controller, { sourceSha: b, treeId: a, controlDigest: digest("4"), receiptDigest: digest("5") });
  await main(args);
  const mismatched = [...args];
  mismatched[mismatched.indexOf(d)] = a;
  await assert.rejects(() => main(mismatched), /runtime source changed before controller activation/);
});

test("retired transport options cannot recreate a secondary receipt", async () => {
  await assert.rejects(() => main([
    "write",
    "--file", "/tmp/unused-release-receipt.json",
    "--transport", "local",
    "--scope-policy", "off",
  ]), /--scope-policy is no longer supported/);
});

test("write rejects retired transport kinds", async () => {
  await assert.rejects(() => main([
    "write",
    "--file", "/tmp/unused-release-receipt.json",
    "--transport", "ssh-hotfix",
  ]), /unsupported release transport: ssh-hotfix/);
});
