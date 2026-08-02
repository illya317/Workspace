import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

test("dev, monolith release, and unit release own disjoint Next cache lifecycles", () => {
  const dev = read("../../../scripts/runtime/start-local-dev.mjs");
  const standalonePrepare = read("../../../scripts/check/prepare-standalone-output.js");
  const cacheShell = read("./next-compiler-cache-shell.sh");
  const monolithBuilder = read("../../build-standalone-artifact.sh");
  const unitBuilder = read("../../build-deploy-unit-artifact.sh");

  assert.match(dev, /fs\.rm\(path\.join\(repositoryRoot, "\.next"\), \{ recursive: true, force: true \}\)/);
  assert.match(standalonePrepare, /\.next\/standalone/);
  assert.doesNotMatch(standalonePrepare, /\.next["']\)/);
  assert.match(cacheShell, /\.cache\/next-targets\/monolith/);
  assert.match(cacheShell, /\.cache\/next-units\/\$unit_id/);
  assert.doesNotMatch(cacheShell, /scripts\/runtime\/start-local-dev/);
  assert.match(monolithBuilder, /next_compiler_cache_monolith_build/);
  assert.doesNotMatch(monolithBuilder, /rm -rf ["']?\.next["']?(?:\s|$)/);
  assert.match(unitBuilder, /next_compiler_cache_unit prepare/);
  assert.match(unitBuilder, /rm -rf "\$BUILD_DIRECTORY"/);
});
