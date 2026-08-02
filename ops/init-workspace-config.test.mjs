import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeWorkspaceConfig, STANDARD_WORKSPACE_DIRECTORIES } from "./init-workspace-config.mjs";

test("workspace initialization creates the standard private directory skeleton", (context) => {
  const parent = mkdtempSync(path.join(tmpdir(), "workspace-config-init-"));
  context.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, ".workspace");

  const first = initializeWorkspaceConfig(root);
  assert.equal(first.created.length, STANDARD_WORKSPACE_DIRECTORIES.length);
  for (const relativePath of STANDARD_WORKSPACE_DIRECTORIES) {
    assert.equal(existsSync(path.join(root, ...relativePath.split("/"))), true);
  }

  writeFileSync(path.join(root, "config/tenant/keep.json"), "{}\n");
  const second = initializeWorkspaceConfig(root);
  assert.deepEqual(second.created, []);
  assert.equal(existsSync(path.join(root, "config/tenant/keep.json")), true);
});

test("workspace initialization rejects relative and broad roots", () => {
  assert.throws(() => initializeWorkspaceConfig(".workspace"), /absolute path/);
  assert.throws(() => initializeWorkspaceConfig(path.parse(process.cwd()).root), /filesystem root/);
});
