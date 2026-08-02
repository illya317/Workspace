import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runner = readFileSync(path.join(root, "ops/apply-production-data-release.sh"), "utf8");
const publish = readFileSync(path.join(root, "ops/publish.sh"), "utf8");

test("production data apply is routed through one governed runtime contract", () => {
  assert.match(publish, /data\)[\s\S]*apply-production-data-release\.sh/);
  assert.doesNotMatch(runner, /set -e/);
  assert.match(runner, /errors=\(\)/);
  assert.match(runner, /EnvironmentFile=\"\$runtime_env\"/);
  assert.match(runner, /property=User=\"\$runtime_user\"/);
  assert.match(runner, /source SHA 与当前生产候选不一致/);
  assert.match(runner, /psql[\s\S]*SELECT 1/);
  assert.match(runner, /pg_dump[\s\S]*pg_restore --list/);
  assert.match(runner, /apply-data-release\.mjs\" apply --target production/);
  assert.match(runner, /reconcile-runtime-config-permissions\.sh/);
  assert.match(runner, /api\/internal\/health/);
  assert.match(runner, /api\/settings\/version/);
  assert.match(runner, /\.cache\/data-release-attempts/);
});
