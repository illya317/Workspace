import assert from "node:assert/strict";
import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LIBRARY_EXPORT_RETENTION_MS,
  libraryExportExpiresAt,
  removeLibraryExportFiles,
} from "./export-retention";

test("export expiry uses the controlled-download lifetime", () => {
  const finishedAt = new Date("2026-07-13T00:00:00.000Z");
  assert.equal(libraryExportExpiresAt(finishedAt).getTime(), finishedAt.getTime() + LIBRARY_EXPORT_RETENTION_MS);
});

test("expired export cleanup removes only its generated directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "library-export-retention-"));
  const exportUid = "3a712c7d-a1a0-4a1a-94d9-c966f7e37f0e";
  const target = path.join(root, "exports", exportUid);
  const sibling = path.join(root, "exports", "keep");
  await mkdir(target, { recursive: true });
  await mkdir(sibling, { recursive: true });
  await writeFile(path.join(target, "资料包.zip"), "temporary");

  await removeLibraryExportFiles(exportUid, root);

  await assert.rejects(stat(target));
  assert.equal((await stat(sibling)).isDirectory(), true);
  await assert.rejects(removeLibraryExportFiles("../escape", root), /Invalid export uid/);
});
