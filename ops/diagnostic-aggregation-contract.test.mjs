import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repository = process.cwd();
const scripts = [
  "ops/postgresql/dev/verify.sh",
  "ops/postgresql/pitr-check.sh",
];

function executable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function run(script, environment) {
  return spawnSync("/bin/bash", [path.join(repository, script)], {
    cwd: repository,
    encoding: "utf8",
    env: environment,
  });
}

test("diagnostic entries aggregate failures without enabling errexit", () => {
  for (const script of scripts) {
    const source = readFileSync(path.join(repository, script), "utf8");
    assert.doesNotMatch(source, /^\s*set\s+-[A-Za-z]*e[A-Za-z]*(?:\s|$)/m, script);
    assert.match(source, /diagnostic_failures=\(\)/, script);
    assert.match(source, /finish_diagnostics/, script);
  }
});

test("development PostgreSQL verification reports every independent failed probe", (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-dev-pg-diagnostics-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  executable(path.join(root, "psql"), "#!/bin/sh\nexit 1\n");

  const result = run("ops/postgresql/dev/verify.sh", {
    PATH: `${root}:/usr/bin:/bin`,
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 1, output);
  for (const failure of [
    "workspace_dev_migrator cannot connect to workspace_dev",
    "workspace_dev_migrator cannot connect to workspace_dev_shadow",
    "workspace_dev_backup cannot connect to workspace_dev",
    "workspace_dev_monitor cannot connect to workspace_dev",
    "PostgreSQL runtime security query failed",
    "PostgreSQL shadow ownership query failed",
  ]) {
    assert.match(output, new RegExp(failure), output);
  }
});

test("PITR diagnostics preserve blocked status while reporting archive defects", (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-pitr-diagnostics-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  executable(path.join(root, "psql"), `#!/bin/sh
case "$*" in
  *"show archive_mode"*) printf 'off\\n' ;;
  *"show archive_command"*) printf '(disabled)\\n' ;;
  *"failed_count"*) printf '4\\n' ;;
  *"last_failed_time"*) printf '2026-08-01 00:00:00+00\\n' ;;
  *) exit 1 ;;
esac
`);

  const result = run("ops/postgresql/pitr-check.sh", {
    PATH: `${root}:/usr/bin:/bin`,
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 2, output);
  assert.match(output, /no approved off-host repository check is configured/);
  assert.match(output, /archive_mode is off/);
  assert.match(output, /archive_command is empty or disabled/);
});
