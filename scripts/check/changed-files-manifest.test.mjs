import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { prepareChangedFilesManifest } from "./changed-files-manifest.mjs";

test("prepares one manifest only when the plan has changed-file leaves", () => {
  const cwd = path.resolve("/tmp/workspace-check-context-test");
  const snapshotKey = "a".repeat(64);
  const writes = [];
  let collections = 0;
  const manifest = prepareChangedFilesManifest(["lint-changed", "domain-changed"], {
    cwd,
    env: {
      CHECK_WORKSPACE_SNAPSHOT_KEY: snapshotKey,
      WORKSPACE_DIFF_BASE: "1".repeat(40),
      WORKSPACE_DIFF_HEAD: "2".repeat(40),
    },
    collect: () => {
      collections += 1;
      return {
        staged: [],
        unstaged: ["a.ts"],
        untracked: [],
        files: ["a.ts"],
        hasStagedChanges: false,
        source: "explicit-diff",
      };
    },
    write: (target, value) => writes.push([target, value]),
  });

  assert.equal(collections, 1);
  assert.equal(writes.length, 1);
  assert.equal(manifest.file, writes[0][0]);
  assert.equal(manifest.hasStagedChanges, false);
  assert.equal(manifest.source, "explicit-diff");
  assert.equal(writes[0][1].snapshotKey, snapshotKey);
  assert.deepEqual(writes[0][1].files, ["a.ts"]);
});

test("skips manifest work for unrelated plans or missing trusted snapshot", () => {
  let collections = 0;
  const options = {
    env: {},
    collect: () => {
      collections += 1;
      throw new Error("must not collect");
    },
  };

  assert.equal(prepareChangedFilesManifest(["test-node"], options), null);
  assert.equal(prepareChangedFilesManifest(["lint-changed"], options), null);
  assert.equal(collections, 0);
});
