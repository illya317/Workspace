import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertArchiveRuntimePermissions,
  normalizeRuntimeTree,
} from "./runtime-tree-permissions.mjs";

const mode = (file) => fs.lstatSync(file).mode & 0o777;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-tree-permissions-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("normalizes an umask-077 runtime for an isolated read-only user", (t) => {
  const root = fixture(t);
  const previous = process.umask(0o077);
  try {
    fs.mkdirSync(path.join(root, "release/scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, "release/server.js"), "console.log('ready');\n");
    fs.writeFileSync(path.join(root, "release/scripts/start.sh"), "#!/bin/sh\n", { mode: 0o777 });
    fs.symlinkSync("server.js", path.join(root, "release/server-link.js"));
  } finally {
    process.umask(previous);
  }
  assert.equal(mode(path.join(root, "release")), 0o700);
  assert.equal(mode(path.join(root, "release/server.js")), 0o600);
  assert.equal(mode(path.join(root, "release/scripts/start.sh")), 0o700);

  const summary = normalizeRuntimeTree(root);
  assert.deepEqual(summary, { directories: 3, files: 2, executableFiles: 1, symlinks: 1 });
  assert.equal(mode(root), 0o755);
  assert.equal(mode(path.join(root, "release")), 0o755);
  assert.equal(mode(path.join(root, "release/scripts")), 0o755);
  assert.equal(mode(path.join(root, "release/server.js")), 0o444);
  assert.equal(mode(path.join(root, "release/scripts/start.sh")), 0o555);
  assert.equal(fs.readlinkSync(path.join(root, "release/server-link.js")), "server.js");
});

test("rejects escaping symlinks before normalization", (t) => {
  const root = fixture(t);
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside`);
  fs.writeFileSync(outside, "outside");
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.symlinkSync(outside, path.join(root, "escape"));
  assert.throws(() => normalizeRuntimeTree(root), /unsafe symlink|symlink escapes root/);
});

test("archive permission contract rejects 0700 directories and 0600 runtime files", () => {
  assert.throws(
    () => assertArchiveRuntimePermissions("drwx------ 0/0 0 2026-08-02 00:00:00 +0000 ./\n"),
    /directory is not isolated-user traversable/,
  );
  assert.throws(
    () => assertArchiveRuntimePermissions("-rw------- 0/0 4 2026-08-02 00:00:00 +0000 ./server.js\n"),
    /file is not isolated-user readable/,
  );
});

test("archive permission contract rejects noncanonical 0754 directories and 0644 files", () => {
  assert.throws(
    () => assertArchiveRuntimePermissions("drwxr-xr-- 0/0 0 2026-08-02 00:00:00 +0000 ./\n"),
    /exact 0755 mode/,
  );
  assert.throws(
    () => assertArchiveRuntimePermissions("-rw-r--r-- 0/0 4 2026-08-02 00:00:00 +0000 ./server.js\n"),
    /not exact 0444 or 0555/,
  );
});

test("archive permission contract rejects writable and special entries", () => {
  assert.throws(
    () => assertArchiveRuntimePermissions("-rw-rw-r-- 0/0 4 2026-08-02 00:00:00 +0000 ./server.js\n"),
    /group\/world writable/,
  );
  assert.throws(
    () => assertArchiveRuntimePermissions("prw-r--r-- 0/0 0 2026-08-02 00:00:00 +0000 ./pipe\n"),
    /special permission bits|special runtime entry/,
  );
});

test("archive permission contract accepts normalized directories, files, executables, and symlinks", () => {
  const listing = [
    "drwxr-xr-x 0/0 0 2026-08-02 00:00:00 +0000 ./",
    "-r--r--r-- 0/0 4 2026-08-02 00:00:00 +0000 ./server.js",
    "-r-xr-xr-x 0/0 4 2026-08-02 00:00:00 +0000 ./start.sh",
    "lrwxrwxrwx 0/0 0 2026-08-02 00:00:00 +0000 ./server-link.js -> server.js",
  ].join("\n");
  assert.deepEqual(assertArchiveRuntimePermissions(listing), { entryCount: 4 });
});
