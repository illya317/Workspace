run_deploy_stage() {
  local stage="$1"
  shift
  if [ "$RELEASE_TIMING_ENABLED" != "1" ]; then
    "$@"
    return
  fi

  if ! release_timing_active_begin "$stage"; then
    echo "[警告] deploy/${stage} 计时启动失败；部署仍按原命令执行" >&2
    "$@"
    return
  fi
  "$@"
  # The active finalizer intentionally takes no arguments.
  # shellcheck disable=SC2119
  release_timing_active_passed
}

release_remote_deploy_lock() {
  if [ "$REMOTE_DEPLOY_LOCK_HELD" != "1" ]; then
    return
  fi
  ssh "${SSH_OPTIONS[@]}" "$SERVER" \
    "touch '$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN'" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
    kill "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  fi
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  REMOTE_DEPLOY_LOCK_HELD=0
}

cleanup_deploy() {
  local deploy_exit_code=$?
  if [ "$RELEASE_TIMING_ENABLED" = "1" ]; then
    release_timing_active_finalize_on_exit "$deploy_exit_code" || true
  fi
  release_remote_deploy_lock
  ssh "${SSH_OPTIONS[@]}" -O exit "$SERVER" >/dev/null 2>&1 || true
  rm -rf "$SSH_CONTROL_DIR"
  rm -f "${TMPKEY:-}"
  rm -f "${FULL_DEPLOY_GRAPH_TMP:-}"
  return "$deploy_exit_code"
}
trap cleanup_deploy EXIT

