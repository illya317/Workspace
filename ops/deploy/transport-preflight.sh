verify_remote_runtime_pm2() {
  if [ "$WORKSPACE_RUNTIME_PM2_MODE" != "hardened" ]; then
    echo "==> 使用 legacy PM2 兼容模式；长期进程凭据隔离未由 deploy runner 强制"
    return 0
  fi
  echo "==> 校验 production runtime PM2 runner 与凭据隔离契约..."
  ssh_cmd "
    diagnostic_status=0
    if ! sudo -n -- python3 - '$WORKSPACE_RUNTIME_PM2_RUNNER' '$REMOTE_CONTROL_ENV_FILE' '$REMOTE_RUNTIME_ENV_FILE' <<'PY'
from pathlib import Path
import stat
import sys

runner, control, runtime = map(Path, sys.argv[1:])
errors = []
for path, label in ((runner, 'runtime PM2 runner'), (control, 'control-plane env'), (runtime, 'runtime env')):
    if not path.is_file():
        errors.append(f'{label} must be a regular file')
        continue
    if path.stat().st_uid != 0:
        errors.append(f'{label} must be root-owned')
    if path.stat().st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        errors.append(f'{label} must not be group/world-writable')
if control.is_file():
    if stat.S_IMODE(control.stat().st_mode) & 0o077:
        errors.append('control-plane env must not be accessible by group or other users')
if runtime.is_file():
    runtime_mode = stat.S_IMODE(runtime.stat().st_mode)
    if not runtime_mode & stat.S_IRUSR or not runtime_mode & stat.S_IRGRP:
        errors.append('runtime env must be readable only by root and its dedicated runtime group')
    if runtime_mode & 0o027:
        errors.append('runtime env must not be group-writable/executable or accessible by other users')
if control.is_file() and runtime.is_file() and control.resolve() == runtime.resolve():
    errors.append('runtime and control-plane env must resolve to different files')
if runtime.is_file():
    runtime_keys = {
        line.split('=', 1)[0].strip()
        for line in runtime.read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.lstrip().startswith('#') and '=' in line
    }
    if 'DATABASE_URL' not in runtime_keys:
        errors.append('runtime env is missing DATABASE_URL')
    for forbidden in (
        'DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL', 'WORKSPACE_MONITOR_DATABASE_URL',
        'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGUSER', 'PGHOST', 'PGDATABASE',
    ):
        if forbidden in runtime_keys:
            errors.append(f'runtime env contains forbidden {forbidden}')
if control.is_file():
    control_keys = {
        line.split('=', 1)[0].strip()
        for line in control.read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.lstrip().startswith('#') and '=' in line
    }
    for required in ('DIRECT_URL', 'WORKSPACE_BACKUP_DATABASE_URL'):
        if required not in control_keys:
            errors.append(f'control-plane env is missing {required}')
if errors:
    print(f'PM2/runtime environment contract failures ({len(errors)}):', file=sys.stderr)
    for error in errors:
        print(f' - {error}', file=sys.stderr)
    raise SystemExit(1)
PY
    then
      diagnostic_status=1
    fi
    if ! load_control_environment; then
      echo '[错误] 无法加载 control/runtime environment' >&2
      diagnostic_status=1
    else
      workspace_assert_hardened_database_url \"\$DATABASE_URL\" workspace_runtime 0 DATABASE_URL || diagnostic_status=1
      workspace_assert_hardened_database_url \"\$DIRECT_URL\" workspace_migrator 1 DIRECT_URL || diagnostic_status=1
      workspace_assert_hardened_database_url \"\$WORKSPACE_BACKUP_DATABASE_URL\" workspace_backup 0 WORKSPACE_BACKUP_DATABASE_URL || diagnostic_status=1
      if [ \"\${WORKSPACE_MONITOR_DATABASE_URL+x}\" = 'x' ]; then
        workspace_assert_hardened_database_url \"\$WORKSPACE_MONITOR_DATABASE_URL\" workspace_monitor 0 WORKSPACE_MONITOR_DATABASE_URL || diagnostic_status=1
      fi
    fi
    sudo -n -- '$WORKSPACE_RUNTIME_PM2_RUNNER' --version >/dev/null || diagnostic_status=1
    workspace_assert_managed_runtime_environment || diagnostic_status=1
    exit \"\$diagnostic_status\"
  "
}

prepare_local_deploy_graph() {
  echo "==> 零写入预检 Full Gateway graph..."
  FULL_DEPLOY_GRAPH_TMP="$(mktemp "${TMPDIR:-/tmp}/workspace-full-deploy-graph.XXXXXX")"
  [ -n "${RELEASE_DEPLOY_GRAPH_FILE:-}" ] || { echo "[错误] validated artifact bundle 缺少 RELEASE_DEPLOY_GRAPH_FILE" >&2; return 1; }
  cp "$RELEASE_DEPLOY_GRAPH_FILE" "$FULL_DEPLOY_GRAPH_TMP" || return 1
  expected_graph_sha="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(m.inputs?.deployGraphSha256 ?? "")' "$ARTIFACT_MANIFEST_PATH")" || return 1
  node ops/gateway-generation.mjs graph-assert --graph "$FULL_DEPLOY_GRAPH_TMP" --digest "$expected_graph_sha" >/dev/null || return 1
  node ops/gateway-generation.mjs graph-digest --graph "$FULL_DEPLOY_GRAPH_TMP" >/dev/null || return 1
}

prepare_local_deploy_tool_bundle() {
  echo "==> 零写入预检 deploy-tool bundle import closure..."
  DEPLOY_TOOL_BUNDLE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/workspace-deploy-tools.XXXXXX")"
  node ops/release/control/deploy-tool-bundle.mjs build \
    --repository "$PWD" \
    --output "$DEPLOY_TOOL_BUNDLE_TMP" \
    --profile full >/dev/null || return 1
  node ops/release/control/deploy-tool-bundle.mjs verify \
    --bundle "$DEPLOY_TOOL_BUNDLE_TMP" >/dev/null || return 1
}

prepare_local_deploy_tools() {
  prepare_local_deploy_graph || return 1
  prepare_local_deploy_tool_bundle || return 1
}
