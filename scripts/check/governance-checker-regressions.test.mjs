import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const [label, script] of [
  ["leaf module page contracts", "scripts/check/check-module-page-gates.js"],
  ["L1-only module API contracts", "scripts/check/check-api-routes.js"],
  ["trusted authenticated route handlers", "scripts/check/check-authorize-usage.js"],
  ["UI primitive detection ignores quoted payloads", "scripts/check/check-package-boundaries.js"],
]) {
  test(label, () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