ssh_cmd() {
  if [ "$#" -ne 1 ]; then
    echo "[错误] ssh_cmd 只接受一个完整 remote command" >&2
    return 2
  fi
  local remote_command="$1"
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
workspace_assert_hardened_database_url() {
  local database_url_value=\$1
  local expected_database_role=\$2
  local require_owner_role=\$3
  local database_url_label=\$4
  DATABASE_URL_VALUE=\"\$database_url_value\" \\
  EXPECTED_DATABASE_ROLE=\"\$expected_database_role\" \\
  REQUIRE_OWNER_ROLE=\"\$require_owner_role\" \\
  DATABASE_URL_LABEL=\"\$database_url_label\" \\
  node - <<'NODE'
const label = process.env.DATABASE_URL_LABEL || 'database URL';
const fail = () => {
  throw new Error(label + ' violates hardened PostgreSQL URL contract');
};
let url;
try {
  url = new URL(process.env.DATABASE_URL_VALUE || '');
} catch {
  fail();
}
let username;
let password;
try {
  username = decodeURIComponent(url.username);
  password = decodeURIComponent(url.password);
} catch {
  fail();
}
const forbiddenConnectionOverrides = [
  'user', 'password', 'host', 'hostaddr', 'port', 'dbname', 'database',
  'service', 'servicefile', 'ssl', 'sslcert', 'sslkey',
];
if (forbiddenConnectionOverrides.some((key) => url.searchParams.has(key))) fail();
const singleQueryValue = (key) => {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1) fail();
  return values[0];
};
if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || username !== process.env.EXPECTED_DATABASE_ROLE
    || !password
    || Array.from(password).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint < 32 || codePoint === 127;
    })
    || url.hostname !== '127.0.0.1'
    || url.port !== '5432'
    || url.pathname !== '/workspace'
    || url.hash
    || singleQueryValue('sslmode') !== 'verify-full'
    || singleQueryValue('sslrootcert') !== '/etc/workspace/postgresql/ca.pem') {
  fail();
}
const options = url.searchParams.getAll('options');
if (process.env.REQUIRE_OWNER_ROLE === '1') {
  if (options.length !== 1 || options[0] !== '-c role=workspace_owner') fail();
} else if (options.length !== 0) {
  fail();
}
NODE
}
workspace_assert_managed_runtime_environment() {
  [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ] || return 0
  local managed_processes
  managed_processes=\$(sudo -n -- '$WORKSPACE_RUNTIME_PM2_RUNNER' jlist)
  MANAGED_PROCESSES=\"\$managed_processes\" \\
    MANAGED_WEB_NAMES='$PM2_NAME-candidate,$PM2_NAME' \\
    MANAGED_BOT_NAMES='$PM2_WECOM_BOT_NAME,workspace-assistant-wecom-blue,workspace-assistant-wecom-green' \\
    node - <<'NODE'
const processes = JSON.parse(process.env.MANAGED_PROCESSES || 'null');
if (!Array.isArray(processes)) throw new Error('runtime PM2 runner jlist did not return an array');
const webNames = new Set(process.env.MANAGED_WEB_NAMES.split(','));
const botNames = new Set(process.env.MANAGED_BOT_NAMES.split(','));
const managed = new Set([...webNames, ...botNames]);
const failDatabaseUrl = (label) => {
  throw new Error(label + ' violates hardened PostgreSQL URL contract');
};
const assertHardenedDatabaseUrl = (raw, label) => {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    failDatabaseUrl(label);
  }
  let username;
  let password;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    failDatabaseUrl(label);
  }
  const forbiddenConnectionOverrides = [
    'user', 'password', 'host', 'hostaddr', 'port', 'dbname', 'database',
    'service', 'servicefile', 'ssl', 'sslcert', 'sslkey',
  ];
  if (forbiddenConnectionOverrides.some((key) => url.searchParams.has(key))) failDatabaseUrl(label);
  const singleQueryValue = (key) => {
    const values = url.searchParams.getAll(key);
    if (values.length !== 1) failDatabaseUrl(label);
    return values[0];
  };
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || username !== 'workspace_runtime'
      || !password
      || Array.from(password).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint < 32 || codePoint === 127;
      })
      || url.hostname !== '127.0.0.1'
      || url.port !== '5432'
      || url.pathname !== '/workspace'
      || url.hash
      || singleQueryValue('sslmode') !== 'verify-full'
      || singleQueryValue('sslrootcert') !== '/etc/workspace/postgresql/ca.pem'
      || url.searchParams.has('options')) {
    failDatabaseUrl(label);
  }
};
for (const process of processes) {
  if (!process || typeof process !== 'object' || !managed.has(process.name)) continue;
  const environment = process.pm2_env || {};
  const nestedEnvironment = environment.env && typeof environment.env === 'object' ? environment.env : {};
  const environmentSources = [nestedEnvironment, environment];
  const mergedEnvironment = Object.assign({}, nestedEnvironment, environment);
  if (botNames.has(process.name)) {
    const leaked = Object.keys(mergedEnvironment).filter((key) => (
      key === 'DATABASE_URL'
      || key === 'WORKSPACE_DATABASE_URL'
      || ['DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL', 'WORKSPACE_MONITOR_DATABASE_URL'].includes(key)
      || /^PG[A-Z0-9_]*$/.test(key)
      || /^NEXTAUTH(?:_|$)/.test(key)
      || /^ONLYOFFICE(?:_|$)/.test(key)
      || /^WORKSPACE_(?:RUNTIME|MIGRATOR|BACKUP|MONITOR)_DATABASE/.test(key)
    ));
    if (leaked.length > 0) {
      throw new Error('Bot runtime process ' + process.name + ' contains forbidden ' + leaked.join(','));
    }
    continue;
  }
  for (const key of [
    'DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL', 'WORKSPACE_MONITOR_DATABASE_URL',
    'WORKSPACE_DATABASE_URL', 'WORKSPACE_RUNTIME_DATABASE_PASSWORD', 'WORKSPACE_MIGRATOR_DATABASE_PASSWORD',
    'WORKSPACE_BACKUP_DATABASE_PASSWORD', 'WORKSPACE_MONITOR_DATABASE_PASSWORD',
    'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGUSER', 'PGHOST', 'PGDATABASE',
  ]) {
    if (environmentSources.some((source) => Object.prototype.hasOwnProperty.call(source, key))) {
      throw new Error('managed runtime process ' + process.name + ' contains forbidden ' + key);
    }
  }
  const runtimeDatabaseUrls = environmentSources
    .filter((source) => Object.prototype.hasOwnProperty.call(source, 'DATABASE_URL'))
    .map((source) => source.DATABASE_URL);
  if (runtimeDatabaseUrls.length === 0
      || runtimeDatabaseUrls.some((value) => value !== runtimeDatabaseUrls[0])) {
    failDatabaseUrl('managed runtime process ' + process.name + ' DATABASE_URL');
  }
  assertHardenedDatabaseUrl(
    runtimeDatabaseUrls[0],
    'managed runtime process ' + process.name + ' DATABASE_URL',
  );
}
NODE
}
pm2() {
  if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
    local key
    local -a runtime_pm2_environment=()
    for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION NEXT_PUBLIC_BASE_PATH PG_POOL_MAX PG_APPLICATION_NAME \\
      WORKSPACE_CONFIG_DIR WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_DEPLOY_SLOT WORKSPACE_DEPLOY_CURRENT_STATE_FILE WORKSPACE_INTERNAL_ORIGIN \\
      WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE \\
      WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL \\
      PROJECT_NOTIFICATION_SCHEDULER_DISABLED; do
      if [ \"\${!key+x}\" = 'x' ]; then
        runtime_pm2_environment+=(\"\$key=\${!key}\")
      fi
    done
    sudo -n -- /usr/bin/env \"\${runtime_pm2_environment[@]}\" '$WORKSPACE_RUNTIME_PM2_RUNNER' \"\$@\"
    local pm2_status=\$?
    [ \"\$pm2_status\" -eq 0 ] || return \"\$pm2_status\"
    if [ \"\${1:-}\" = 'start' ]; then
      workspace_assert_managed_runtime_environment
    fi
  else
    command pm2 \"\$@\"
  fi
}
workspace_source_env_file() {
  local env_file=\$1
  if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
    . <(sudo -n -- /bin/cat \"\$env_file\")
  else
    . \"\$env_file\"
  fi
}
workspace_privileged() {
  if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
    sudo -n -- \"\$@\"
  else
    \"\$@\"
  fi
}
load_runtime_environment() {
  unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL
  set -a
  workspace_source_env_file '$REMOTE_RUNTIME_ENV_FILE'
  set +a
  unset DIRECT_URL SHADOW_DATABASE_URL
  test -n \"\${DATABASE_URL:-}\"
}
load_control_environment() {
  local runtime_database_url
  unset DATABASE_URL DIRECT_URL SHADOW_DATABASE_URL WORKSPACE_BACKUP_DATABASE_URL WORKSPACE_MONITOR_DATABASE_URL
  set -a
  workspace_source_env_file '$REMOTE_RUNTIME_ENV_FILE'
  runtime_database_url=\$DATABASE_URL
  if [ '$REMOTE_CONTROL_ENV_FILE' != '$REMOTE_RUNTIME_ENV_FILE' ]; then
    workspace_source_env_file '$REMOTE_CONTROL_ENV_FILE'
  fi
  DATABASE_URL=\$runtime_database_url
  export DATABASE_URL
  unset SHADOW_DATABASE_URL
  set +a
  test -n \"\${DATABASE_URL:-}\"
  test -n \"\${DIRECT_URL:-}\"
  if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
    test -n \"\${WORKSPACE_BACKUP_DATABASE_URL:-}\"
  fi
}
$remote_command
"
}

verify_remote_runtime_pm2() {
  if [ "$WORKSPACE_RUNTIME_PM2_MODE" != "hardened" ]; then
    echo "==> 使用 legacy PM2 兼容模式；长期进程凭据隔离未由 deploy runner 强制"
    return 0
  fi
  echo "==> 校验 production runtime PM2 runner 与凭据隔离契约..."
  ssh_cmd "
    set -e
    sudo -n -- test -f '$WORKSPACE_RUNTIME_PM2_RUNNER'
    sudo -n -- test -x '$WORKSPACE_RUNTIME_PM2_RUNNER'
    sudo -n -- test -r '$REMOTE_CONTROL_ENV_FILE'
    sudo -n -- test -r '$REMOTE_RUNTIME_ENV_FILE'
    sudo -n -- python3 - '$WORKSPACE_RUNTIME_PM2_RUNNER' '$REMOTE_CONTROL_ENV_FILE' '$REMOTE_RUNTIME_ENV_FILE' <<'PY'
from pathlib import Path
import stat
import sys

runner, control, runtime = map(Path, sys.argv[1:])
for path, label in ((runner, 'runtime PM2 runner'), (control, 'control-plane env'), (runtime, 'runtime env')):
    if not path.is_file():
        raise SystemExit(f'{label} must be a regular file')
    if path.stat().st_uid != 0:
        raise SystemExit(f'{label} must be root-owned')
    if path.stat().st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        raise SystemExit(f'{label} must not be group/world-writable')
if stat.S_IMODE(control.stat().st_mode) & 0o077:
    raise SystemExit('control-plane env must not be accessible by group or other users')
runtime_mode = stat.S_IMODE(runtime.stat().st_mode)
if not runtime_mode & stat.S_IRUSR or not runtime_mode & stat.S_IRGRP:
    raise SystemExit('runtime env must be readable only by root and its dedicated runtime group')
if runtime_mode & 0o027:
    raise SystemExit('runtime env must not be group-writable/executable or accessible by other users')
if control.resolve() == runtime.resolve():
    raise SystemExit('runtime and control-plane env must resolve to different files')
runtime_keys = {
    line.split('=', 1)[0].strip()
    for line in runtime.read_text(encoding='utf-8').splitlines()
    if line.strip() and not line.lstrip().startswith('#') and '=' in line
}
if 'DATABASE_URL' not in runtime_keys:
    raise SystemExit('runtime env is missing DATABASE_URL')
for forbidden in (
    'DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL', 'WORKSPACE_MONITOR_DATABASE_URL',
    'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGUSER', 'PGHOST', 'PGDATABASE',
):
    if forbidden in runtime_keys:
        raise SystemExit(f'runtime env contains forbidden {forbidden}')
control_keys = {
    line.split('=', 1)[0].strip()
    for line in control.read_text(encoding='utf-8').splitlines()
    if line.strip() and not line.lstrip().startswith('#') and '=' in line
}
for required in ('DIRECT_URL', 'WORKSPACE_BACKUP_DATABASE_URL'):
    if required not in control_keys:
        raise SystemExit(f'control-plane env is missing {required}')
PY
    load_control_environment
    workspace_assert_hardened_database_url \"\$DATABASE_URL\" workspace_runtime 0 DATABASE_URL
    workspace_assert_hardened_database_url \"\$DIRECT_URL\" workspace_migrator 1 DIRECT_URL
    workspace_assert_hardened_database_url \"\$WORKSPACE_BACKUP_DATABASE_URL\" workspace_backup 0 WORKSPACE_BACKUP_DATABASE_URL
    if [ \"\${WORKSPACE_MONITOR_DATABASE_URL+x}\" = 'x' ]; then
      workspace_assert_hardened_database_url \"\$WORKSPACE_MONITOR_DATABASE_URL\" workspace_monitor 0 WORKSPACE_MONITOR_DATABASE_URL
    fi
    sudo -n -- '$WORKSPACE_RUNTIME_PM2_RUNNER' --version >/dev/null
    workspace_assert_managed_runtime_environment
  "
}

start_ssh_master() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if ssh "${SSH_OPTIONS[@]}" -fN "$SERVER"; then
      return
    fi
    if [ "$attempt" -lt 5 ]; then
      echo "[警告] SSH 控制连接建立失败（第 $attempt/5 次），5 秒后重试..."
      sleep 5
    fi
  done
  echo "[错误] SSH 控制连接连续 5 次建立失败"
  exit 1
}

sync_remote_deploy_tools() {
  echo "==> 同步部署凭证与 Full Gateway 收口工具..."
  FULL_DEPLOY_GRAPH_TMP="$(mktemp "${TMPDIR:-/tmp}/workspace-full-deploy-graph.XXXXXX")"
  : "${RELEASE_DEPLOY_GRAPH_FILE:?RELEASE_DEPLOY_GRAPH_FILE is required from the validated artifact bundle}"
  cp "$RELEASE_DEPLOY_GRAPH_FILE" "$FULL_DEPLOY_GRAPH_TMP"
  expected_graph_sha="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(m.inputs?.deployGraphSha256 ?? "")' "$ARTIFACT_MANIFEST_PATH")"
  node ops/gateway-generation.mjs graph-assert --graph "$FULL_DEPLOY_GRAPH_TMP" --digest "$expected_graph_sha" >/dev/null
  node ops/gateway-generation.mjs graph-digest --graph "$FULL_DEPLOY_GRAPH_TMP" >/dev/null
  ssh_cmd "mkdir -p '$REMOTE_DEPLOY_TOOL_DIR'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/release-receipt.mjs ops/control-plane-receipt.mjs ops/tenant-config-manifest.mjs \
    ops/control-plane-requirements.mjs ops/deploy-unit-release.mjs \
    ops/gateway-generation.mjs ops/switch-deploy-gateway.sh \
    ops/deploy-unit-sidecar.sh ops/assistant-runtime.mjs \
    ops/reconcile-runtime-config-permissions.sh \
    "$SERVER:$REMOTE_DEPLOY_TOOL_DIR/"
  rsync -az -e "$RSYNC_SSH_COMMAND" "$FULL_DEPLOY_GRAPH_TMP" "$SERVER:$REMOTE_FULL_DEPLOY_GRAPH"
  rm -f "$FULL_DEPLOY_GRAPH_TMP"
  FULL_DEPLOY_GRAPH_TMP=""
  ssh_cmd "
    chmod 755 '$REMOTE_RELEASE_RECEIPT_TOOL' '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' '$REMOTE_DEPLOY_TOOL_DIR/tenant-config-manifest.mjs' \
      '$REMOTE_DEPLOY_TOOL_DIR/control-plane-requirements.mjs' '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-release.mjs' \
      '$REMOTE_GATEWAY_GENERATION_TOOL' '$REMOTE_GATEWAY_SWITCH_TOOL' \
      '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-sidecar.sh' '$REMOTE_DEPLOY_TOOL_DIR/assistant-runtime.mjs' \
      '$REMOTE_DEPLOY_TOOL_DIR/reconcile-runtime-config-permissions.sh'
    chmod 600 '$REMOTE_FULL_DEPLOY_GRAPH'
    node --check '$REMOTE_RELEASE_RECEIPT_TOOL'
    node --check '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/tenant-config-manifest.mjs'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/control-plane-requirements.mjs'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-release.mjs'
    node --check '$REMOTE_GATEWAY_GENERATION_TOOL'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/assistant-runtime.mjs'
    bash -n '$REMOTE_GATEWAY_SWITCH_TOOL'
    bash -n '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-sidecar.sh'
    bash -n '$REMOTE_DEPLOY_TOOL_DIR/reconcile-runtime-config-permissions.sh'
    node '$REMOTE_GATEWAY_GENERATION_TOOL' graph-digest --graph '$REMOTE_FULL_DEPLOY_GRAPH' >/dev/null
  "

  REMOTE_RELEASE_TIMING_ENABLED=0
  if [ "$RELEASE_TIMING_ENABLED" != "1" ]; then
    return 0
  fi
  if ssh_cmd "mkdir -p '$REMOTE_DEPLOY_TOOL_DIR/lib'" \
    && rsync -az -e "$RSYNC_SSH_COMMAND" ops/release-timing.mjs "$SERVER:$REMOTE_RELEASE_TIMING_TOOL" \
    && rsync -az -e "$RSYNC_SSH_COMMAND" ops/lib/release-timing.sh "$SERVER:$REMOTE_RELEASE_TIMING_SHELL" \
    && ssh_cmd "
      chmod 755 '$REMOTE_RELEASE_TIMING_TOOL' '$REMOTE_RELEASE_TIMING_SHELL'
      node --check '$REMOTE_RELEASE_TIMING_TOOL'
      bash -n '$REMOTE_RELEASE_TIMING_SHELL'
    "; then
    REMOTE_RELEASE_TIMING_ENABLED=1
  else
    echo "[警告] 远程 release timing 工具不可用；部署继续并保留外层 server.deploy 计时" >&2
  fi
}

acquire_remote_deploy_lock() {
  local lock_owner_file
  local lock_release_file
  local wait_status

  REMOTE_DEPLOY_LOCK_TOKEN="${RELEASE_SOURCE_SHA}-$$-$(date +%s)"
  lock_owner_file="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.owner"
  lock_release_file="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.release-$REMOTE_DEPLOY_LOCK_TOKEN"
  echo "==> 获取生产部署互斥锁..."
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    set -e
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR'
    command -v flock >/dev/null
    rm -f '$lock_release_file'
    exec 9>'$REMOTE_WORKSPACE_CONFIG_DIR/deploy.lock'
    if ! flock -n 9; then
      echo '[错误] 另一生产部署正在 backup→switch 临界区运行'
      exit 73
    fi
    printf '%s\n' '$REMOTE_DEPLOY_LOCK_TOKEN' > '$lock_owner_file'
    trap \"rm -f '$lock_owner_file' '$lock_release_file'\" EXIT
    while [ ! -f '$lock_release_file' ]; do sleep 1; done
  " &
  REMOTE_DEPLOY_LOCK_PID=$!

  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ssh_cmd "test \"\$(cat '$lock_owner_file' 2>/dev/null)\" = '$REMOTE_DEPLOY_LOCK_TOKEN'" >/dev/null 2>&1; then
      REMOTE_DEPLOY_LOCK_HELD=1
      echo "==> 已获取生产部署互斥锁。"
      return
    fi
    if ! kill -0 "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1; then
      wait_status=0
      wait "$REMOTE_DEPLOY_LOCK_PID" || wait_status=$?
      echo "[错误] 无法获取生产部署互斥锁（remote status: ${wait_status}）"
      exit 1
    fi
    sleep 1
  done

  kill "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  wait "$REMOTE_DEPLOY_LOCK_PID" >/dev/null 2>&1 || true
  echo "[错误] 获取生产部署互斥锁超时"
  exit 1
}
