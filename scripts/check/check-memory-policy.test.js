"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_CHECK_OLD_SPACE_MIB,
  enforceCheckMemoryLimit,
  readOldSpaceLimits,
} = require("./check-memory-policy");

const repoRoot = path.resolve(__dirname, "../..");

test("adds the 8 GiB cap while preserving unrelated NODE_OPTIONS", () => {
  assert.equal(
    enforceCheckMemoryLimit("--conditions=react-server"),
    "--conditions=react-server --max-old-space-size=8192",
  );
});

test("accepts explicit limits at or below 8 GiB", () => {
  assert.equal(enforceCheckMemoryLimit("--max-old-space-size=8192"), "--max-old-space-size=8192");
  assert.deepEqual(readOldSpaceLimits("--max_old_space_size 2048"), [2048]);
});

test("rejects explicit limits above 8 GiB", () => {
  assert.throws(
    () => enforceCheckMemoryLimit("--max-old-space-size=10240"),
    /cannot use more than 8192 MiB/,
  );
  assert.throws(
    () => enforceCheckMemoryLimit("--max_old_space_size 12288"),
    /received 12288 MiB/,
  );
});

test("package scripts do not configure a Node old-space limit above 8 GiB", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    for (const limit of readOldSpaceLimits(command)) {
      assert.ok(
        limit <= MAX_CHECK_OLD_SPACE_MIB,
        `${name} configures ${limit} MiB, above the ${MAX_CHECK_OLD_SPACE_MIB} MiB cap`,
      );
    }
  }
});
