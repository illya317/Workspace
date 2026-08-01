import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseCiDatabaseTarget, runCiDatabaseSandbox } from "./ci-database-sandbox.mjs";

test("CI database sandbox accepts one exact disposable database endpoint", () => {
  const target = parseCiDatabaseTarget({
    DATABASE_URL: "postgresql://runtime:secret@127.0.0.1:5432/workspace_ci",
    DIRECT_URL: "postgresql://owner:secret@127.0.0.1:5432/workspace_ci",
  });
  assert.equal(target.runtime.database, "workspace_ci");
  assert.equal(target.control.database, "workspace_ci");
});

test("CI database sandbox rejects production and split database targets", () => {
  assert.throws(() => parseCiDatabaseTarget({
    DATABASE_URL: "postgresql://owner:secret@127.0.0.1:5432/workspace",
  }), /disposable \*_ci/);
  assert.throws(() => parseCiDatabaseTarget({
    DATABASE_URL: "postgresql://owner:secret@127.0.0.1:5432/workspace_ci",
    DIRECT_URL: "postgresql://owner:secret@127.0.0.1:5433/workspace_ci",
  }), /same CI database endpoint/);
});

test("database preparation failure still runs the independent CI command with blocked status", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ci-database-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const marker = path.join(root, "child-status");
  const status = await runCiDatabaseSandbox({
    repository: root,
    command: process.execPath,
    args: ["-e", "require('fs').writeFileSync(process.argv[1], process.env.RELEASE_CI_DATABASE_STATUS)", marker],
  }, {
    ...process.env,
    DATABASE_URL: "postgresql://owner:secret@127.0.0.1:5432/production",
    DIRECT_URL: "postgresql://owner:secret@127.0.0.1:5432/production",
  });
  assert.equal(status, 1);
  assert.equal(fs.readFileSync(marker, "utf8"), "1");
});
