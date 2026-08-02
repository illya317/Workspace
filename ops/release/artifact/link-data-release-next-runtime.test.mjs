import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { linkDataReleaseNextRuntime } from "./link-data-release-next-runtime.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "data-release-next-runtime-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nextRoot = path.join(root, "source/node_modules/next");
  const sourceNextRoot = path.join(root, "build-input/next");
  mkdirSync(nextRoot, { recursive: true });
  mkdirSync(sourceNextRoot, { recursive: true });
  mkdirSync(path.join(root, "packages/platform/server"), { recursive: true });
  const packageJson = JSON.stringify({ name: "next", exports: { "./server": "./server.js" } });
  writeFileSync(path.join(nextRoot, "package.json"), packageJson);
  writeFileSync(path.join(sourceNextRoot, "package.json"), packageJson);
  writeFileSync(path.join(sourceNextRoot, "server.js"), "module.exports = { loaded: true };\n");
  return { root, nextRoot, sourceNextRoot };
}

test("links the one traced Next runtime for root-level data release importers", (t) => {
  const { root, nextRoot, sourceNextRoot } = fixture(t);
  const first = linkDataReleaseNextRuntime(root, sourceNextRoot);
  assert.equal(realpathSync(first.releaseNext), realpathSync(nextRoot));
  assert.equal(realpathSync(first.resolved), realpathSync(path.join(nextRoot, "server.js")));
  assert.deepEqual(linkDataReleaseNextRuntime(root, sourceNextRoot), first);
});

test("rejects an ambiguous traced Next runtime", (t) => {
  const { root, sourceNextRoot } = fixture(t);
  const extra = path.join(root, "other/node_modules/next");
  mkdirSync(extra, { recursive: true });
  writeFileSync(path.join(extra, "package.json"), "{}\n");
  assert.throws(() => linkDataReleaseNextRuntime(root, sourceNextRoot), /exactly one internal Next runtime/);
});
