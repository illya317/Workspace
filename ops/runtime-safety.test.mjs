import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSafety = readFileSync(new URL("./deploy/runtime-safety.sh", import.meta.url), "utf8");

test("runtime environment preflight passes one complete command to ssh_cmd", () => {
  const result = spawnSync("bash", ["-c", String.raw`
    source ops/deploy/runtime-safety.sh
    ssh_cmd() {
      if [ "$#" -ne 1 ]; then
        printf 'ssh_cmd received %s arguments\n' "$#" >&2
        return 97
      fi
    }
    WORKSPACE_RUNTIME_PM2_MODE=hardened
    REMOTE_CONTROL_ENV_FILE=/tmp/control.env
    REMOTE_RUNTIME_ENV_FILE=/tmp/runtime.env
    REMOTE_WORKSPACE_CONFIG_DIR=/tmp/workspace-config
    INSTALL_ONLYOFFICE_RUNTIME=1
    WORKSPACE_PUBLIC_ORIGIN_HINT=https://example.invalid
    validate_remote_runtime
  `], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(runtimeSafety, /record_runtime_failure \\\"缺少数据库命令: \\?\$required_command\\\"/);
});
