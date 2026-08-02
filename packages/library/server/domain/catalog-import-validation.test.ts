import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImportCatalogRecordCommand,
  buildImportCatalogRecordCommand,
} from "./catalog-import-validation";

test("revalidates a prepared catalog import command at the write boundary", () => {
  const command = buildImportCatalogRecordCommand({
    rootKey: "library",
    path: "policies/example.pdf",
    checksumSha256: "a".repeat(64),
  });
  assert.equal(command.ok, true);
  if (!command.ok) return;
  assert.deepEqual(assertImportCatalogRecordCommand(command.data), command.data);
});

test("rejects a prepared catalog command whose stable key does not match its path", () => {
  assert.throws(
    () => assertImportCatalogRecordCommand({
      stableKey: "library:other.pdf",
      path: "policies/example.pdf",
      checksumSha256: "a".repeat(64),
    }),
    /stable key does not match/i,
  );
});
