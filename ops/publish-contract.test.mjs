import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const name of ["publish.sh", "release-to-cnb.sh", "deploy.sh"]) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u, name);
  }
});

test("same-SHA reconciliation requires live health and exact version", () => {
  assert.match(
    publish,
    /if \[ "\$last_deployed_sha" = "\$head_sha" \][\s\S]*?verify_server_runtime[\s\S]*?reconcile-success/,
  );
});

test("a freshly observed deployed record is not reconciled before live runtime verification", () => {
  assert.match(
    publish,
    /if \[ "\$observed_run_id" != "\$deployment_run_id" \][\s\S]*?if ! verify_server_runtime; then[\s\S]*?PRODUCTION_CONFIRMED=1[\s\S]*?reconcile-success/,
  );
});

test("runtime verification binds health and version to protected main", () => {
  assert.match(publish, /curl -fsS '\$HEALTHCHECK_URL'/);
  assert.match(publish, /local expected_sha="\$\{1:-\$head_sha\}"/);
  assert.match(publish, /EXPECTED_VERSION='\$expected_sha'/);
  assert.match(publish, /payload\.version !== process\.env\.EXPECTED_VERSION/);
});
