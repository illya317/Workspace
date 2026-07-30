import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDatabaseReplacementReceipt,
  validateDatabaseReplacementReceipt,
} from "./database-replacement.mjs";

function fixture(context) {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-database-replacement-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const migrationRoot = path.join(root, "prisma", "migrations");
  mkdirSync(path.join(migrationRoot, "20260729000000_example"), { recursive: true });
  writeFileSync(path.join(migrationRoot, "migration_lock.toml"), 'provider = "postgresql"\n');
  writeFileSync(path.join(migrationRoot, "20260729000000_example", "migration.sql"), "CREATE TABLE example(id int);\n");
  const dump = path.join(root, "database.dump");
  writeFileSync(dump, "not-a-real-dump-but-an-immutable-test-fixture\n");
  return { root, dump };
}

test("database replacement receipt binds source, dump, and migration set", (context) => {
  const files = fixture(context);
  const sourceSha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const receipt = createDatabaseReplacementReceipt({
    sourceSha,
    treeSha,
    dumpFile: files.dump,
    repositoryRoot: files.root,
    preparedAt: "2026-07-29T00:00:00.000Z",
  });
  assert.equal(validateDatabaseReplacementReceipt(receipt, { sourceSha, treeSha }), receipt);
  assert.equal(receipt.database.migrationCount, 1);
  assert.match(receipt.database.migrationSetSha256, /^[0-9a-f]{64}$/);
  assert.equal(
    receipt.dump.remoteArtifact,
    `${sourceSha}/${receipt.dump.sha256}/workspace-postgresql.dump`,
  );
});

test("database replacement receipt fails closed across source trees and artifact paths", (context) => {
  const files = fixture(context);
  const sourceSha = "a".repeat(40);
  const treeSha = "b".repeat(40);
  const receipt = createDatabaseReplacementReceipt({ sourceSha, treeSha, dumpFile: files.dump, repositoryRoot: files.root });
  assert.throws(
    () => validateDatabaseReplacementReceipt(receipt, { sourceSha, treeSha: "c".repeat(40) }),
    /different source tree/,
  );
  assert.throws(
    () => validateDatabaseReplacementReceipt({
      ...receipt,
      dump: { ...receipt.dump, remoteArtifact: "../../database.dump" },
    }, { sourceSha, treeSha }),
    /dump descriptor/,
  );
});
