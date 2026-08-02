import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const bootstrapFile = new URL("./runtime-permission-bootstrap.sh", import.meta.url).pathname;
const bootstrap = readFileSync(bootstrapFile, "utf8");
const deployEntrypoint = readFileSync(new URL("../../deploy.sh", import.meta.url), "utf8");

function runBootstrap(context, { tamper }) {
  const root = mkdtempSync(join(tmpdir(), "workspace-runtime-bootstrap-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const controllerOps = join(root, "ops");
  const fakeBin = join(root, "bin");
  const marker = join(root, "executed.txt");
  mkdirSync(controllerOps, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(controllerOps, "reconcile-runtime-config-permissions.sh"), `#!/bin/bash
set -euo pipefail
printf '%s|%s\n' "$1" "$2" > "$BOOTSTRAP_MARKER"
`);
  writeFileSync(join(fakeBin, "sudo"), `#!/bin/bash
set -euo pipefail
[ "$1" = -n ] && [ "$2" = -- ]
shift 2
exec "$@"
`);
  chmodSync(join(fakeBin, "sudo"), 0o755);

  const result = spawnSync("/bin/bash", ["-c", `
set -euo pipefail
source "$1"
trap - EXIT
SCRIPT_DIR="$2"
FAKE_BIN="$3"
BOOTSTRAP_MARKER="$4"
TAMPER="$5"
export BOOTSTRAP_MARKER
WORKSPACE_RUNTIME_PM2_MODE=hardened
RELEASE_CONTROLLER_SOURCE_SHA=${"a".repeat(40)}
REMOTE_WORKSPACE_CONFIG_DIR=/tmp/workspace/.workspace
SSH_OPTIONS=()
SERVER=fixture
ssh() {
  local remote_command="\${!#}"
  if [ "$TAMPER" = 1 ]; then
    { /bin/cat; printf '\n# transport tamper\n'; }
  else
    /bin/cat
  fi | env PATH="$FAKE_BIN:$PATH" BOOTSTRAP_MARKER="$BOOTSTRAP_MARKER" /bin/bash -c "$remote_command"
}
reconcile_remote_runtime_permissions
`, "--", bootstrapFile, controllerOps, fakeBin, marker, tamper ? "1" : "0"], { encoding: "utf8" });
  return { result, marker };
}

test("deploy composes the current-controller runtime permission bootstrap before transport", () => {
  assert.ok(
    deployEntrypoint.indexOf('source "$SCRIPT_DIR/release/control/runtime-permission-bootstrap.sh"')
      < deployEntrypoint.indexOf('source "$SCRIPT_DIR/deploy/transport.sh"'),
  );
  assert.match(bootstrap, /controller_reconciler="\$SCRIPT_DIR\/reconcile-runtime-config-permissions\.sh"/);
  assert.match(bootstrap, /sha256sum --binary "\$controller_reconciler"/);
  assert.match(bootstrap, /< "\$controller_reconciler"/);
  assert.match(bootstrap, /sudo -n -- \/bin\/bash -s -- "\$config_root" "\$runtime_user"/);
  assert.doesNotMatch(bootstrap, /REMOTE_DEPLOY_TOOL_DIR/);
});

test("runtime permission bootstrap executes only exact Controller Ready bytes", (context) => {
  const { result, marker } = runBootstrap(context, { tamper: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Controller runtime ACL bootstrap verified/);
  assert.equal(readFileSync(marker, "utf8"), "/tmp/workspace/.workspace|workspace-runtime\n");
});

test("runtime permission bootstrap rejects altered bytes before sudo execution", (context) => {
  const { result, marker } = runBootstrap(context, { tamper: true });
  assert.equal(result.status, 41);
  assert.match(result.stderr, /bootstrap digest mismatch/);
  assert.equal(existsSync(marker), false);
});
