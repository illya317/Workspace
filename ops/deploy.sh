#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
PM2_WECOM_BOT_NAME="${PM2_WECOM_BOT_NAME:-${PM2_NAME}-wecom-agent}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-0}"
ENV_CONTENT="${ENV_CONTENT:-}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-}"
REMOTE_WORKSPACE_BACKUP_DIR="${REMOTE_WORKSPACE_BACKUP_DIR:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-5}"
LIBRARY_SYNC_SOURCE="${LIBRARY_SYNC_SOURCE:-}"
INSTALL_LIBRARY_RUNTIME_DEPS="${INSTALL_LIBRARY_RUNTIME_DEPS:-1}"
INSTALL_KIMI_AGENT_RUNTIME_DEPS="${INSTALL_KIMI_AGENT_RUNTIME_DEPS:-1}"
INSTALL_ONLYOFFICE_RUNTIME="${INSTALL_ONLYOFFICE_RUNTIME:-1}"
RELEASE_METADATA_FILE="${RELEASE_METADATA_FILE:-.cnb-release.json}"
RELEASE_SOURCE_BRANCH="${RELEASE_SOURCE_BRANCH:-release}"
EXPECTED_CNB_REPOSITORY="${EXPECTED_CNB_REPOSITORY:-}"
CONTROL_PLANE_POLICY="${CONTROL_PLANE_POLICY:-auto}"
DEPLOY_EXECUTION_MODE="${DEPLOY_EXECUTION_MODE:-combined}"
WORKSPACE_GATEWAY_NGINX_SITE="${WORKSPACE_GATEWAY_NGINX_SITE:-}"
WORKSPACE_RUNTIME_PM2_MODE="${WORKSPACE_RUNTIME_PM2_MODE:-legacy}"
WORKSPACE_RUNTIME_PM2_RUNNER="${WORKSPACE_RUNTIME_PM2_RUNNER:-/usr/local/sbin/workspace-runtime-pm2}"
REMOTE_CONTROL_ENV_FILE="${REMOTE_CONTROL_ENV_FILE:-}"
REMOTE_RUNTIME_ENV_FILE="${REMOTE_RUNTIME_ENV_FILE:-}"
if [ -n "$ENV_CONTENT" ]; then
  ENV_CONTENT_B64="$(printf '%s' "$ENV_CONTENT" | base64 | tr -d '\n')"
else
  ENV_CONTENT_B64=""
fi

if [ -z "$SERVER" ]; then
  echo "[错误] 缺少 SERVER 环境变量，例如 ubuntu@1.2.3.4"
  exit 1
fi

case "$CONTROL_PLANE_POLICY" in
  auto|refresh|require-existing) ;;
  *) echo "[错误] CONTROL_PLANE_POLICY 只能是 auto、refresh 或 require-existing"; exit 1 ;;
esac
case "$DEPLOY_EXECUTION_MODE" in
  combined) ;;
  application-only) CONTROL_PLANE_POLICY=require-existing ;;
  control-plane-only) CONTROL_PLANE_POLICY=refresh ;;
  *) echo "[错误] DEPLOY_EXECUTION_MODE 只能是 combined、application-only 或 control-plane-only"; exit 1 ;;
esac
case "$WORKSPACE_RUNTIME_PM2_MODE" in
  legacy|hardened) ;;
  *) echo "[错误] WORKSPACE_RUNTIME_PM2_MODE 只能是 legacy 或 hardened"; exit 1 ;;
esac

if [ -z "$REMOTE_DIR" ]; then
  echo "[错误] 缺少 REMOTE_DIR 环境变量，例如 /home/<user>/workspace"
  exit 1
fi

if [ -z "$EXPECTED_CNB_REPOSITORY" ]; then
  echo "[错误] 缺少 EXPECTED_CNB_REPOSITORY，例如 owner/repository"
  exit 1
fi

if [ -z "$HEALTHCHECK_URL" ]; then
  echo "[错误] 缺少 HEALTHCHECK_URL；部署必须配置服务器本机可访问的强制健康检查地址"
  exit 1
fi
case "$HEALTHCHECK_URL" in
  http://*|https://*) ;;
  *) echo "[错误] HEALTHCHECK_URL 必须使用 http:// 或 https://"; exit 1 ;;
esac
case "$HEALTHCHECK_URL" in
  *"'"*) echo "[错误] HEALTHCHECK_URL 不能包含单引号"; exit 1 ;;
esac
WORKSPACE_PUBLIC_ORIGIN_HINT="$(HEALTHCHECK_URL="$HEALTHCHECK_URL" node -e 'process.stdout.write(new URL(process.env.HEALTHCHECK_URL).origin)')"

if [ -z "$REMOTE_WORKSPACE_CONFIG_DIR" ]; then
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
elif [ "$REMOTE_WORKSPACE_CONFIG_DIR" != "$REMOTE_DIR/.workspace" ]; then
  echo "[警告] REMOTE_WORKSPACE_CONFIG_DIR 已统一为 $REMOTE_DIR/.workspace，忽略旧值: $REMOTE_WORKSPACE_CONFIG_DIR"
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

if [ -z "$REMOTE_CONTROL_ENV_FILE" ]; then
  if [ "$WORKSPACE_RUNTIME_PM2_MODE" = "hardened" ]; then
    REMOTE_CONTROL_ENV_FILE="$REMOTE_WORKSPACE_CONFIG_DIR/control-plane.env"
  else
    REMOTE_CONTROL_ENV_FILE="$REMOTE_WORKSPACE_CONFIG_DIR/.env"
  fi
fi
if [ -z "$REMOTE_RUNTIME_ENV_FILE" ]; then
  if [ "$WORKSPACE_RUNTIME_PM2_MODE" = "hardened" ]; then
    REMOTE_RUNTIME_ENV_FILE="$REMOTE_WORKSPACE_CONFIG_DIR/runtime.env"
  else
    REMOTE_RUNTIME_ENV_FILE="$REMOTE_CONTROL_ENV_FILE"
  fi
fi
for remote_secret_path in "$REMOTE_CONTROL_ENV_FILE" "$REMOTE_RUNTIME_ENV_FILE"; do
  case "$remote_secret_path" in
    /*) ;;
    *) echo "[错误] control/runtime env 路径必须是绝对路径: $remote_secret_path"; exit 1 ;;
  esac
  case "$remote_secret_path" in
    *[!A-Za-z0-9_./-]*) echo "[错误] control/runtime env 路径包含不安全字符: $remote_secret_path"; exit 1 ;;
  esac
done
if [ "$WORKSPACE_RUNTIME_PM2_MODE" = "legacy" ] && [ "$REMOTE_RUNTIME_ENV_FILE" != "$REMOTE_CONTROL_ENV_FILE" ]; then
  echo "[错误] legacy PM2 模式不能声明独立 runtime env；请启用 WORKSPACE_RUNTIME_PM2_MODE=hardened"
  exit 1
fi
if [ "$WORKSPACE_RUNTIME_PM2_MODE" = "hardened" ]; then
  if [ -n "$ENV_CONTENT" ]; then
    echo "[错误] hardened PM2 模式禁止通过 ENV_CONTENT 下发共享凭据；请预置隔离的 runtime/control-plane env"
    exit 1
  fi
  if [ "$REMOTE_RUNTIME_ENV_FILE" = "$REMOTE_CONTROL_ENV_FILE" ]; then
    echo "[错误] hardened PM2 模式必须隔离 runtime env 与 control-plane env"
    exit 1
  fi
  case "$WORKSPACE_RUNTIME_PM2_RUNNER" in
    /*) ;;
    *) echo "[错误] WORKSPACE_RUNTIME_PM2_RUNNER 必须是绝对路径"; exit 1 ;;
  esac
  case "$WORKSPACE_RUNTIME_PM2_RUNNER" in
    *[!A-Za-z0-9_./-]*) echo "[错误] WORKSPACE_RUNTIME_PM2_RUNNER 包含不安全字符"; exit 1 ;;
  esac
fi

if [ -z "$REMOTE_BACKUP_DIR" ] && [ -n "$REMOTE_WORKSPACE_BACKUP_DIR" ]; then
  REMOTE_BACKUP_DIR="$REMOTE_WORKSPACE_BACKUP_DIR"
fi

if [ -z "$REMOTE_BACKUP_DIR" ]; then
  REMOTE_BACKUP_DIR="$REMOTE_DIR/.workspace.backups"
elif [ "$REMOTE_BACKUP_DIR" != "$REMOTE_DIR/.workspace.backups" ]; then
  echo "[警告] REMOTE_BACKUP_DIR 已统一为 $REMOTE_DIR/.workspace.backups，忽略旧值: $REMOTE_BACKUP_DIR"
  REMOTE_BACKUP_DIR="$REMOTE_DIR/.workspace.backups"
fi
REMOTE_RUNTIME_SNAPSHOT_DIR="$REMOTE_BACKUP_DIR/workspace-runtime-snapshots"
REMOTE_DEPLOY_TOOL_DIR="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/deploy-tools"
REMOTE_RELEASE_RECEIPT_TOOL="$REMOTE_DEPLOY_TOOL_DIR/release-receipt.mjs"
REMOTE_CONTROL_PLANE_RECEIPT_TOOL="$REMOTE_DEPLOY_TOOL_DIR/control-plane-receipt.mjs"
REMOTE_CONTROL_PLANE_RECEIPT="$REMOTE_WORKSPACE_CONFIG_DIR/control-plane-release.json"
REMOTE_RELEASE_TIMING_TOOL="$REMOTE_DEPLOY_TOOL_DIR/release-timing.mjs"
REMOTE_RELEASE_TIMING_SHELL="$REMOTE_DEPLOY_TOOL_DIR/lib/release-timing.sh"
REMOTE_GATEWAY_GENERATION_TOOL="$REMOTE_DEPLOY_TOOL_DIR/gateway-generation.mjs"
REMOTE_GATEWAY_SWITCH_TOOL="$REMOTE_DEPLOY_TOOL_DIR/switch-deploy-gateway.sh"
REMOTE_FULL_DEPLOY_GRAPH="$REMOTE_DEPLOY_TOOL_DIR/full-deploy-graph.json"
REMOTE_GATEWAY_ROOT="$REMOTE_WORKSPACE_CONFIG_DIR/gateway"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_DAYS 必须是非负整数"; exit 1 ;;
esac
case "$BACKUP_RETENTION_COUNT" in
  ''|*[!0-9]*) echo "[错误] BACKUP_RETENTION_COUNT 必须是非负整数"; exit 1 ;;
esac
if [ "$BACKUP_RETENTION_COUNT" -lt 1 ]; then
  echo "[错误] BACKUP_RETENTION_COUNT 必须至少为 1，避免删除本次部署备份"
  exit 1
fi

TMPKEY=""
if [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMPKEY=$(mktemp)
  printf '%s\n' "$KEY_CONTENT" > "$TMPKEY"
  chmod 600 "$TMPKEY"
  SSH_KEY="$TMPKEY"
else
  echo "[错误] 需要 KEY 或 KEY_CONTENT 环境变量"
  exit 1
fi

# Reuse one authenticated transport so public pre-auth traffic cannot make the
# many deployment ssh/rsync steps repeatedly compete with sshd MaxStartups.
SSH_CONTROL_DIR="$(mktemp -d)"
SSH_CONTROL_PATH="$SSH_CONTROL_DIR/master"
SSH_CONTROL_PERSIST_SECONDS="${SSH_CONTROL_PERSIST_SECONDS:-900}"
SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=15
  -o ConnectionAttempts=1
  -o StrictHostKeyChecking=accept-new
  -o ControlMaster=auto
  -o "ControlPersist=${SSH_CONTROL_PERSIST_SECONDS}"
  -o "ControlPath=$SSH_CONTROL_PATH"
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)
RSYNC_SSH_COMMAND="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=$SSH_CONTROL_PERSIST_SECONDS -o ControlPath=$SSH_CONTROL_PATH -o ServerAliveInterval=30 -o ServerAliveCountMax=3"
REMOTE_DEPLOY_LOCK_PID=""
REMOTE_DEPLOY_LOCK_TOKEN=""
REMOTE_DEPLOY_LOCK_HELD=0
DEPLOYED_SOURCE_SHA=""
DEPLOYED_SOURCE_TREE=""
DEPLOYED_CANONICAL_SOURCE_SHA=""
DEPLOYED_CANONICAL_SOURCE_TREE=""
DEPLOYED_CNB_INJECTION_SHA=""
DEPLOYED_ARTIFACT_SHA=""
DEPLOYED_CNB_BRANCH=""
DEPLOYED_MIGRATION_SET_SHA=""
RELEASE_TIMING_ENABLED=0
REMOTE_RELEASE_TIMING_ENABLED=0
FULL_DEPLOY_GRAPH_TMP=""

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
  MANAGED_PROCESSES=\"\$managed_processes\" MANAGED_NAMES='$PM2_NAME-candidate,$PM2_NAME,$PM2_WECOM_BOT_NAME' node - <<'NODE'
const processes = JSON.parse(process.env.MANAGED_PROCESSES || 'null');
if (!Array.isArray(processes)) throw new Error('runtime PM2 runner jlist did not return an array');
const managed = new Set(process.env.MANAGED_NAMES.split(','));
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
  for (const key of [
    'DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL', 'WORKSPACE_MONITOR_DATABASE_URL',
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
    for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION PG_POOL_MAX PG_APPLICATION_NAME \\
      WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_INTERNAL_ORIGIN WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE \\
      WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL; do
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
    "$SERVER:$REMOTE_DEPLOY_TOOL_DIR/"
  rsync -az -e "$RSYNC_SSH_COMMAND" "$FULL_DEPLOY_GRAPH_TMP" "$SERVER:$REMOTE_FULL_DEPLOY_GRAPH"
  rm -f "$FULL_DEPLOY_GRAPH_TMP"
  FULL_DEPLOY_GRAPH_TMP=""
  ssh_cmd "
    chmod 755 '$REMOTE_RELEASE_RECEIPT_TOOL' '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' '$REMOTE_DEPLOY_TOOL_DIR/tenant-config-manifest.mjs' \
      '$REMOTE_DEPLOY_TOOL_DIR/control-plane-requirements.mjs' '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-release.mjs' \
      '$REMOTE_GATEWAY_GENERATION_TOOL' '$REMOTE_GATEWAY_SWITCH_TOOL'
    chmod 600 '$REMOTE_FULL_DEPLOY_GRAPH'
    node --check '$REMOTE_RELEASE_RECEIPT_TOOL'
    node --check '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/tenant-config-manifest.mjs'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/control-plane-requirements.mjs'
    node --check '$REMOTE_DEPLOY_TOOL_DIR/deploy-unit-release.mjs'
    node --check '$REMOTE_GATEWAY_GENERATION_TOOL'
    bash -n '$REMOTE_GATEWAY_SWITCH_TOOL'
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

reconcile_completed_deploy_markers() {
  echo "==> 锁内清理遗留 candidate，并对账正式部署记录与 maintenance/bootstrap marker..."
  ssh_cmd "
    set -e
    deployed_record='$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    maintenance_marker='$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    bootstrap_marker='$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
    fence_all_writers() {
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      managed_processes=\$(pm2 jlist)
      MANAGED_PROCESSES=\"\$managed_processes\" MANAGED_NAMES='$PM2_NAME-candidate,$PM2_NAME,$PM2_WECOM_BOT_NAME' python3 - <<'PY'
import json
import os

processes = json.loads(os.environ['MANAGED_PROCESSES'])
if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
    raise SystemExit('PM2 writer fencing did not return a process object list')
names = set(os.environ['MANAGED_NAMES'].split(','))
for item in processes:
    if item.get('name') not in names:
        continue
    environment = item.get('pm2_env') or {}
    pid = item.get('pid') or 0
    if environment.get('status') != 'stopped' or pid != 0:
        raise SystemExit(f\"managed writer {item.get('name')} is still active after fencing\")
PY
      pm2 save
    }
    # A candidate from an interrupted or older deploy must never survive into
    # backup, migration, seed, or provisioning for the next attempt.
    pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
    candidate_processes=\$(pm2 jlist)
    PROCESS_LIST=\"\$candidate_processes\" PROCESS_NAME='$PM2_NAME-candidate' python3 - <<'PY'
import json
import os

processes = json.loads(os.environ['PROCESS_LIST'])
if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
    raise SystemExit('candidate cleanup did not return a process object list')
matches = [item for item in processes if item.get('name') == os.environ['PROCESS_NAME']]
for item in matches:
    environment = item.get('pm2_env') or {}
    pid = item.get('pid') or 0
    if environment.get('status') != 'stopped' or pid != 0:
        raise SystemExit('candidate writer is still active before release verification')
PY
    pm2 save
    if [ ! -e \"\$maintenance_marker\" ] && [ ! -e \"\$bootstrap_marker\" ]; then
      exit 0
    fi
    if [ ! -f \"\$deployed_record\" ]; then
      echo '==> 正式部署记录尚未创建；先隔离所有 writer，再验证同一 candidate 的续跑 marker'
      fence_all_writers
    fi
    marker_values=\$(DEPLOYED_RECORD=\"\$deployed_record\" MAINTENANCE_MARKER=\"\$maintenance_marker\" BOOTSTRAP_MARKER=\"\$bootstrap_marker\" REMOTE_DIR='$REMOTE_DIR' EXPECTED_CANDIDATE='$RELEASE_SOURCE_SHA' python3 - <<'PY'
import json
import os
import re
from pathlib import Path

try:
    marker_sources = []
    maintenance = Path(os.environ['MAINTENANCE_MARKER'])
    if maintenance.exists():
        if not maintenance.is_file():
            raise ValueError('maintenance marker is not a regular file')
        lines = maintenance.read_text(encoding='utf-8').splitlines()
        values = [line.removeprefix('sourceSha=') for line in lines if line.startswith('sourceSha=')]
        if len(lines) != 4 or len(values) != 1 or not re.fullmatch(r'[0-9a-f]{40}', values[0]):
            raise ValueError('maintenance marker source is invalid')
        marker_sources.append(values[0])
    bootstrap = Path(os.environ['BOOTSTRAP_MARKER'])
    if bootstrap.exists():
        if not bootstrap.is_file():
            raise ValueError('bootstrap progress marker is not a regular file')
        candidate = json.loads(bootstrap.read_text(encoding='utf-8')).get('candidateSha')
        if not isinstance(candidate, str) or not re.fullmatch(r'[0-9a-f]{40}', candidate):
            raise ValueError('bootstrap progress marker source is invalid')
        marker_sources.append(candidate)
    if not marker_sources:
        raise ValueError('marker reconciliation found no candidate source')

    deployed_path = Path(os.environ['DEPLOYED_RECORD'])
    if not deployed_path.exists():
        if all(value == os.environ['EXPECTED_CANDIDATE'] for value in marker_sources):
            print('RESUME')
        else:
            print('CONFLICT')
        raise SystemExit(0)

    record = json.loads(deployed_path.read_text(encoding='utf-8'))
    source = record.get('source', {}).get('commitSha')
    release_dir = record.get('deployment', {}).get('releaseDir')
    if not isinstance(source, str) or not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('formal deployed-release source is invalid')
    release_root = (Path(os.environ['REMOTE_DIR']) / 'releases').resolve(strict=True)
    target = Path(release_dir).resolve(strict=True)
    target.relative_to(release_root)
    if all(value == source for value in marker_sources):
        print('CLEAN')
        print(source)
        print(target)
    elif all(value == os.environ['EXPECTED_CANDIDATE'] for value in marker_sources):
        print('RESUME')
    else:
        print('CONFLICT')
except Exception as error:
    print('INVALID')
    print(str(error))
PY
    )
    marker_action=\$(printf '%s\n' \"\$marker_values\" | sed -n '1p')
    if [ \"\$marker_action\" = 'RESUME' ]; then
      fence_all_writers
      echo '==> marker 属于当前 candidate 的未完成尝试；writer 已隔离，保留并进入锁内 resume'
      exit 0
    fi
    if [ \"\$marker_action\" = 'CONFLICT' ] || [ \"\$marker_action\" = 'INVALID' ]; then
      fence_all_writers
      echo '[错误] marker 与正式记录/当前 candidate 冲突或损坏；writer 已保持隔离'
      printf '%s\n' \"\$marker_values\" | sed -n '2p' >&2
      exit 1
    fi
    if [ \"\$marker_action\" != 'CLEAN' ]; then
      fence_all_writers
      echo '[错误] marker reconciliation action 无效'
      exit 1
    fi
    if ! (
      set -e
      record_source=\$(printf '%s\n' \"\$marker_values\" | sed -n '2p')
      record_target=\$(printf '%s\n' \"\$marker_values\" | sed -n '3p')
      current_target=\$(readlink -f '$REMOTE_DIR/current') || exit 1
      if [ \"\$current_target\" != \"\$record_target\" ]; then
        echo '[错误] marker 对账时 current 未指向正式 deployed-release'
        exit 1
      fi
      process_list=\$(pm2 jlist) || exit 1
      PROCESS_LIST=\"\$process_list\" PROCESS_NAME='$PM2_NAME' EXPECTED_TARGET=\"\$record_target\" node - <<'NODE' || exit 1
const fs = require('fs');
const path = require('path');
const processes = JSON.parse(process.env.PROCESS_LIST || 'null');
const matches = Array.isArray(processes)
  ? processes.filter((item) => item?.name === process.env.PROCESS_NAME)
  : [];
if (matches.length !== 1 || matches[0]?.pm2_env?.status !== 'online'
  || !Number.isInteger(matches[0]?.pid) || matches[0].pid < 1) {
  throw new Error('marker reconciliation requires one online Workspace process');
}
const target = fs.realpathSync(process.env.EXPECTED_TARGET);
for (const value of [matches[0]?.pm2_env?.pm_cwd, matches[0]?.pm2_env?.pm_exec_path]) {
  if (typeof value !== 'string') throw new Error('marker reconciliation PM2 identity is incomplete');
  const actual = fs.realpathSync(value);
  if (actual !== target && !actual.startsWith(target + path.sep)) {
    throw new Error('marker reconciliation PM2 identity is outside the deployed release');
  }
}
NODE
      curl -fsS '$HEALTHCHECK_URL' >/dev/null || exit 1
      version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version') || exit 1
      VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION=\"\$record_source\" node - <<'NODE' || exit 1
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('marker reconciliation runtime version does not match deployed-release');
}
NODE
    ); then
      fence_all_writers
      echo '[错误] CLEAN marker 无法证明 current/PM2/health/version 与正式记录一致；writer 已隔离'
      exit 1
    fi
    rm -f \"\$maintenance_marker\" \"\$bootstrap_marker\"
    echo '==> 正式 release 已在线；遗留 marker 已幂等清理'
  "
}

verify_bootstrap_production_state() {
  [ -n "$RELEASE_BOOTSTRAP_BASE" ] || return 0
  echo "==> 锁内复验旧生产接管凭证（current / PM2 / runtime / BUILD_ID / migrations）..."
  ssh_cmd "
    set -e
    test ! -e '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    bootstrap_progress_marker='$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
    bootstrap_progress=0
    if [ -e \"\$bootstrap_progress_marker\" ]; then
      bootstrap_marker_status=\$(BOOTSTRAP_PROGRESS_MARKER=\"\$bootstrap_progress_marker\" \
      EXPECTED_BASELINE='$RELEASE_BOOTSTRAP_BASE' \
      EXPECTED_CANDIDATE='$RELEASE_SOURCE_SHA' \
      EXPECTED_TREE='$RELEASE_SOURCE_TREE' \
      EXPECTED_MIGRATION_SET='$RELEASE_MIGRATION_SET_SHA' \
      EXPECTED_LEGACY_RELEASE='$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID' \
      EXPECTED_LEGACY_CNB_COMMIT='$RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT' \
      EXPECTED_LEGACY_CNB_BUILD_SN='$RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN' \
      EXPECTED_LEGACY_RUNTIME_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' \
      EXPECTED_LEGACY_BUILD_ID='$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' \
      EXPECTED_LEGACY_CNB_REPOSITORY='$RELEASE_BOOTSTRAP_CNB_REPOSITORY' \
      EXPECTED_BASELINE_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' \
      EXPECTED_BASELINE_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' python3 - <<'PY'
import json
import os
from pathlib import Path

expected = {
    'schemaVersion': 2,
    'phase': 'mutation-started',
    'baselineSha': os.environ['EXPECTED_BASELINE'],
    'candidateSha': os.environ['EXPECTED_CANDIDATE'],
    'candidateTreeSha': os.environ['EXPECTED_TREE'],
    'candidateMigrationSetSha256': os.environ['EXPECTED_MIGRATION_SET'],
    'legacyReleaseId': os.environ['EXPECTED_LEGACY_RELEASE'],
    'legacyCnbCommitSha': os.environ['EXPECTED_LEGACY_CNB_COMMIT'],
    'legacyCnbBuildSn': os.environ['EXPECTED_LEGACY_CNB_BUILD_SN'],
    'legacyRuntimeVersion': os.environ['EXPECTED_LEGACY_RUNTIME_VERSION'],
    'legacyBuildId': os.environ['EXPECTED_LEGACY_BUILD_ID'],
    'legacyCnbRepository': os.environ['EXPECTED_LEGACY_CNB_REPOSITORY'],
    'baselineMigrationCount': int(os.environ['EXPECTED_BASELINE_COUNT']),
    'baselineMigrationSetSha256': os.environ['EXPECTED_BASELINE_DIGEST'],
}
path = Path(os.environ['BOOTSTRAP_PROGRESS_MARKER'])
try:
    actual = json.loads(path.read_text(encoding='utf-8'))
except Exception as error:
    raise SystemExit(f'production bootstrap progress marker is invalid: {error}')
if actual == expected:
    print('MATCH')
else:
    raise SystemExit('production bootstrap progress marker is not the exact same receipt and candidate')
PY
      )
      case \"\$bootstrap_marker_status\" in
        MATCH) bootstrap_progress=1 ;;
        *) echo '[错误] production bootstrap progress marker 状态无效'; exit 1 ;;
      esac
    fi
    expected_target='$REMOTE_DIR/releases/$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID'
    maintenance_marker='$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    test -d \"\$expected_target\"
    current_target=\$(readlink -f '$REMOTE_DIR/current')
    if [ \"\$current_target\" = \"\$expected_target\" ]; then
      test -f \"\$expected_target/workspace/.next/BUILD_ID\"
      actual_build_id=\$(cat \"\$expected_target/workspace/.next/BUILD_ID\")
      if [ \"\$actual_build_id\" != '$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' ]; then
        echo '[错误] production bootstrap legacy filesystem BUILD_ID 已漂移'
        exit 1
      fi
    elif [ \"\$bootstrap_progress\" = '1' ]; then
      CURRENT_TARGET=\"\$current_target\" RELEASE_ROOT='$REMOTE_DIR/releases' EXPECTED_SHA='$RELEASE_SOURCE_SHA' EXPECTED_TREE='$RELEASE_SOURCE_TREE' EXPECTED_MIGRATION_SET='$RELEASE_MIGRATION_SET_SHA' node - <<'NODE'
const fs = require('fs');
const path = require('path');
const target = fs.realpathSync(process.env.CURRENT_TARGET);
const releaseRoot = fs.realpathSync(process.env.RELEASE_ROOT);
if (target !== releaseRoot && !target.startsWith(releaseRoot + path.sep)) {
  throw new Error('bootstrap retry candidate current is outside the release root');
}
if (!path.basename(target).endsWith('-' + process.env.EXPECTED_SHA.slice(0, 8))) {
  throw new Error('bootstrap retry candidate release id does not bind the source SHA');
}
const manifest = JSON.parse(fs.readFileSync(path.join(target, '.release-manifest.json'), 'utf8'));
const buildId = fs.readFileSync(path.join(target, 'workspace/.next/BUILD_ID'), 'utf8').trim();
if (manifest?.source?.commitSha !== process.env.EXPECTED_SHA
  || manifest?.source?.treeSha !== process.env.EXPECTED_TREE
  || manifest?.build?.buildId !== process.env.EXPECTED_SHA
  || manifest?.inputs?.migrationSetSha256 !== process.env.EXPECTED_MIGRATION_SET
  || buildId !== process.env.EXPECTED_SHA) {
  throw new Error('bootstrap retry candidate current identity does not match the progress receipt');
}
NODE
    else
      echo '[错误] production bootstrap current release 已漂移'
      exit 1
    fi
    if [ \"\$bootstrap_progress\" = '1' ]; then
      echo '==> bootstrap mutation-started marker 已存在；在任何网络复验前保持所有 writer 隔离'
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      pm2 save
    fi
    if [ -f \"\$maintenance_marker\" ]; then
      if [ \"\$bootstrap_progress\" != '1' ]; then
        echo '[错误] production bootstrap maintenance marker 缺少绑定 progress receipt'
        exit 1
      fi
      persisted_source=\$(sed -n 's/^sourceSha=//p' \"\$maintenance_marker\")
      if [ \"\$persisted_source\" != '$RELEASE_SOURCE_SHA' ]; then
        echo '[错误] production bootstrap maintenance marker 属于其他候选版本'
        exit 1
      fi
      echo '==> 已验证 maintenance/progress 身份；锁内主动隔离所有可能残留的 writer'
      pm2 delete '$PM2_NAME-candidate' 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      pm2 save
    fi
    pm2_list=\$(pm2 jlist)
    pm2_mode=\$(EXPECTED_TARGET=\"\$expected_target\" EXPECTED_PM2_NAME='$PM2_NAME' EXPECTED_CANDIDATE_NAME='$PM2_NAME-candidate' EXPECTED_WECOM_NAME='$PM2_WECOM_BOT_NAME' PM2_LIST=\"\$pm2_list\" python3 - <<'PY'
import json
import os
from pathlib import Path

target = Path(os.environ['EXPECTED_TARGET']).resolve(strict=True)
try:
    processes = json.loads(os.environ['PM2_LIST'])
except Exception as error:
    raise SystemExit(f'production bootstrap PM2 state is invalid: {error}')
if not isinstance(processes, list):
    raise SystemExit('production bootstrap PM2 state is not a list')
names = {
    os.environ['EXPECTED_PM2_NAME'],
    os.environ['EXPECTED_CANDIDATE_NAME'],
    os.environ['EXPECTED_WECOM_NAME'],
}
managed = [item for item in processes if isinstance(item, dict) and item.get('name') in names]
grouped = {name: [item for item in managed if item.get('name') == name] for name in names}
if any(len(items) > 1 for items in grouped.values()):
    raise SystemExit('production bootstrap PM2 contains duplicate managed process names')

workspace = grouped[os.environ['EXPECTED_PM2_NAME']][0] if grouped[os.environ['EXPECTED_PM2_NAME']] else None
candidate = grouped[os.environ['EXPECTED_CANDIDATE_NAME']][0] if grouped[os.environ['EXPECTED_CANDIDATE_NAME']] else None
wecom = grouped[os.environ['EXPECTED_WECOM_NAME']][0] if grouped[os.environ['EXPECTED_WECOM_NAME']] else None

def state(item):
    if item is None:
        return 'absent'
    environment = item.get('pm2_env') or {}
    status = environment.get('status')
    pid = item.get('pid')
    if status == 'stopped' and pid == 0:
        return 'stopped'
    if status == 'online' and isinstance(pid, int) and pid > 0:
        return 'online'
    return 'ambiguous'

def assert_bound(item, label):
    environment = item.get('pm2_env') or {}
    try:
        cwd = Path(environment['pm_cwd']).resolve(strict=True)
        executable = Path(environment['pm_exec_path']).resolve(strict=True)
        cwd.relative_to(target)
        executable.relative_to(target)
    except Exception:
        raise SystemExit(f'production bootstrap {label} PM2 cwd/exec is outside the legacy release')
    if not cwd.is_dir() or not executable.is_file():
        raise SystemExit(f'production bootstrap {label} PM2 cwd/exec is not readable')

candidate_state = state(candidate)
workspace_state = state(workspace)
wecom_state = state(wecom)
if candidate_state not in {'absent', 'stopped'}:
    raise SystemExit('production bootstrap candidate writer is not safely offline')
if workspace_state == 'online' and wecom_state in {'absent', 'stopped', 'online'}:
    assert_bound(workspace, 'Workspace')
    if wecom_state == 'online':
        assert_bound(wecom, 'WeCom')
    print('ONLINE')
elif workspace_state in {'absent', 'stopped'} and wecom_state in {'absent', 'stopped'}:
    print('OFFLINE')
else:
    raise SystemExit('production bootstrap PM2 writer state is ambiguous')
PY
    )
    database_progress=0
    if [ -f \"\$maintenance_marker\" ]; then
      if [ \"\$bootstrap_progress\" != '1' ] || [ \"\$pm2_mode\" != 'OFFLINE' ]; then
        echo '[错误] production bootstrap maintenance 状态缺少绑定凭证或 writer 未隔离'
        exit 1
      fi
      database_progress=1
    elif [ \"\$pm2_mode\" != 'ONLINE' ] && [ \"\$bootstrap_progress\" != '1' ]; then
      echo '[错误] production bootstrap 在非维护状态下必须保持旧 Workspace 在线'
      exit 1
    fi
    if [ \"\$pm2_mode\" = 'ONLINE' ]; then
      curl -fsS '$HEALTHCHECK_URL' >/dev/null
      version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
      VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('production bootstrap runtime version has drifted');
}
NODE
    fi
    load_control_environment
    test -n \"\${DIRECT_URL:-}\"
    migration_rows=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -At -F '|' -c 'SELECT migration_name, checksum, CASE WHEN finished_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, CASE WHEN rolled_back_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, applied_steps_count::text FROM "_prisma_migrations" ORDER BY migration_name, id')
    MIGRATION_ROWS=\"\$migration_rows\" EXPECTED_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' EXPECTED_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' VALIDATION_MODE=\"\$database_progress\" python3 - <<'PY'
from hashlib import sha256
import os
import re

rows = []
for line in os.environ.get('MIGRATION_ROWS', '').splitlines():
    parts = line.split('|')
    if len(parts) != 5:
        raise SystemExit('production bootstrap migration row is malformed')
    name, checksum, finished, rolled_back, steps = parts
    if not re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', name):
        raise SystemExit('production bootstrap migration name is invalid')
    if not re.fullmatch(r'[0-9a-f]{64}', checksum):
        raise SystemExit('production bootstrap migration checksum is invalid')
    if not steps.isdigit() or int(steps) < 0:
        raise SystemExit('production bootstrap migration applied-step count is invalid')
    rows.append((name, checksum, finished, rolled_back, int(steps)))
expected_count = int(os.environ['EXPECTED_COUNT'])
if len(rows) < expected_count:
    raise SystemExit('production bootstrap baseline migrations are missing')
baseline = rows[:expected_count]
if len({name for name, *_ in baseline}) != len(baseline):
    raise SystemExit('production bootstrap baseline migration names are duplicated')
if any(finished != '1' or rolled_back != '0' or steps < 1 for _, _, finished, rolled_back, steps in baseline):
    raise SystemExit('production bootstrap baseline migration state has drifted')
canonical = ''.join(f'{name}\t{checksum}\n' for name, checksum, *_ in baseline).encode()
if sha256(canonical).hexdigest() != os.environ['EXPECTED_DIGEST']:
    raise SystemExit('production bootstrap migration checksum set has drifted')
if os.environ['VALIDATION_MODE'] == '0' and len(rows) != expected_count:
    raise SystemExit('production bootstrap has migrations beyond the audited baseline before takeover')
if len(rows) > expected_count:
    last_baseline_name = baseline[-1][0]
    if any(name <= last_baseline_name for name, *_ in rows[expected_count:]):
        raise SystemExit('production bootstrap migration progress is not append-only')
PY
  "
}

verify_release_order() {
  local remote_state
  local record_kind=""
  local deployed_repository=""
  local order_action
  local args
  local comparison_base=""
  local comparison_status
  local comparison_ahead
  local comparison_json=""

  remote_state="$(ssh_cmd "
    deployed_record='$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
    if [ ! -f \"\$deployed_record\" ]; then
      echo MISSING
    elif ! node '$REMOTE_RELEASE_RECEIPT_TOOL' inspect \
      --file \"\$deployed_record\" \
      --expected-repository '$RELEASE_CNB_REPOSITORY' \
      --format tsv; then
      echo INVALID
    fi
  ")"
  IFS=$'\t' read -r \
    record_kind \
    DEPLOYED_SOURCE_SHA \
    DEPLOYED_SOURCE_TREE \
    DEPLOYED_CANONICAL_SOURCE_SHA \
    DEPLOYED_CANONICAL_SOURCE_TREE \
    DEPLOYED_CNB_INJECTION_SHA \
    DEPLOYED_ARTIFACT_SHA \
    deployed_repository \
    DEPLOYED_CNB_BRANCH \
    DEPLOYED_MIGRATION_SET_SHA <<< "$remote_state"
  case "$record_kind" in
    MISSING)
      DEPLOYED_SOURCE_SHA=""
      DEPLOYED_SOURCE_TREE=""
      DEPLOYED_CANONICAL_SOURCE_SHA=""
      DEPLOYED_CANONICAL_SOURCE_TREE=""
      DEPLOYED_CNB_INJECTION_SHA=""
      DEPLOYED_ARTIFACT_SHA=""
      if [ -z "$RELEASE_BOOTSTRAP_BASE" ]; then
        echo "[错误] 生产部署记录缺失；只有经审计的一次性 production bootstrap 凭证可接管"
        exit 1
      fi
      ;;
    RECORD)
      if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
        echo "[错误] production bootstrap 凭证在正式部署记录存在后必须失效"
        exit 1
      fi
      if [ -z "$DEPLOYED_SOURCE_TREE" ]; then
        DEPLOYED_SOURCE_TREE="$(git rev-parse "${DEPLOYED_SOURCE_SHA}^{tree}")"
      fi
      if [ -z "$DEPLOYED_CANONICAL_SOURCE_TREE" ]; then
        DEPLOYED_CANONICAL_SOURCE_TREE="$(git rev-parse "${DEPLOYED_CANONICAL_SOURCE_SHA}^{tree}")"
      fi
      if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ] && [ "$DEPLOYED_SOURCE_SHA" != "$RELEASE_GENESIS_FROM_SOURCE" ]; then
        echo "[错误] genesis reset 只授权从 $RELEASE_GENESIS_FROM_SOURCE 切换；当前生产是 $DEPLOYED_SOURCE_SHA"
        exit 1
      fi
      if [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
        if [ "$DEPLOYED_SOURCE_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_SOURCE_TREE" != "$RELEASE_RECEIPT_RECOVERY_TREE" ] \
          || [ "$DEPLOYED_CANONICAL_SOURCE_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_CANONICAL_SOURCE_TREE" != "$RELEASE_RECEIPT_RECOVERY_TREE" ] \
          || [ "$DEPLOYED_CNB_INJECTION_SHA" != "$RELEASE_RECEIPT_RECOVERY_SOURCE" ] \
          || [ "$DEPLOYED_MIGRATION_SET_SHA" != "$RELEASE_RECEIPT_RECOVERY_MIGRATION_SET" ]; then
          echo "[错误] 待修复的 legacy local 回执已变化；拒绝继续"
          exit 1
        fi
        ssh_cmd "node '$REMOTE_RELEASE_RECEIPT_TOOL' assert \
          --file '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json' \
          --expected-repository '$RELEASE_CNB_REPOSITORY' \
          --runtime-source '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --runtime-tree '$RELEASE_RECEIPT_RECOVERY_TREE' \
          --canonical-source '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --canonical-tree '$RELEASE_RECEIPT_RECOVERY_TREE' \
          --cnb-injection '$RELEASE_RECEIPT_RECOVERY_SOURCE' \
          --migration-set '$RELEASE_RECEIPT_RECOVERY_MIGRATION_SET' \
          --transport local" >/dev/null
      fi
      ;;
    *) echo "[错误] 服务器 deployed-release.json 无法证明当前生产版本"; exit 1 ;;
  esac

  args=(--candidate "$RELEASE_SOURCE_SHA" --current-head "$RELEASE_SOURCE_SHA")
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    [ "$record_kind" = "RECORD" ] || { echo "[错误] genesis reset 需要正式生产回执"; exit 1; }
    order_action="deploy"
    comparison_base=""
  elif [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
    args+=(--bootstrap-base "$RELEASE_BOOTSTRAP_BASE")
    comparison_base="$RELEASE_BOOTSTRAP_BASE"
  elif [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    [ "$record_kind" = "RECORD" ] || { echo "[错误] legacy local 回执修复需要正式生产回执"; exit 1; }
    args+=(--deployed "$RELEASE_RECEIPT_RECOVERY_BASE")
    comparison_base="$RELEASE_RECEIPT_RECOVERY_BASE"
  elif [ -n "$DEPLOYED_SOURCE_SHA" ]; then
    args+=(--deployed "$DEPLOYED_SOURCE_SHA")
    comparison_base="$DEPLOYED_SOURCE_SHA"
    if [ "$comparison_base" = "$RELEASE_SOURCE_SHA" ]; then
      comparison_base=""
    fi
  fi
  if [ -n "$comparison_base" ]; then
    if ! git cat-file -e "${comparison_base}^{commit}" 2>/dev/null; then
      echo "[错误] 本地仓库缺少部署顺序基线提交: $comparison_base"
      exit 1
    fi
    if [ "$comparison_base" = "$RELEASE_SOURCE_SHA" ]; then
      comparison_status="identical"
      comparison_ahead=0
    else
      if ! git merge-base --is-ancestor "$comparison_base" "$RELEASE_SOURCE_SHA"; then
        echo "[错误] 候选 $RELEASE_SOURCE_SHA 不是部署基线 $comparison_base 的后代"
        exit 1
      fi
      if [ "$(git merge-base "$comparison_base" "$RELEASE_SOURCE_SHA")" != "$comparison_base" ]; then
        echo "[错误] 候选与部署基线的 merge-base 不精确"
        exit 1
      fi
      comparison_status="ahead"
      comparison_ahead="$(git rev-list --count "$comparison_base..$RELEASE_SOURCE_SHA")"
    fi
    comparison_json="{\"status\":\"$comparison_status\",\"ahead_by\":$comparison_ahead,\"base_commit\":{\"sha\":\"$comparison_base\"},\"merge_base_commit\":{\"sha\":\"$comparison_base\"},\"head_commit\":{\"sha\":\"$RELEASE_SOURCE_SHA\"}}"
    args+=(--comparison-json "$comparison_json")
  fi
  if [ -z "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    order_action="$(node ops/verify-deploy-order.mjs "${args[@]}")"
  fi
  if [ "$order_action" = "noop" ]; then
    echo "==> 生产记录已是 CNB source ${RELEASE_SOURCE_SHA:0:12}；锁内复验实时健康与版本。"
    run_healthcheck
    echo "==> 实时生产健康且版本一致，跳过重复部署。"
    exit 0
  fi
  if [ "$order_action" != "deploy" ]; then
    echo "[错误] 未知部署顺序判断: $order_action"
    exit 1
  fi
  verify_bootstrap_production_state
  RELEASE_CANONICAL_SOURCE_SHA="$RELEASE_SOURCE_SHA"
  RELEASE_CANONICAL_SOURCE_TREE="$RELEASE_SOURCE_TREE"
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    echo "==> 锁内已证明一次性 genesis 切换基线精确匹配当前生产。"
  elif [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    echo "==> 锁内已证明 legacy local 回执与恢复基线未漂移；本次成功后写回 canonical source。"
  else
    echo "==> 锁内已证明 CNB 候选顺序有效。"
  fi
}

require_local_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[错误] 当前 CI 容器缺少命令: $cmd"
    exit 1
  fi
}

resolve_release_metadata() {
  local release_head
  local release_parent_count
  local injection_files

  RELEASE_BOOTSTRAP_BASE=""
  RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT=""
  RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID=""
  RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN=""
  RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION=""
  RELEASE_BOOTSTRAP_LEGACY_BUILD_ID=""
  RELEASE_BOOTSTRAP_CNB_REPOSITORY=""
  RELEASE_BOOTSTRAP_MIGRATION_COUNT=""
  RELEASE_BOOTSTRAP_MIGRATION_DIGEST=""
  RELEASE_GENESIS_FROM_SOURCE=""
  RELEASE_GENESIS_LEGACY_MIGRATION_COUNT=""
  RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST=""
  RELEASE_GENESIS_BASELINE_MIGRATION=""
  RELEASE_GENESIS_BASELINE_CHECKSUM=""
  RELEASE_DATABASE_REPLACEMENT_DUMP_SHA=""
  RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE=""
  RELEASE_DATABASE_REPLACEMENT_REMOTE_ARTIFACT=""
  RELEASE_DATABASE_REPLACEMENT_MIGRATION_COUNT=""
  RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET=""
  RELEASE_DATABASE_REPLACEMENT_PREPARED_AT=""
  RELEASE_TRANSPORT=""
  RELEASE_RECEIPT_RECOVERY_BASE=""
  RELEASE_RECEIPT_RECOVERY_SOURCE=""
  RELEASE_RECEIPT_RECOVERY_TREE=""
  RELEASE_RECEIPT_RECOVERY_MIGRATION_SET=""

  if [ "$RELEASE_METADATA_FILE" != ".cnb-release.json" ]; then
    echo "[错误] RELEASE_METADATA_FILE 必须是 .cnb-release.json"
    exit 1
  fi
  test -f "$RELEASE_METADATA_FILE"

  release_head="$(git rev-parse HEAD)"
  release_parent_count="$(git rev-list --parents -n 1 "$release_head" | awk '{print NF - 1}')"
  if [ "$release_parent_count" != "1" ]; then
    echo "[错误] CNB injection commit 必须恰好有一个 canonical source parent"
    exit 1
  fi
  RELEASE_SOURCE_SHA="$(git rev-parse HEAD^ 2>/dev/null)" || {
    echo "[错误] CNB 发布提交缺少 canonical source parent"
    exit 1
  }
  RELEASE_SOURCE_TREE="$(git rev-parse "${RELEASE_SOURCE_SHA}^{tree}")"
  injection_files="$(git diff-tree --no-commit-id --name-only -r "$release_head" | LC_ALL=C sort)"
  if [ "$injection_files" != $'.cnb-release.json\n.cnb.yml' ]; then
    echo "[错误] CNB injection commit 只能修改 .cnb.yml 与 .cnb-release.json"
    printf '%s\n' "$injection_files"
    exit 1
  fi

  metadata_values="$(node - "$RELEASE_METADATA_FILE" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$EXPECTED_CNB_REPOSITORY" "$RELEASE_SOURCE_BRANCH" "$release_head" <<'NODE'
const fs = require('node:fs');
const [file, sha, tree, repository, branch, injectionSha] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
const transport = metadata.transport?.kind;
const localTiming = metadata.deployment?.localTiming;
const localTimingKeys = 'releaseAttemptCount,releaseProcessSeconds,releaseProcessStartedAt,tenantSyncSeconds';
const validLocalTiming = localTiming
  && Object.keys(localTiming).sort().join(',') === localTimingKeys
  && Number.isSafeInteger(localTiming.releaseProcessSeconds)
  && localTiming.releaseProcessSeconds >= 0
  && Number.isSafeInteger(localTiming.releaseAttemptCount)
  && localTiming.releaseAttemptCount >= 1
  && typeof localTiming.releaseProcessStartedAt === 'string'
  && !Number.isNaN(Date.parse(localTiming.releaseProcessStartedAt))
  && Number.isSafeInteger(localTiming.tenantSyncSeconds)
  && localTiming.tenantSyncSeconds >= 0;
if (metadata.schemaVersion !== 1
  || metadata.source?.commitSha !== sha
  || metadata.source?.treeSha !== tree
  || metadata.releaseCandidate?.schemaVersion !== 1
  || metadata.releaseCandidate?.kind !== 'workspace-release-candidate'
  || metadata.releaseCandidate?.status !== 'prepared'
  || metadata.releaseCandidate?.command !== 'ops/publish.sh prepare'
  || metadata.releaseCandidate?.sourceSha !== sha
  || metadata.releaseCandidate?.treeSha !== tree
  || !['cnb', 'local'].includes(transport)
  || JSON.stringify(metadata.releaseCandidate?.checks) !== JSON.stringify([
    'cnb-release-config',
    'tenant-config-dry-run',
    'tenant-permission-docs',
  ])
  || !Number.isFinite(Date.parse(metadata.releaseCandidate?.completedAt ?? ''))
  || metadata.cnb?.repository !== repository
  || metadata.cnb?.sourceBranch !== branch
  || !Number.isSafeInteger(metadata.deployment?.startedAtEpochSeconds)
  || metadata.deployment.startedAtEpochSeconds <= 0
  || !validLocalTiming) {
  throw new Error('CNB release metadata does not match injection parent');
}
const bootstrap = metadata.deploymentBootstrap;
const genesis = metadata.deploymentGenesis;
const databaseReplacement = metadata.databaseReplacement;
const receiptRecovery = metadata.deployedReceiptRecovery;
if (bootstrap && genesis) throw new Error('bootstrap and genesis metadata are mutually exclusive');
if (receiptRecovery) {
  const recoveryKeys = Object.keys(receiptRecovery).sort().join(',');
  if (bootstrap || genesis || databaseReplacement
    || recoveryKeys !== 'baseSha,kind,migrationSetSha256,sourceSha,treeSha'
    || receiptRecovery.kind !== 'legacy-local-injection-source'
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.baseSha ?? '')
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.sourceSha ?? '')
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.treeSha ?? '')
    || !/^[0-9a-f]{64}$/.test(receiptRecovery.migrationSetSha256 ?? '')
    || receiptRecovery.baseSha !== metadata.validation?.baseSha
    || receiptRecovery.sourceSha === sha) {
    throw new Error('deployed local receipt recovery metadata is invalid');
  }
}
if (databaseReplacement) {
  const replacementKeys = Object.keys(databaseReplacement).sort().join(',');
  const sourceKeys = Object.keys(databaseReplacement.source ?? {}).sort().join(',');
  const dumpKeys = Object.keys(databaseReplacement.dump ?? {}).sort().join(',');
  const databaseKeys = Object.keys(databaseReplacement.database ?? {}).sort().join(',');
  if (metadata.deployment?.target?.kind !== 'monolith' || bootstrap || genesis
    || replacementKeys !== 'database,dump,kind,preparedAt,schemaVersion,source,status'
    || databaseReplacement.schemaVersion !== 1
    || databaseReplacement.kind !== 'workspace-database-replacement'
    || databaseReplacement.status !== 'prepared'
    || sourceKeys !== 'commitSha,treeSha'
    || databaseReplacement.source.commitSha !== sha
    || databaseReplacement.source.treeSha !== tree
    || dumpKeys !== 'format,remoteArtifact,sha256,sizeBytes'
    || databaseReplacement.dump.format !== 'postgresql-custom'
    || !/^[0-9a-f]{64}$/.test(databaseReplacement.dump.sha256 ?? '')
    || databaseReplacement.dump.remoteArtifact !== `${sha}/${databaseReplacement.dump.sha256}/workspace-postgresql.dump`
    || !Number.isSafeInteger(databaseReplacement.dump.sizeBytes) || databaseReplacement.dump.sizeBytes < 1
    || databaseKeys !== 'migrationCount,migrationSetSha256'
    || !Number.isSafeInteger(databaseReplacement.database.migrationCount) || databaseReplacement.database.migrationCount < 1
    || !/^[0-9a-f]{64}$/.test(databaseReplacement.database.migrationSetSha256 ?? '')
    || !Number.isFinite(Date.parse(databaseReplacement.preparedAt ?? ''))) {
    throw new Error('database replacement metadata is invalid');
  }
}
if (genesis) {
  if (metadata.deployment?.target?.kind !== 'monolith'
    || Object.keys(genesis).sort().join(',') !== 'baselineChecksum,baselineMigration,fromSourceSha,legacyMigrationCount,legacyMigrationSetSha256'
    || !/^[0-9a-f]{40}$/.test(genesis.fromSourceSha ?? '')
    || genesis.fromSourceSha === sha
    || !Number.isSafeInteger(genesis.legacyMigrationCount)
    || genesis.legacyMigrationCount < 1
    || !/^[0-9a-f]{64}$/.test(genesis.legacyMigrationSetSha256 ?? '')
    || genesis.baselineMigration !== '00000000000000_sanitized_baseline'
    || !/^[0-9a-f]{64}$/.test(genesis.baselineChecksum ?? '')) {
    throw new Error('deployment genesis metadata is invalid');
  }
}
const values = [
  repository,
  branch,
  injectionSha,
  bootstrap?.baselineSha ?? '',
  bootstrap?.legacy?.cnbCommitSha ?? '',
  bootstrap?.legacy?.releaseId ?? '',
  bootstrap?.legacy?.cnbBuildSn ?? '',
  bootstrap?.legacy?.runtimeVersion ?? '',
  bootstrap?.legacy?.buildId ?? '',
  bootstrap?.legacy?.cnbRepository ?? '',
  String(bootstrap?.database?.migrationCount ?? ''),
  bootstrap?.database?.migrationSetSha256 ?? '',
  genesis?.fromSourceSha ?? '',
  String(genesis?.legacyMigrationCount ?? ''),
  genesis?.legacyMigrationSetSha256 ?? '',
  genesis?.baselineMigration ?? '',
  genesis?.baselineChecksum ?? '',
  databaseReplacement?.dump?.sha256 ?? '',
  String(databaseReplacement?.dump?.sizeBytes ?? ''),
  databaseReplacement?.dump?.remoteArtifact ?? '',
  String(databaseReplacement?.database?.migrationCount ?? ''),
  databaseReplacement?.database?.migrationSetSha256 ?? '',
  databaseReplacement?.preparedAt ?? '',
  transport,
  receiptRecovery?.baseSha ?? '',
  receiptRecovery?.sourceSha ?? '',
  receiptRecovery?.treeSha ?? '',
  receiptRecovery?.migrationSetSha256 ?? '',
];
process.stdout.write(values.join('\n'));
NODE
)"
  RELEASE_CNB_REPOSITORY="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
  RELEASE_CNB_BRANCH="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
  RELEASE_CNB_INJECTION_SHA="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
  RELEASE_BOOTSTRAP_BASE="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
  if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
    RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
    RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID="$(printf '%s\n' "$metadata_values" | sed -n '6p')"
    RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN="$(printf '%s\n' "$metadata_values" | sed -n '7p')"
    RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION="$(printf '%s\n' "$metadata_values" | sed -n '8p')"
    RELEASE_BOOTSTRAP_LEGACY_BUILD_ID="$(printf '%s\n' "$metadata_values" | sed -n '9p')"
    RELEASE_BOOTSTRAP_CNB_REPOSITORY="$(printf '%s\n' "$metadata_values" | sed -n '10p')"
    RELEASE_BOOTSTRAP_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '11p')"
    RELEASE_BOOTSTRAP_MIGRATION_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '12p')"
    if [ "$RELEASE_BOOTSTRAP_CNB_REPOSITORY" != "$EXPECTED_CNB_REPOSITORY" ]; then
      echo "[错误] production bootstrap CNB repository 与 canonical repository 不一致"
      exit 1
    fi
  fi
  RELEASE_GENESIS_FROM_SOURCE="$(printf '%s\n' "$metadata_values" | sed -n '13p')"
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    RELEASE_GENESIS_LEGACY_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '14p')"
    RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '15p')"
    RELEASE_GENESIS_BASELINE_MIGRATION="$(printf '%s\n' "$metadata_values" | sed -n '16p')"
    RELEASE_GENESIS_BASELINE_CHECKSUM="$(printf '%s\n' "$metadata_values" | sed -n '17p')"
  fi
  RELEASE_DATABASE_REPLACEMENT_DUMP_SHA="$(printf '%s\n' "$metadata_values" | sed -n '18p')"
  if [ -n "$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA" ]; then
    RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE="$(printf '%s\n' "$metadata_values" | sed -n '19p')"
    RELEASE_DATABASE_REPLACEMENT_REMOTE_ARTIFACT="$(printf '%s\n' "$metadata_values" | sed -n '20p')"
    RELEASE_DATABASE_REPLACEMENT_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '21p')"
    RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET="$(printf '%s\n' "$metadata_values" | sed -n '22p')"
    RELEASE_DATABASE_REPLACEMENT_PREPARED_AT="$(printf '%s\n' "$metadata_values" | sed -n '23p')"
  fi
  RELEASE_TRANSPORT="$(printf '%s\n' "$metadata_values" | sed -n '24p')"
  RELEASE_RECEIPT_RECOVERY_BASE="$(printf '%s\n' "$metadata_values" | sed -n '25p')"
  if [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    RELEASE_RECEIPT_RECOVERY_SOURCE="$(printf '%s\n' "$metadata_values" | sed -n '26p')"
    RELEASE_RECEIPT_RECOVERY_TREE="$(printf '%s\n' "$metadata_values" | sed -n '27p')"
    RELEASE_RECEIPT_RECOVERY_MIGRATION_SET="$(printf '%s\n' "$metadata_values" | sed -n '28p')"
  fi
  echo "==> 已验证 ${RELEASE_TRANSPORT} source: ${RELEASE_SOURCE_SHA:0:12} via ${RELEASE_CNB_INJECTION_SHA:0:12}"
}

run_local_checks() {
  echo "==> 安装 CI 依赖..."
  npm ci --no-audit --fund=false --loglevel=error

  echo "==> 运行静态检查..."
  npm run deploy:preflight:ci
  npm run docs:check
}

build_artifact() {
  ARTIFACT_PATH="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
  ARTIFACT_MANIFEST_PATH="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
  echo "==> 校验 CNB 本次构建的 standalone 与 manifest..."
  test -s "$ARTIFACT_MANIFEST_PATH"
  test -s "$ARTIFACT_PATH"
  ARTIFACT_SHA="$(node - "$ARTIFACT_MANIFEST_PATH" "$ARTIFACT_PATH" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [manifestPath, artifactPath, sourceSha, sourceTree] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const artifactSha = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
if (manifest.schemaVersion !== 1
  || manifest.source?.commitSha !== sourceSha
  || manifest.source?.treeSha !== sourceTree
  || manifest.build?.buildId !== sourceSha
  || manifest.artifact?.sha256 !== artifactSha) {
  throw new Error('CNB standalone identity or digest is invalid');
}
process.stdout.write(artifactSha);
NODE
)"
  RELEASE_MIGRATION_SET_SHA="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); const value=m.inputs?.migrationSetSha256; if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error("standalone migration-set digest is invalid"); process.stdout.write(value);' "$ARTIFACT_MANIFEST_PATH")"
  if [ -n "$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA" ]; then
    [ "$RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET" = "$RELEASE_MIGRATION_SET_SHA" ] || {
      echo "[错误] 数据库替换 receipt 的 migration set 与 CNB artifact 不一致"
      exit 1
    }
  fi
  ARTIFACT_MANIFEST_SHA="$(node -e 'const {createHash}=require("crypto"); const {readFileSync}=require("fs"); process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$ARTIFACT_MANIFEST_PATH")"
}

prepare_remote_runtime() {
  echo "==> 准备服务器运行态配置..."
  ssh_cmd "
    set -e
    mkdir -p '$REMOTE_DIR'
    mkdir -p '$REMOTE_DIR/releases'
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR'
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- test -r '$REMOTE_CONTROL_ENV_FILE'
      sudo -n -- test -r '$REMOTE_RUNTIME_ENV_FILE'
    else
      if [ ! -f '$REMOTE_CONTROL_ENV_FILE' ]; then
        if [ -f '$REMOTE_DIR/.env' ]; then
          cp '$REMOTE_DIR/.env' '$REMOTE_CONTROL_ENV_FILE'
        elif [ -n '$ENV_CONTENT_B64' ]; then
          printf '%s' '$ENV_CONTENT_B64' | base64 -d > '$REMOTE_CONTROL_ENV_FILE'
        else
          echo '[错误] 服务器缺少运行态 .env，且未提供 ENV_CONTENT'
          exit 1
        fi
      fi
    fi
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/data'
    mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/data/dev.db' ] && [ -d '$REMOTE_DIR/data' ]; then
      rsync -a '$REMOTE_DIR/data/' '$REMOTE_WORKSPACE_CONFIG_DIR/data/'
    fi

    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'legacy' ]; then
    python3 - <<'PY'
from pathlib import Path
import re

env_path = Path('$REMOTE_CONTROL_ENV_FILE')
text = env_path.read_text()
replacements = {
    'WORKSPACE_CONFIG_DIR': '$REMOTE_WORKSPACE_CONFIG_DIR',
    'LIBRARY_SOURCE_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals',
    'LIBRARY_ROOT': '$REMOTE_WORKSPACE_CONFIG_DIR/library',
}
obsolete_agent_keys = {
    'AGENT_MODEL_PROVIDER',
    'KIMI_API_KEY',
    'KIMI_BASE_URL',
    'KIMI_MODEL',
    'KIMI_MAX_TOKENS',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
    'AGENT_SOURCE_WORKTREE',
    'AGENT_SOURCE_CACHE_DIR',
    'AGENT_SOURCE_REPO_URL',
    'AGENT_SOURCE_BRANCH',
    'CNB_PR_TOKEN',
    'CNB_PR_REPO',
    'CNB_PR_BRANCH_PREFIX',
    'CNB_PR_GIT_AUTHOR_NAME',
    'CNB_PR_GIT_AUTHOR_EMAIL',
}
retired_agent_lines = [
    line for line in text.splitlines()
    if any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
]
if retired_agent_lines:
    retired_dir = env_path.parent / 'retired'
    retired_dir.mkdir(mode=0o700, exist_ok=True)
    retired_path = retired_dir / 'agent-provider.env'
    if not retired_path.exists():
        retired_path.write_text('\n'.join(retired_agent_lines) + '\n')
        retired_path.chmod(0o600)
text = '\n'.join(
    line for line in text.splitlines()
    if not any(re.match(rf'^\s*{re.escape(key)}\s*=', line) for key in obsolete_agent_keys)
) + '\n'
for key, value in replacements.items():
    line = f'{key}={value}'
    if re.search(rf'^{key}=.*$', text, flags=re.M):
        text = re.sub(rf'^{key}=.*$', line, text, flags=re.M)
    else:
        text = text.rstrip() + '\\n' + line + '\\n'
env_path.write_text(text)
PY
    fi
  "
}

sync_remote_library_source() {
  if [ -z "$LIBRARY_SYNC_SOURCE" ]; then
    echo "==> 未配置 LIBRARY_SYNC_SOURCE；沿用服务器持久化资料库"
    return
  fi
  if [ ! -d "$LIBRARY_SYNC_SOURCE" ]; then
    echo "[错误] LIBRARY_SYNC_SOURCE 不是可读目录: $LIBRARY_SYNC_SOURCE"
    exit 1
  fi
  echo "==> 同步资料库源文件到服务器只读导入目录..."
  ssh_cmd "mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/library/originals'"
  rsync -az --checksum --exclude='.versions/' \
    -e "$RSYNC_SSH_COMMAND" \
    "$LIBRARY_SYNC_SOURCE/" "$SERVER:$REMOTE_WORKSPACE_CONFIG_DIR/library/originals/"
}

ensure_remote_library_runtime_deps() {
  if [ "$INSTALL_LIBRARY_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过服务器 OCR/PDF 依赖安装（INSTALL_LIBRARY_RUNTIME_DEPS=${INSTALL_LIBRARY_RUNTIME_DEPS}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/library-worker"
  echo "==> 同步并安装服务器 OCR/PDF 依赖..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-library-runtime-deps.sh \
    ops/install-library-embedding-model.sh \
    ops/library-worker-requirements.txt \
    ops/library-runtime-smoke.py \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-library-runtime-deps.sh' '$remote_tool_dir/install-library-embedding-model.sh' '$remote_tool_dir/library-runtime-smoke.py'
    runtime_digest=\$(sha256sum \
      '$remote_tool_dir/install-library-runtime-deps.sh' \
      '$remote_tool_dir/install-library-embedding-model.sh' \
      '$remote_tool_dir/library-worker-requirements.txt' \
      '$remote_tool_dir/library-runtime-smoke.py' | sha256sum | awk '{print \$1}')
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && '$remote_tool_dir/install-library-runtime-deps.sh' --server --quick-check \
      && '$remote_tool_dir/install-library-embedding-model.sh' --quick-check; then
      echo '==> Library/Qwen 运行时 source/version 未变化，跳过网络安装和模型加载'
    else
      '$remote_tool_dir/install-library-runtime-deps.sh' --server
      '$remote_tool_dir/install-library-embedding-model.sh'
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

ensure_remote_kimi_agent_runtime() {
  if [ "$INSTALL_KIMI_AGENT_RUNTIME_DEPS" != "1" ]; then
    echo "==> 跳过 Kimi Agent SDK 运行时安装（INSTALL_KIMI_AGENT_RUNTIME_DEPS=${INSTALL_KIMI_AGENT_RUNTIME_DEPS}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap"
  echo "==> 同步并校验 Kimi Agent SDK 隔离运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-kimi-agent-runtime.sh \
    ops/kimi-agent-sandbox-runner.sh \
    "$SERVER:$remote_tool_dir/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-kimi-agent-runtime.sh' '$remote_tool_dir/kimi-agent-sandbox-runner.sh'
    runtime_digest=\$(sha256sum \
      '$remote_tool_dir/install-kimi-agent-runtime.sh' \
      '$remote_tool_dir/kimi-agent-sandbox-runner.sh' | sha256sum | awk '{print \$1}')
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check; then
      echo '==> Kimi Agent 隔离运行时 source/version 未变化，跳过网络安装'
    else
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh'
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$remote_tool_dir/install-kimi-agent-runtime.sh' --check
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

ensure_remote_onlyoffice_runtime() {
  if [ "$INSTALL_ONLYOFFICE_RUNTIME" != "1" ]; then
    echo "==> 跳过 ONLYOFFICE 运行时安装（INSTALL_ONLYOFFICE_RUNTIME=${INSTALL_ONLYOFFICE_RUNTIME}）"
    return
  fi

  local remote_tool_dir="$REMOTE_WORKSPACE_CONFIG_DIR/runtime/onlyoffice-bootstrap"
  echo "==> 同步并校验 ONLYOFFICE 只读预览运行时..."
  ssh_cmd "mkdir -p '$remote_tool_dir/onlyoffice'"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/install-onlyoffice-runtime.sh \
    "$SERVER:$remote_tool_dir/"
  rsync -az -e "$RSYNC_SSH_COMMAND" \
    ops/onlyoffice/docker-compose.yml \
    "$SERVER:$remote_tool_dir/onlyoffice/"
  ssh_cmd "
    set -e
    chmod +x '$remote_tool_dir/install-onlyoffice-runtime.sh'
    load_runtime_environment
    calculate_runtime_digest() {
      {
        sha256sum \
          '$remote_tool_dir/install-onlyoffice-runtime.sh' \
          '$remote_tool_dir/onlyoffice/docker-compose.yml'
        printf 'ONLYOFFICE_IMAGE=%s\\n' \"\${ONLYOFFICE_IMAGE:-onlyoffice/documentserver:9.4.0}\"
        printf 'ONLYOFFICE_PORT=%s\\n' \"\${ONLYOFFICE_PORT:-8082}\"
        printf 'ONLYOFFICE_NGINX_SITE=%s\\n' \"\${ONLYOFFICE_NGINX_SITE:-auto}\"
        printf '%s' \"\${ONLYOFFICE_JWT_SECRET:-missing}\" | sha256sum
      } | sha256sum | awk '{print \$1}'
    }
    runtime_digest=\$(calculate_runtime_digest)
    runtime_marker='$remote_tool_dir/.installed-source.sha256'
    if [ -f \"\$runtime_marker\" ] \
      && [ \"\$(cat \"\$runtime_marker\")\" = \"\$runtime_digest\" ] \
      && WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh' --check; then
      echo '==> ONLYOFFICE source/version 未变化且健康，跳过 compose reconcile'
    else
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh'
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$remote_tool_dir/install-onlyoffice-runtime.sh' --check
      load_runtime_environment
      runtime_digest=\$(calculate_runtime_digest)
      printf '%s\\n' \"\$runtime_digest\" > \"\$runtime_marker.tmp\"
      chmod 600 \"\$runtime_marker.tmp\"
      mv \"\$runtime_marker.tmp\" \"\$runtime_marker\"
    fi
  "
}

validate_remote_runtime() {
  echo "==> 校验服务器运行态配置..."
  ssh_cmd "
    set -e
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- test -r '$REMOTE_CONTROL_ENV_FILE'
      sudo -n -- test -r '$REMOTE_RUNTIME_ENV_FILE'
    else
      test -r '$REMOTE_CONTROL_ENV_FILE'
    fi
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/product_stage_tests.json'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/full'
    test -d '$REMOTE_WORKSPACE_CONFIG_DIR/config/pharma-qc/records'
    load_control_environment
    test -n \"\${WORKSPACE_CONFIG_DIR:-}\"
    test -n \"\${DATABASE_URL:-}\"
    test -n \"\${DIRECT_URL:-}\"
    test -n \"\${LIBRARY_SOURCE_ROOT:-}\"
    test -n \"\${LIBRARY_ROOT:-}\"
    if [ '$INSTALL_ONLYOFFICE_RUNTIME' = '1' ]; then
      test -n \"\${ONLYOFFICE_JWT_SECRET:-}\"
      printf '%s' \"\${WORKSPACE_PUBLIC_ORIGIN:-}\" | grep -Eq '^https?://[^[:space:]]+'
    fi
    WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' '$REMOTE_WORKSPACE_CONFIG_DIR/runtime/kimi-agent-bootstrap/install-kimi-agent-runtime.sh' --check
    if [ '$INSTALL_ONLYOFFICE_RUNTIME' = '1' ]; then
      WORKSPACE_CONFIG_DIR='$REMOTE_WORKSPACE_CONFIG_DIR' WORKSPACE_PUBLIC_ORIGIN_HINT='$WORKSPACE_PUBLIC_ORIGIN_HINT' '$REMOTE_WORKSPACE_CONFIG_DIR/runtime/onlyoffice-bootstrap/install-onlyoffice-runtime.sh' --check
    fi
    python3 - <<'PY'
from pathlib import Path
import os
import sys

env = dict(os.environ)
obsolete_agent_keys = {
    'AGENT_MODEL_PROVIDER', 'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL', 'KIMI_MAX_TOKENS',
    'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'AGENT_SOURCE_WORKTREE',
    'AGENT_SOURCE_CACHE_DIR', 'AGENT_SOURCE_REPO_URL', 'AGENT_SOURCE_BRANCH', 'CNB_PR_TOKEN',
    'CNB_PR_REPO', 'CNB_PR_BRANCH_PREFIX', 'CNB_PR_GIT_AUTHOR_NAME', 'CNB_PR_GIT_AUTHOR_EMAIL',
}
present_obsolete = sorted(key for key in obsolete_agent_keys if key in env)
if present_obsolete:
    sys.exit('server environment still contains retired Agent provider/source/PR configuration')

workspace = env.get('WORKSPACE_CONFIG_DIR', '')
database = env.get('DATABASE_URL', '')
direct_database = env.get('DIRECT_URL', '')
library_source_root = env.get('LIBRARY_SOURCE_ROOT', '')
library_root = env.get('LIBRARY_ROOT', '')
cutover_source = env.get('SQLITE_CUTOVER_SOURCE', '')
rollback_env_value = env.get('SQLITE_CUTOVER_ROLLBACK_ENV', '')
if not workspace:
    sys.exit('WORKSPACE_CONFIG_DIR missing from remote .env')
if not os.path.isabs(workspace):
    sys.exit(f'WORKSPACE_CONFIG_DIR must be absolute: {workspace}')
from urllib.parse import unquote, urlparse
database_url = urlparse(database)
direct_url = urlparse(direct_database)
if database_url.scheme not in {'postgres', 'postgresql'}:
    sys.exit('DATABASE_URL must use PostgreSQL')
if direct_url.scheme not in {'postgres', 'postgresql'}:
    sys.exit('DIRECT_URL must use PostgreSQL')
if not database_url.hostname or not database_url.path or database_url.path == '/':
    sys.exit('DATABASE_URL must include host and database name')
if not direct_url.hostname or not direct_url.path or direct_url.path == '/':
    sys.exit('DIRECT_URL must include host and database name')
database_endpoint = (database_url.hostname, database_url.port or 5432, database_url.path)
direct_endpoint = (direct_url.hostname, direct_url.port or 5432, direct_url.path)
if database_endpoint != direct_endpoint:
    sys.exit('DATABASE_URL and DIRECT_URL must select the same PostgreSQL host, port, and database')
if cutover_source:
    if '$WORKSPACE_RUNTIME_PM2_MODE' == 'hardened':
        sys.exit('SQLite cutover is incompatible with hardened runtime/control-plane credential isolation')
    active_env_path = Path('$REMOTE_CONTROL_ENV_FILE').resolve()
    rollback_env_path = Path(rollback_env_value)
    if not rollback_env_path.is_absolute():
        sys.exit('SQLITE_CUTOVER_ROLLBACK_ENV must be absolute')
    if not rollback_env_path.is_file():
        sys.exit(f'SQLITE_CUTOVER_ROLLBACK_ENV is not a readable file: {rollback_env_path}')
    if rollback_env_path.resolve() == active_env_path:
        sys.exit('SQLITE_CUTOVER_ROLLBACK_ENV must not point at the active PostgreSQL .env')
    rollback_env = {}
    for line in rollback_env_path.read_text().splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        rollback_env[key] = value.strip().strip('\"').strip(\"'\")
    for required_key in ('DATABASE_URL', 'NEXTAUTH_SECRET', 'WORKSPACE_CONFIG_DIR'):
        if not rollback_env.get(required_key):
            sys.exit(f'{required_key} missing from SQLITE_CUTOVER_ROLLBACK_ENV')
    rollback_database_url = urlparse(rollback_env['DATABASE_URL'])
    rollback_database_path = Path(unquote(rollback_database_url.path))
    if rollback_database_url.scheme != 'file' or not rollback_database_path.is_absolute():
        sys.exit('rollback DATABASE_URL must be file:<absolute-sqlite-path>')
    if not rollback_database_path.is_file():
        sys.exit(f'rollback SQLite database does not exist: {rollback_database_path}')
    if rollback_env['WORKSPACE_CONFIG_DIR'] != workspace:
        sys.exit('rollback WORKSPACE_CONFIG_DIR must match the active runtime directory')
if not os.path.isabs(library_root):
    sys.exit(f'LIBRARY_ROOT must be absolute: {library_root}')
if not library_root.startswith(os.path.join(workspace, 'library') + os.sep) and library_root != os.path.join(workspace, 'library'):
    sys.exit(f'LIBRARY_ROOT must live under WORKSPACE_CONFIG_DIR/library: {library_root}')
if not os.path.isabs(library_source_root):
    sys.exit(f'LIBRARY_SOURCE_ROOT must be absolute: {library_source_root}')
expected_library_source = os.path.join(workspace, 'library', 'originals')
if library_source_root != expected_library_source:
    sys.exit(f'LIBRARY_SOURCE_ROOT must equal WORKSPACE_CONFIG_DIR/library/originals: {library_source_root}')
print('Remote runtime env check passed.')
PY
    if [ -n \"\${SQLITE_CUTOVER_SOURCE:-}\" ]; then
      case \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$SQLITE_CUTOVER_ROLLBACK_ENV\"
    fi
    command -v psql >/dev/null
    command -v pg_dump >/dev/null
    command -v pg_restore >/dev/null
    pg_isready --dbname="\$DIRECT_URL" >/dev/null
    psql "\$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null
    psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null
    direct_identity=\$(psql "\$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\")
    runtime_identity=\$(psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \"SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local') || '|' || inet_server_port()::text\")
    if [ "\$direct_identity" != "\$runtime_identity" ]; then
      echo '[错误] DATABASE_URL 与 DIRECT_URL 连接到不同的 PostgreSQL 实例'
      exit 1
    fi
  "
}

backup_remote_postgresql() {
  echo "==> 创建并验证 PostgreSQL 逻辑备份..."
  ssh_cmd "
    set -e
    umask 077
    mkdir -p '$REMOTE_BACKUP_DIR'
    load_control_environment
    stamp=\$(date +%Y%m%d%H%M%S)
    backup='$REMOTE_BACKUP_DIR/workspace-postgresql-'\$stamp'.dump'
    backup_database_url=\"\${WORKSPACE_BACKUP_DATABASE_URL:-\$DIRECT_URL}\"
    pg_dump --format=custom --no-owner --no-privileges --file=\"\$backup\" \"\$backup_database_url\"
    pg_restore --list \"\$backup\" >/dev/null
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum \"\$backup\" > \"\$backup.sha256\"
    else
      shasum -a 256 \"\$backup\" > \"\$backup.sha256\"
    fi
    test -s \"\$backup\"
    test -s \"\$backup.sha256\"
    ls -lh \"\$backup\"
  "
}

backup_remote_runtime() {
  echo "==> 创建服务器运行态增量快照..."
  ssh_cmd "
    set -e
    command -v rsync >/dev/null
    workspace_privileged mkdir -p '$REMOTE_RUNTIME_SNAPSHOT_DIR'
    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR' ]; then
      stamp=\$(date +%Y%m%d%H%M%S)
      snapshot='$REMOTE_RUNTIME_SNAPSHOT_DIR/'\$stamp
      snapshot_tmp='$REMOTE_RUNTIME_SNAPSHOT_DIR/.'\$stamp'.tmp'
      previous=\$(workspace_privileged find '$REMOTE_RUNTIME_SNAPSHOT_DIR' -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%f\\n' | sort | tail -n 1)
      workspace_privileged rm -rf \"\$snapshot_tmp\"
      workspace_privileged mkdir -p \"\$snapshot_tmp\"
      trap 'workspace_privileged rm -rf \"\$snapshot_tmp\"' EXIT
      if [ -n \"\$previous\" ]; then
        workspace_privileged rsync -a --delete --link-dest=\"$REMOTE_RUNTIME_SNAPSHOT_DIR/\$previous\" '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      else
        workspace_privileged rsync -a --delete '$REMOTE_WORKSPACE_CONFIG_DIR/' \"\$snapshot_tmp/\"
      fi
      workspace_privileged mv \"\$snapshot_tmp\" \"\$snapshot\"
      trap - EXIT
      workspace_privileged du -sh \"\$snapshot\"
    else
      echo '[警告] 运行态目录不存在，跳过备份: $REMOTE_WORKSPACE_CONFIG_DIR'
    fi
  "
}

cleanup_remote_backups() {
  echo "==> 清理服务器备份（每类保留 ${BACKUP_RETENTION_DAYS} 天，最多 ${BACKUP_RETENTION_COUNT} 份）..."
  ssh_cmd "
    set -e
    workspace_privileged mkdir -p '$REMOTE_BACKUP_DIR'
    if [ ! -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy' ]; then
      workspace_privileged rm -rf '$REMOTE_BACKUP_DIR/maintenance-pinned'
    fi
    workspace_privileged python3 - <<'PY'
from pathlib import Path
import shutil
import time

backup_dir = Path('$REMOTE_BACKUP_DIR')
runtime_snapshot_dir = backup_dir / 'workspace-runtime-snapshots'
retention_days = int('$BACKUP_RETENTION_DAYS')
retention_count = int('$BACKUP_RETENTION_COUNT')
now = time.time()
cutoff = now - retention_days * 86400
if runtime_snapshot_dir.is_dir():
    snapshots = sorted(
        (path for path in runtime_snapshot_dir.iterdir() if path.is_dir() and path.name.startswith('20')),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for index, path in enumerate(snapshots):
        too_many = index >= retention_count
        too_old = retention_days > 0 and path.stat().st_mtime < cutoff
        if too_many or too_old:
            shutil.rmtree(path)
    for path in runtime_snapshot_dir.glob('.*.tmp'):
        shutil.rmtree(path, ignore_errors=True)
    remaining_snapshots = [path for path in runtime_snapshot_dir.iterdir() if path.is_dir() and path.name.startswith('20')]
    print(f'runtime snapshots kept: {len(remaining_snapshots)}')
    if remaining_snapshots:
        for path in backup_dir.glob('workspace-runtime-*.tgz'):
            path.unlink()
        print('legacy runtime tarballs removed')

for pattern in ('workspace-postgresql-*.dump',):
    files = sorted(backup_dir.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    for index, path in enumerate(files):
        too_many = index >= retention_count
        too_old = retention_days > 0 and path.stat().st_mtime < cutoff
        if too_many or too_old:
            checksum = Path(str(path) + '.sha256')
            path.unlink()
            if checksum.exists():
                checksum.unlink()
    print(f'{pattern} backups kept: {len(list(backup_dir.glob(pattern)))}')
PY
  "
}

deploy_remote_artifact() {
  local release_id
  local remote_tar
  local remote_manifest
  local remote_timing_output
  release_id="$(date +%Y%m%d%H%M%S)-${RELEASE_SOURCE_SHA:0:8}"
  remote_tar="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.tgz"
  remote_manifest="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-workspace-standalone-$release_id.manifest.json"
  remote_timing_output="$REMOTE_WORKSPACE_CONFIG_DIR/release-timing/$release_id.ndjson"
  echo "==> 上传 CNB 构建产物到服务器..."
  rsync -av -e "$RSYNC_SSH_COMMAND" \
    "$ARTIFACT_PATH" "$SERVER:$remote_tar"
  rsync -av -e "$RSYNC_SSH_COMMAND" \
    "$ARTIFACT_MANIFEST_PATH" "$SERVER:$remote_manifest"
  echo "==> cutover 前再次确认 release metadata 与部署顺序..."
  verify_release_order

  echo "==> 服务器复验产物与 manifest 后解包并重启服务..."
  ssh_cmd "
    set -e
    if command -v sha256sum >/dev/null 2>&1; then
      remote_artifact_sha=\$(sha256sum '$remote_tar' | awk '{print \$1}')
      remote_manifest_sha=\$(sha256sum '$remote_manifest' | awk '{print \$1}')
    else
      remote_artifact_sha=\$(shasum -a 256 '$remote_tar' | awk '{print \$1}')
      remote_manifest_sha=\$(shasum -a 256 '$remote_manifest' | awk '{print \$1}')
    fi
    if [ \"\$remote_artifact_sha\" != '$ARTIFACT_SHA' ]; then
      echo '[错误] 服务器收到的 standalone 产物 SHA-256 不匹配'
      exit 1
    fi
    if [ \"\$remote_manifest_sha\" != '$ARTIFACT_MANIFEST_SHA' ]; then
      echo '[错误] 服务器收到的 standalone manifest SHA-256 不匹配'
      exit 1
    fi
    node - '$remote_manifest' '$RELEASE_SOURCE_SHA' '$RELEASE_SOURCE_TREE' '$ARTIFACT_SHA' <<'NODE'
const fs = require('fs');
const [manifestPath, sourceSha, sourceTree, artifactSha] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1
  || manifest.source?.commitSha !== sourceSha
  || manifest.source?.treeSha !== sourceTree
  || manifest.build?.buildId !== sourceSha
  || manifest.artifact?.sha256 !== artifactSha) {
  throw new Error('standalone manifest identity does not match trusted release values');
}
NODE
    mkdir -p '$REMOTE_DIR/releases'
    old_release=\$(readlink -f '$REMOTE_DIR/current' 2>/dev/null || true)
    find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 ! -name current ! -name releases ! -name .workspace ! -name .workspace.backups -exec rm -rf {} +
    release_dir='$REMOTE_DIR/releases/$release_id'
    rm -rf \"\$release_dir\"
    mkdir -p \"\$release_dir\"
    tar -xzf '$remote_tar' -C \"\$release_dir\"
    cp '$remote_manifest' \"\$release_dir/.release-manifest.json\"
    rm -f '$remote_tar' '$remote_manifest'

    server_entry=\$(cat \"\$release_dir/.server-entry\" 2>/dev/null || printf 'server.js')
    app_dir=\$(dirname \"\$release_dir/\$server_entry\")
    test -f \"\$release_dir/\$server_entry\"

    ln -sfn \"\$(realpath --relative-to=\"\$release_dir\" '$REMOTE_RUNTIME_ENV_FILE')\" \"\$release_dir/.env\"
    ln -sfn \"\$(realpath --relative-to=\"\$app_dir\" '$REMOTE_RUNTIME_ENV_FILE')\" \"\$app_dir/.env\"
    rm -rf \"\$release_dir/data\" \"\$app_dir/data\"

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company' ]; then
      rm -rf \"\$app_dir/public/company\"
      mkdir -p \"\$app_dir/public\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company')\" \"\$app_dir/public/company\"
    fi

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar' ]; then
      mkdir -p \"\$app_dir/public/assets/agent\"
      rm -rf \"\$app_dir/public/assets/agent/avatar\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public/assets/agent\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar')\" \"\$app_dir/public/assets/agent/avatar\"
    fi

    if [ -d '$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar' ]; then
      mkdir -p \"\$app_dir/public/assets/user\"
      rm -rf \"\$app_dir/public/assets/user/avatar\"
      ln -sfn \"\$(realpath --relative-to=\"\$app_dir/public/assets/user\" '$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar')\" \"\$app_dir/public/assets/user/avatar\"
    fi

    test \"\$(readlink -f \"\$release_dir/.env\")\" = \"\$(readlink -f '$REMOTE_RUNTIME_ENV_FILE')\"
    if [ '$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' ]; then
      sudo -n -- grep -q '^WORKSPACE_CONFIG_DIR=' \"\$release_dir/.env\"
      sudo -n -- grep -q '^DATABASE_URL=' \"\$release_dir/.env\"
      if sudo -n -- grep -Eq '^[[:space:]]*(DIRECT_URL|SHADOW_DATABASE_URL)=' \"\$release_dir/.env\"; then
        echo '[错误] release runtime .env 包含 control-plane 数据库凭据'
        exit 1
      fi
    else
      grep -q '^WORKSPACE_CONFIG_DIR=' \"\$release_dir/.env\"
      grep -q '^DATABASE_URL=' \"\$release_dir/.env\"
      grep -q '^DIRECT_URL=' \"\$release_dir/.env\"
    fi
    test -f \"\$release_dir/prisma/schema.prisma\"
    test -f \"\$release_dir/prisma/migrations/migration_lock.toml\"
    test -f \"\$release_dir/scripts/check/check-prisma-deploy-status.js\"
    test -f \"\$release_dir/scripts/ci/check-migration-policy.mjs\"
    test -f \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\"
    test -f \"\$release_dir/node_modules/prisma/build/index.js\"
    test -f \"\$release_dir/resource-defs.json\"
    test -f \"\$release_dir/seed-resources-runtime.mjs\"
    test -f \"\$release_dir/scripts/provision-agent-workforce.mjs\"
    test -f \"\$release_dir/scripts/lib/agent-workforce-specs.mjs\"
    test -f \"\$release_dir/scripts/check/check-permission-action-grants.mjs\"
    test -f \"\$release_dir/ops/prisma-genesis-cutover.mjs\"
    test -x \"\$release_dir/ops/replace-production-database.sh\"
    test -f \"\$release_dir/.release-manifest.json\"

    cd \"\$release_dir\"
    # Release/app .env is runtime-only. Migration, seed, and provisioning
    # deliberately load the trusted control-plane environment.
    load_control_environment
    export NODE_ENV=production
    cutover_source=\"\${SQLITE_CUTOVER_SOURCE:-}\"
    cutover_rollback_env=\"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\"
    cutover_public_switched=0
    cutover_public_wal_lsn=''
    cutover_candidate_name='$PM2_NAME-candidate'
    current_swap_tmp=''
    public_process_stopped=0
    release_committed=0
    remote_timing_enabled='$REMOTE_RELEASE_TIMING_ENABLED'
    remote_timing_stage=''
    remote_timing_state_file=''
    maintenance_migrations=''
    maintenance_migration_started=0
    maintenance_marker_path='$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    maintenance_marker_source='$RELEASE_SOURCE_SHA'
    maintenance_backup=''
    maintenance_backup_sha=''
    maintenance_marker_present=0
    database_replacement_guard=0
    database_replacement_state='$REMOTE_WORKSPACE_CONFIG_DIR/database-replacement-in-progress.json'
    if [ -f \"\$maintenance_marker_path\" ]; then
      maintenance_marker_present=1
      maintenance_migration_started=1
      public_process_stopped=1
    fi
    if [ \"\$remote_timing_enabled\" = '1' ]; then
      # shellcheck source=/dev/null
      if ! . '$REMOTE_RELEASE_TIMING_SHELL' \
        || ! release_timing_configure '$remote_timing_output' '$RELEASE_SOURCE_SHA' deploy.remote; then
        echo '[警告] deploy.remote 计时初始化失败；部署继续' >&2
        remote_timing_enabled=0
      fi
    fi
    begin_remote_timing_stage() {
      [ \"\$remote_timing_enabled\" = '1' ] || return 0
      remote_timing_stage=\$1
      if ! mkdir -p '$REMOTE_WORKSPACE_CONFIG_DIR/release-timing' \
        || ! chmod 700 '$REMOTE_WORKSPACE_CONFIG_DIR/release-timing'; then
        echo \"[警告] deploy.remote/\$remote_timing_stage 计时目录不可用；部署继续\" >&2
        remote_timing_stage=''
        remote_timing_state_file=''
        return 0
      fi
      if ! remote_timing_state_file=\$(release_timing_begin \"\$remote_timing_stage\"); then
        echo \"[警告] deploy.remote/\$remote_timing_stage 计时开始失败；部署继续\" >&2
        remote_timing_stage=''
        remote_timing_state_file=''
      fi
      return 0
    }
    finish_remote_timing_stage() {
      local timing_status=\$1
      local timing_exit_code=\$2
      [ \"\$remote_timing_enabled\" = '1' ] || return 0
      [ -n \"\$remote_timing_stage\" ] || return 0
      if ! release_timing_finish \"\$remote_timing_state_file\" \"\$timing_status\" \"\$timing_exit_code\"; then
        echo \"[警告] deploy.remote/\$remote_timing_stage 计时结束失败；部署结果不受影响\" >&2
      fi
      remote_timing_stage=''
      remote_timing_state_file=''
      return 0
    }
    finish_active_remote_timing_on_exit() {
      local timing_exit_code=\$1
      local timing_status='failed'
      [ -n \"\$remote_timing_stage\" ] || return 0
      if [ \"\$timing_exit_code\" -eq 0 ]; then
        timing_status='passed'
      elif [ \"\$timing_exit_code\" -gt 128 ] && [ \"\$timing_exit_code\" -le 192 ] \
        && kill -l \"\$((timing_exit_code - 128))\" >/dev/null 2>&1; then
        timing_status='cancelled'
      fi
      finish_remote_timing_stage \"\$timing_status\" \"\$timing_exit_code\" || true
    }
    pm2_pid_or_unavailable() {
      local process_name=\$1
      local process_list
      process_list=\$(pm2 jlist 2>/dev/null) || {
        printf '__unavailable__'
        return
      }
      PROCESS_NAME=\"\$process_name\" PROCESS_LIST=\"\$process_list\" python3 - <<'PY'
import json
import os

try:
    processes = json.loads(os.environ['PROCESS_LIST'])
    if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
        raise ValueError('pm2 jlist did not return a process object list')
    matches = [item for item in processes if item.get('name') == os.environ['PROCESS_NAME']]
    if not matches:
        print('0')
    elif len(matches) != 1:
        print('__unavailable__')
    else:
        item = matches[0]
        pid = item.get('pid') or 0
        status = item.get('pm2_env', {}).get('status')
        if status == 'stopped' and pid == 0:
            print('0')
        elif status == 'online' and isinstance(pid, int) and pid > 0:
            print(pid)
        else:
            print('__unavailable__')
except Exception:
    print('__unavailable__')
PY
    }
    assert_release_version() {
      version_url=\$1
      version_label=\$2
      version_response=\$(curl -fsS \"\$version_url\")
      actual_version=\$(VERSION_RESPONSE=\"\$version_response\" node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || typeof payload.version !== 'string') {
  throw new Error('version endpoint did not return a string version');
}
process.stdout.write(payload.version);
NODE
      )
      if [ \"\$actual_version\" != '$RELEASE_SOURCE_SHA' ]; then
        echo \"[错误] \$version_label 版本 \$actual_version 与 runtime source $RELEASE_SOURCE_SHA 不一致\"
        exit 1
      fi
    }
    verify_remote_deployed_record() {
      verification_phase=\$1
      deployed_record='$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
      if [ -n '$RELEASE_BOOTSTRAP_BASE' ]; then
        if [ -e \"\$deployed_record\" ]; then
          echo \"[错误] \$verification_phase: production bootstrap 期间出现正式部署记录\"
          exit 1
        fi
      else
        test -f \"\$deployed_record\"
        node '$REMOTE_RELEASE_RECEIPT_TOOL' assert \
          --file \"\$deployed_record\" \
          --expected-repository '$RELEASE_CNB_REPOSITORY' \
          --runtime-source '$DEPLOYED_SOURCE_SHA' \
          --cnb-injection '$DEPLOYED_CNB_INJECTION_SHA' \
          --artifact-sha '$DEPLOYED_ARTIFACT_SHA'
      fi
      echo \"==> \$verification_phase: 生产部署记录未被并发修改\"
    }
    ensure_bootstrap_progress_marker() {
      [ -n '$RELEASE_BOOTSTRAP_BASE' ] || return 0
      bootstrap_progress_marker='$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
      test ! -e '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json'
      BOOTSTRAP_PROGRESS_MARKER="\$bootstrap_progress_marker" \
      EXPECTED_BASELINE='$RELEASE_BOOTSTRAP_BASE' \
      EXPECTED_CANDIDATE='$RELEASE_SOURCE_SHA' \
      EXPECTED_TREE='$RELEASE_SOURCE_TREE' \
      EXPECTED_MIGRATION_SET='$RELEASE_MIGRATION_SET_SHA' \
      EXPECTED_LEGACY_RELEASE='$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID' \
      EXPECTED_LEGACY_CNB_COMMIT='$RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT' \
      EXPECTED_LEGACY_CNB_BUILD_SN='$RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN' \
      EXPECTED_LEGACY_RUNTIME_VERSION='$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION' \
      EXPECTED_LEGACY_BUILD_ID='$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID' \
      EXPECTED_LEGACY_CNB_REPOSITORY='$RELEASE_BOOTSTRAP_CNB_REPOSITORY' \
      EXPECTED_BASELINE_COUNT='$RELEASE_BOOTSTRAP_MIGRATION_COUNT' \
      EXPECTED_BASELINE_DIGEST='$RELEASE_BOOTSTRAP_MIGRATION_DIGEST' python3 - <<'PY'
import json
import os
from pathlib import Path

expected = {
    'schemaVersion': 2,
    'phase': 'mutation-started',
    'baselineSha': os.environ['EXPECTED_BASELINE'],
    'candidateSha': os.environ['EXPECTED_CANDIDATE'],
    'candidateTreeSha': os.environ['EXPECTED_TREE'],
    'candidateMigrationSetSha256': os.environ['EXPECTED_MIGRATION_SET'],
    'legacyReleaseId': os.environ['EXPECTED_LEGACY_RELEASE'],
    'legacyCnbCommitSha': os.environ['EXPECTED_LEGACY_CNB_COMMIT'],
    'legacyCnbBuildSn': os.environ['EXPECTED_LEGACY_CNB_BUILD_SN'],
    'legacyRuntimeVersion': os.environ['EXPECTED_LEGACY_RUNTIME_VERSION'],
    'legacyBuildId': os.environ['EXPECTED_LEGACY_BUILD_ID'],
    'legacyCnbRepository': os.environ['EXPECTED_LEGACY_CNB_REPOSITORY'],
    'baselineMigrationCount': int(os.environ['EXPECTED_BASELINE_COUNT']),
    'baselineMigrationSetSha256': os.environ['EXPECTED_BASELINE_DIGEST'],
}
path = Path(os.environ['BOOTSTRAP_PROGRESS_MARKER'])
if path.exists():
    try:
        actual = json.loads(path.read_text(encoding='utf-8'))
    except Exception as error:
        raise SystemExit(f'production bootstrap progress marker is invalid: {error}')
    if actual != expected:
        raise SystemExit('production bootstrap progress marker is not the exact same receipt and candidate')
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f'.{path.name}.tmp-{os.getpid()}'
    temporary.write_text(json.dumps(expected, indent=2) + '\n', encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)
PY
      echo '==> production bootstrap 已在首次 mutation 前原子绑定当前 receipt/candidate'
    }
    atomic_switch_current() {
      current_target=\$1
      current_swap_tmp='$REMOTE_DIR/.current.swap-$RELEASE_SOURCE_SHA'
      rm -f "\$current_swap_tmp"
      ln -s "\$current_target" "\$current_swap_tmp"
      mv -Tf "\$current_swap_tmp" '$REMOTE_DIR/current'
      current_swap_tmp=''
    }
    bind_runtime_env_to_release() {
      local target_release=\$1
      local target_app=\$2
      ln -sfn \"\$(realpath --relative-to=\"\$target_release\" '$REMOTE_RUNTIME_ENV_FILE')\" \"\$target_release/.env\"
      ln -sfn \"\$(realpath --relative-to=\"\$target_app\" '$REMOTE_RUNTIME_ENV_FILE')\" \"\$target_app/.env\"
      test \"\$(readlink -f \"\$target_release/.env\")\" = \"\$(readlink -f '$REMOTE_RUNTIME_ENV_FILE')\"
    }
    reset_gateway_overrides_to_full() {
      gateway_generated_at=\$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')
      gateway_generation_id=\$(node '$REMOTE_GATEWAY_GENERATION_TOOL' create-fallback \
        --graph '$REMOTE_FULL_DEPLOY_GRAPH' \
        --output-root '$REMOTE_GATEWAY_ROOT' \
        --generated-at "\$gateway_generated_at")
      WORKSPACE_GATEWAY_ROOT='$REMOTE_GATEWAY_ROOT' \
        WORKSPACE_GATEWAY_NGINX_SITE='$WORKSPACE_GATEWAY_NGINX_SITE' \
        '$REMOTE_GATEWAY_SWITCH_TOOL' --generation '$REMOTE_GATEWAY_ROOT/generations/'"\$gateway_generation_id"
      node - '$REMOTE_GATEWAY_ROOT/current/route-map.json' <<'NODE'
const fs = require('fs');
const routeMap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(routeMap.activeUnits) || routeMap.activeUnits.length !== 0
  || !Array.isArray(routeMap.routes) || routeMap.routes.length !== 0
  || routeMap.fallback?.unitId !== 'legacy-monolith'
  || routeMap.fallback?.host !== '127.0.0.1'
  || routeMap.fallback?.port !== 3000) {
  throw new Error('Full Gateway generation still contains independent unit overrides');
}
NODE
      echo "==> Full Gateway overrides 已原子清空: \$gateway_generation_id"
    }
    commit_database_replacement_state() {
      [ \"\$database_replacement_guard\" = '1' ] || return 0
      \"\$release_dir/ops/replace-production-database.sh\" commit \
        --state-file \"\$database_replacement_state\"
      replacement_receipt_dir='$REMOTE_WORKSPACE_CONFIG_DIR/database-replacement-receipts'
      mkdir -p \"\$replacement_receipt_dir\"
      chmod 700 \"\$replacement_receipt_dir\"
      cp \"\$database_replacement_state\" \"\$replacement_receipt_dir/$RELEASE_SOURCE_SHA.json.tmp\"
      chmod 600 \"\$replacement_receipt_dir/$RELEASE_SOURCE_SHA.json.tmp\"
      mv \"\$replacement_receipt_dir/$RELEASE_SOURCE_SHA.json.tmp\" \"\$replacement_receipt_dir/$RELEASE_SOURCE_SHA.json\"
      rm -f \"\$database_replacement_state\"
      database_replacement_guard=0
    }
    rollback_cutover() {
      exit_code=\$?
      trap - EXIT
      finish_active_remote_timing_on_exit \"\$exit_code\" || true
      if [ -n "\$current_swap_tmp" ]; then
        rm -f "\$current_swap_tmp"
        current_swap_tmp=''
      fi
      if [ \"\$exit_code\" -ne 0 ] && [ \"\$release_committed\" = '0' ] && [ -f '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json' ]; then
        if node '$REMOTE_RELEASE_RECEIPT_TOOL' assert \
          --file '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json' \
          --expected-repository '$RELEASE_CNB_REPOSITORY' \
          --runtime-source '$RELEASE_SOURCE_SHA' \
          --runtime-tree '$RELEASE_SOURCE_TREE' \
          --cnb-injection '$RELEASE_CNB_INJECTION_SHA' \
          --artifact-sha '$ARTIFACT_SHA' \
          --release-dir \"\$release_dir\" \
          --transport '$RELEASE_TRANSPORT'
        then
          release_committed=1
          commit_database_replacement_state
          echo '==> deployed-release 原子记录已绑定当前 candidate；将其视为 commit point，不执行旧版本回滚'
        fi
      fi
      if [ \"\$exit_code\" -ne 0 ] && [ \"\$release_committed\" = '1' ]; then
        exit "\$exit_code"
      fi
      candidate_cleanup_failed=0
      if [ \"\$exit_code\" -ne 0 ]; then
        pm2 delete "\$cutover_candidate_name" 2>/dev/null || true
        rollback_candidate_pid=\$(pm2_pid_or_unavailable "\$cutover_candidate_name")
        if [ "\$rollback_candidate_pid" != '0' ]; then
          candidate_cleanup_failed=1
          echo '[错误] 未提交 candidate writer 未能确认停止；禁止自动启动或回退任何 writer。'
        else
          pm2 save
        fi
      fi
      if [ \"\$exit_code\" -ne 0 ] && [ "\$candidate_cleanup_failed" = '1' ]; then
        echo '[错误] candidate 无法确认停止；立即隔离 public 与 WeCom，避免双 writer。'
        pm2 delete '$PM2_NAME' 2>/dev/null || true
        pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
        rollback_public_pid=\$(pm2_pid_or_unavailable '$PM2_NAME')
        rollback_wecom_pid=\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')
        pm2 save || echo '[错误] writer 已隔离，但 PM2 状态持久化失败；禁止自动恢复。'
        if [ "\$rollback_public_pid" != '0' ] || [ "\$rollback_wecom_pid" != '0' ]; then
          echo '[错误] candidate 状态不明且其余 writer 也未能全部隔离；保持失败并等待人工处理。'
        else
          echo '[维护] candidate 状态不明；public 与 WeCom 已确认停止，不执行自动回退。'
        fi
      elif [ \"\$exit_code\" -ne 0 ] && [ -n \"\$cutover_source\" ] && [ \"\$cutover_public_switched\" = '0' ]; then
        pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
        pm2 delete '$PM2_NAME' 2>/dev/null || true
        pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
        rollback_candidate_pid=\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")
        rollback_public_pid=\$(pm2_pid_or_unavailable '$PM2_NAME')
        rollback_wecom_pid=\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')
        if [ \"\$rollback_candidate_pid\" != '0' ] || [ \"\$rollback_public_pid\" != '0' ] || [ \"\$rollback_wecom_pid\" != '0' ]; then
          cutover_public_switched=1
          echo '[错误] PostgreSQL candidate/public/WeCom writer 未能全部确认停止；禁止自动回退 SQLite。'
        elif [ -n \"\$cutover_public_wal_lsn\" ]; then
          rollback_final_wal_lsn=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()' 2>/dev/null || printf '__unavailable__')
          if [ \"\$rollback_final_wal_lsn\" != \"\$cutover_public_wal_lsn\" ]; then
            cutover_public_switched=1
            echo '[错误] PostgreSQL 3000 writer 已停止，但最终 WAL 与对外启动前不同；为防止数据丢失，禁止自动回退 SQLite。'
          fi
        fi
        if [ \"\$cutover_public_switched\" = '0' ]; then
          echo '[回滚] PostgreSQL writer 已停止且 WAL 未变化，恢复旧 SQLite env 与旧 release。'
          cp \"\$cutover_rollback_env\" '$REMOTE_CONTROL_ENV_FILE.rollback.tmp'
          chmod 600 '$REMOTE_CONTROL_ENV_FILE.rollback.tmp'
          mv '$REMOTE_CONTROL_ENV_FILE.rollback.tmp' '$REMOTE_CONTROL_ENV_FILE'
          set -a
          . '$REMOTE_CONTROL_ENV_FILE'
          set +a
          old_server_entry=\$(cat \"\$old_release/.server-entry\" 2>/dev/null || printf 'server.js')
          old_app_dir=\$(dirname \"\$old_release/\$old_server_entry\")
          bind_runtime_env_to_release \"\$old_release\" \"\$old_app_dir\"
          pm2 start \"\$old_release/\$old_server_entry\" --name '$PM2_NAME' --cwd \"\$old_app_dir\" --update-env
          rollback_ready=0
          for i in \$(seq 1 20); do
            if curl -fsS '$HEALTHCHECK_URL' >/dev/null; then
              rollback_ready=1
              break
            fi
            sleep 1
          done
          if [ \"\$rollback_ready\" != '1' ]; then
            echo '[错误] 旧 SQLite release 已尝试恢复，但 3000 端口健康检查失败。'
            pm2 logs '$PM2_NAME' --lines 80 --nostream || true
          fi
          if [ -n \"\${WECHAT_BOT_ID:-}\" ] && [ -n \"\${WECHAT_BOT_SECRET:-}\" ] && [ -f \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" ]; then
            pm2 start \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" --name '$PM2_WECOM_BOT_NAME' --cwd \"\$old_release\" --update-env
          fi
          pm2 save
        fi
      elif [ \"\$exit_code\" -ne 0 ] && [ -z \"\$cutover_source\" ] && [ \"\$public_process_stopped\" = '1' ] && [ \"\$release_committed\" = '0' ]; then
        pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
        pm2 delete '$PM2_NAME' 2>/dev/null || true
        pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
        if [ \"\$database_replacement_guard\" = '1' ]; then
          echo '[维护] 整库替换已进入 writer fence；旧生产数据库仍保留，保持 Workspace 与企业微信停止并等待同 source 恢复。'
          test -f \"\$database_replacement_state\" \
            || echo '[错误] 数据库替换持久状态缺失；禁止自动恢复任何 writer。'
          pm2 save
        elif [ \"\$maintenance_migration_started\" = '1' ]; then
          echo '[维护] 不兼容 migration 已开始执行；为防止旧版本读取新协议，保持 Workspace 与企业微信停止。'
          if [ ! -f \"\$maintenance_marker_path\" ]; then
            echo '[错误] maintenance 持久 marker 丢失；保持停机并等待人工恢复'
          else
            chmod 600 \"\$maintenance_marker_path\"
          fi
          pm2 save
        elif [ -n \"\$old_release\" ] && [ -f \"\$old_release/.server-entry\" ]; then
          echo '[回滚] 新 release 未完成健康/版本/证据提交，恢复上一 PostgreSQL 应用版本。'
          old_server_entry=\$(cat \"\$old_release/.server-entry\" 2>/dev/null || printf 'server.js')
          old_app_dir=\$(dirname \"\$old_release/\$old_server_entry\")
          bind_runtime_env_to_release \"\$old_release\" \"\$old_app_dir\"
          PORT=3000 HOSTNAME=0.0.0.0 pm2 start \"\$old_release/\$old_server_entry\" --name '$PM2_NAME' --cwd \"\$old_app_dir\" --update-env
          atomic_switch_current \"\$old_release\"
          rollback_ready=0
          for i in \$(seq 1 20); do
            if curl -fsS '$HEALTHCHECK_URL' >/dev/null; then
              rollback_ready=1
              break
            fi
            sleep 1
          done
          if [ \"\$rollback_ready\" != '1' ]; then
            echo '[错误] 上一 PostgreSQL 应用版本已重启，但健康检查失败。'
            pm2 logs '$PM2_NAME' --lines 80 --nostream || true
          fi
          if [ -n \"\${WECHAT_BOT_ID:-}\" ] && [ -n \"\${WECHAT_BOT_SECRET:-}\" ] && [ -f \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" ]; then
            pm2 start \"\$old_release/scripts/runtime/wecom-agent-bot.mjs\" --name '$PM2_WECOM_BOT_NAME' --cwd \"\$old_release\" --update-env
          fi
          pm2 save
        else
          echo '[错误] 没有可用的上一 release，无法自动恢复公网应用。'
        fi
      fi
      exit \"\$exit_code\"
    }
    trap rollback_cutover EXIT
    control_plane_policy='$CONTROL_PLANE_POLICY'
    if [ -n '$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA' ]; then
      control_plane_policy='refresh'
    fi
    control_plane_ready=0
    if [ \"\$control_plane_policy\" != 'refresh' ] \
      && [ -z \"\$cutover_source\" ] \
      && [ -f '$REMOTE_CONTROL_PLANE_RECEIPT' ] \
      && [ -f '$REMOTE_WORKSPACE_CONFIG_DIR/.deployment/tenant-config-manifest.json' ] \
      && node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' assert \
        --file '$REMOTE_CONTROL_PLANE_RECEIPT' \
        --target production \
        --migration-set '$RELEASE_MIGRATION_SET_SHA' \
        --resource-manifest \"\$release_dir/resource-defs.json\" \
        --tenant-manifest '$REMOTE_WORKSPACE_CONFIG_DIR/.deployment/tenant-config-manifest.json' \
        --lifecycle-root \"\$release_dir\" >/dev/null 2>&1; then
      control_plane_ready=1
    fi
    if [ \"\$control_plane_policy\" = 'require-existing' ] && [ \"\$control_plane_ready\" != '1' ]; then
      echo '[错误] application-only 发布缺少与当前 artifact 精确匹配的 control-plane lifecycle 回执'
      exit 1
    fi
    begin_remote_timing_stage migration.provision
    if [ -n '$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA' ]; then
      replacement_dump='$REMOTE_WORKSPACE_CONFIG_DIR/deploy-inputs/database-replacements/$RELEASE_DATABASE_REPLACEMENT_REMOTE_ARTIFACT'
      case \"\$replacement_dump\" in
        '$REMOTE_WORKSPACE_CONFIG_DIR/deploy-inputs/database-replacements/$RELEASE_SOURCE_SHA/'*.dump) ;;
        *) echo '[错误] 数据库替换 artifact 路径越界'; exit 1 ;;
      esac
      test -s \"\$replacement_dump\"
      test \"\$(stat -c '%s' \"\$replacement_dump\")\" = '$RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE'
      test \"\$(sha256sum \"\$replacement_dump\" | awk '{print \$1}')\" = '$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA'
      pg_restore --list \"\$replacement_dump\" >/dev/null
      echo '==> 进入整库替换维护窗口；停止 Workspace、candidate 与企业微信 writer...'
      database_replacement_guard=1
      public_process_stopped=1
      pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')\" != '0' ]; then
        echo '[错误] 整库替换前未能确认所有 writer 停止'
        exit 1
      fi
      pm2 save
      echo '==> 恢复并原子切换已绑定候选的 PostgreSQL dump...'
      WORKSPACE_DATABASE_REPLACEMENT_WRITERS_STOPPED=1 \
        \"\$release_dir/ops/replace-production-database.sh\" apply \
          --dump \"\$replacement_dump\" \
          --expected-sha '$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA' \
          --expected-size '$RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE' \
          --source-sha '$RELEASE_SOURCE_SHA' \
          --source-tree '$RELEASE_SOURCE_TREE' \
          --migration-set '$RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET' \
          --migration-count '$RELEASE_DATABASE_REPLACEMENT_MIGRATION_COUNT' \
          --migrations-dir \"\$release_dir/prisma/migrations\" \
          --state-file \"\$database_replacement_state\"
      load_control_environment
      echo '==> 整库替换已切换；后续 migration/seed/candidate 健康门禁继续复用标准流程'
    fi
    if [ \"\$maintenance_migration_started\" = '1' ]; then
      echo '==> 检测到 maintenance marker；先无条件隔离所有旧 writer'
      public_process_stopped=1
      pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')\" != '0' ]; then
        echo '[错误] maintenance 续跑未能确认所有旧 writer 停止'
        exit 1
      fi
      pm2 save
      test \"\$maintenance_marker_present\" = '1'
      test -f \"\$maintenance_marker_path\"
      persisted_line_count=\$(awk 'END { print NR }' \"\$maintenance_marker_path\")
      persisted_source=\$(sed -n 's/^sourceSha=//p' \"\$maintenance_marker_path\")
      persisted_migrations=\$(sed -n 's/^migrations=//p' \"\$maintenance_marker_path\")
      persisted_backup=\$(sed -n 's/^backupPath=//p' \"\$maintenance_marker_path\")
      persisted_backup_sha=\$(sed -n 's/^backupSha256=//p' \"\$maintenance_marker_path\")
      if [ \"\$persisted_line_count\" != '4' ] \
        || ! printf '%s' \"\$persisted_source\" | grep -Eq '^[0-9a-f]{40}$' \
        || ! printf '%s' \"\$persisted_migrations\" | grep -Eq '^[0-9]{14}_[a-z0-9_]+(,[0-9]{14}_[a-z0-9_]+)*$' \
        || ! printf '%s' \"\$persisted_backup_sha\" | grep -Eq '^(pending|[0-9a-f]{64})$'; then
        echo '[错误] maintenance-deploy 持久状态损坏；writer 已保持停止'
        exit 1
      fi
      if [ \"\$persisted_source\" != '$RELEASE_SOURCE_SHA' ]; then
        echo '[错误] maintenance-deploy 属于其他 candidate；writer 已保持停止'
        exit 1
      fi
      case \"\$persisted_backup\" in
        '$REMOTE_BACKUP_DIR/maintenance-pinned/'*.dump) ;;
        *) echo '[错误] maintenance-deploy 备份路径不在受保护目录；writer 已保持停止'; exit 1 ;;
      esac
      maintenance_migrations=\"\$persisted_migrations\"
      maintenance_backup=\"\$persisted_backup\"
      maintenance_backup_sha=\"\$persisted_backup_sha\"
      maintenance_marker_source=\"\$persisted_source\"
      if [ \"\$maintenance_backup_sha\" != 'pending' ]; then
        test -s \"\$maintenance_backup\"
        pg_restore --list \"\$maintenance_backup\" >/dev/null
        if command -v sha256sum >/dev/null 2>&1; then
          persisted_backup_actual=\$(sha256sum \"\$maintenance_backup\" | awk '{print \$1}')
        else
          persisted_backup_actual=\$(shasum -a 256 \"\$maintenance_backup\" | awk '{print \$1}')
        fi
        if [ \"\$persisted_backup_actual\" != \"\$maintenance_backup_sha\" ]; then
          echo '[错误] maintenance 前置恢复点 digest 不匹配；writer 已保持停止'
          exit 1
        fi
      fi
      echo \"==> 未完成维护状态（source \${persisted_source}）已隔离；旧版本回滚保持禁用\"
    fi
    if [ -n \"\$cutover_source\" ]; then
      case \"\$cutover_rollback_env\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$cutover_rollback_env\"
      test -n \"\$old_release\"
      test -f \"\$old_release/.server-entry\"
      if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ] || [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ] || [ \"\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')\" != '0' ]; then
        echo '[错误] SQLite cutover 前必须先停止 candidate、Workspace 与企业微信 PM2 writer'
        exit 1
      fi
    fi
    if [ \"\$control_plane_ready\" = '1' ]; then
      echo '==> 消费已验证的 control-plane lifecycle 回执；跳过全局 mutation...'
      node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\"
      ensure_bootstrap_progress_marker
    else
    echo '==> 检查 Prisma migration 状态...'
    if [ -n '$RELEASE_GENESIS_FROM_SOURCE' ]; then
      node \"\$release_dir/ops/prisma-genesis-cutover.mjs\" status \
        --database-url \"\$DIRECT_URL\" \
        --from-source-sha '$RELEASE_GENESIS_FROM_SOURCE' \
        --candidate-source-sha '$RELEASE_SOURCE_SHA' \
        --legacy-migration-count '$RELEASE_GENESIS_LEGACY_MIGRATION_COUNT' \
        --legacy-migration-set-sha256 '$RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST' \
        --baseline-migration '$RELEASE_GENESIS_BASELINE_MIGRATION' \
        --baseline-checksum '$RELEASE_GENESIS_BASELINE_CHECKSUM' >/dev/null
    else
      node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\" --allow-pending
    fi
    migration_inventory_rows=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -At -F '|' -c 'SELECT migration_name, checksum, CASE WHEN finished_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, CASE WHEN rolled_back_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, applied_steps_count::text FROM "_prisma_migrations" ORDER BY migration_name, id')
    if [ -z '$RELEASE_GENESIS_FROM_SOURCE' ]; then
      MIGRATION_ROWS=\"\$migration_inventory_rows\" MIGRATIONS_DIR=\"\$release_dir/prisma/migrations\" node - <<'NODE'
const { createHash } = require('crypto');
const { readFileSync, readdirSync } = require('fs');
const path = require('path');

const migrations = new Map();
for (const entry of readdirSync(process.env.MIGRATIONS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[0-9]{14}_[a-z0-9_]+$/.test(entry.name)) continue;
  const sqlPath = path.join(process.env.MIGRATIONS_DIR, entry.name, 'migration.sql');
  const checksum = createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
  migrations.set(entry.name, checksum);
}
const active = new Set();
for (const line of (process.env.MIGRATION_ROWS || '').split('\n').filter(Boolean)) {
  const [name, checksum, finished, rolledBack, steps, ...rest] = line.split('|');
  if (rest.length || !/^[0-9]{14}_[a-z0-9_]+$/.test(name || '')
    || !/^[0-9a-f]{64}$/.test(checksum || '') || !/^[01]$/.test(finished || '')
    || !/^[01]$/.test(rolledBack || '') || !/^[0-9]+$/.test(steps || '')) {
    throw new Error('database migration inventory contains a malformed row');
  }
  if (!migrations.has(name) || migrations.get(name) !== checksum) {
    throw new Error('database migration ' + name + ' is absent from the candidate or has a different checksum');
  }
  if (finished === '0' && rolledBack === '0') {
    throw new Error('database migration ' + name + ' is unfinished; resolve it explicitly before retrying deployment');
  }
  if (finished === '1' && rolledBack === '1') {
    throw new Error('database migration ' + name + ' is both finished and rolled back');
  }
  if (finished === '1' && rolledBack === '0') {
    if (active.has(name)) throw new Error('database migration ' + name + ' has duplicate active receipts');
    active.add(name);
    if (Number(steps) < 1 && name !== '00000000000000_sanitized_baseline') {
      throw new Error('database migration ' + name + ' has no applied steps');
    }
  }
}
NODE
    fi
    if [ -z \"\$cutover_source\" ]; then
      for migration_file in \"\$release_dir\"/prisma/migrations/*/migration.sql; do
        [ -f \"\$migration_file\" ] || continue
        migration_name=\$(basename \"\$(dirname \"\$migration_file\")\")
        if ! printf '%s' \"\$migration_name\" | grep -Eq '^[0-9]{14}_[a-z0-9_]+$'; then
          echo \"[错误] migration 名称不安全: \$migration_name\"
          exit 1
        fi
        migration_applied=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc \"SELECT CASE WHEN EXISTS (SELECT 1 FROM \\\"_prisma_migrations\\\" WHERE migration_name = '\$migration_name' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN '1' ELSE '0' END\")
        [ \"\$migration_applied\" = '1' ] && continue
        migration_mode=\$(node \"\$release_dir/scripts/ci/check-migration-policy.mjs\" --file \"\$migration_file\" --print-mode)
        if [ -n '$RELEASE_BOOTSTRAP_BASE' ]; then
          case \",\$maintenance_migrations,\" in
            *,\"\$migration_name\",*) ;;
            *) maintenance_migrations=\"\${maintenance_migrations}\${maintenance_migrations:+,}\$migration_name\" ;;
          esac
        else
          case \"\$migration_mode\" in
            expand) ;;
            maintenance)
              case \",\$maintenance_migrations,\" in
                *,\"\$migration_name\",*) ;;
                *) maintenance_migrations=\"\${maintenance_migrations}\${maintenance_migrations:+,}\$migration_name\" ;;
              esac
              ;;
            *) echo \"[错误] migration mode 不可识别: \$migration_name\"; exit 1 ;;
          esac
        fi
      done
    fi
    # This is the first candidate-bound production mutation. The exact marker
    # is durable before maintenance state, database writes, seed/provision,
    # candidate PM2, or current can change. Different candidates never rebind it.
    ensure_bootstrap_progress_marker
    if [ -n \"\$maintenance_migrations\" ]; then
      umask 077
      mkdir -p '$REMOTE_BACKUP_DIR/maintenance-pinned'
      if [ -z \"\$maintenance_backup\" ]; then
        maintenance_backup='$REMOTE_BACKUP_DIR/maintenance-pinned/pre-'\"\$maintenance_marker_source\"'.dump'
        maintenance_backup_sha='pending'
      fi
      marker_tmp=\"\$maintenance_marker_path.tmp.\$\$\"
      printf '%s\\n' \
        \"sourceSha=\$maintenance_marker_source\" \
        \"migrations=\$maintenance_migrations\" \
        \"backupPath=\$maintenance_backup\" \
        \"backupSha256=\$maintenance_backup_sha\" > \"\$marker_tmp\"
      chmod 600 \"\$marker_tmp\"
      mv \"\$marker_tmp\" \"\$maintenance_marker_path\"
      maintenance_migration_started=1
      echo \"==> 进入维护窗口；停止旧 Workspace、candidate 与企业微信: \$maintenance_migrations\"
      public_process_stopped=1
      pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
      pm2 delete '$PM2_NAME' 2>/dev/null || true
      pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
      if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ] \
        || [ \"\$(pm2_pid_or_unavailable '$PM2_WECOM_BOT_NAME')\" != '0' ]; then
        echo '[错误] maintenance migration 前未能确认所有旧 writer 停止'
        exit 1
      fi
      pm2 save
      if [ \"\$maintenance_backup_sha\" = 'pending' ]; then
        echo '==> 所有 writer 已停止并持久化；创建唯一的 migration 前 PostgreSQL 恢复点...'
        maintenance_backup_tmp=\"\$maintenance_backup.tmp.\$\$\"
        rm -f \"\$maintenance_backup_tmp\"
        backup_database_url=\"\${WORKSPACE_BACKUP_DATABASE_URL:-\$DIRECT_URL}\"
        pg_dump --format=custom --no-owner --no-privileges --file=\"\$maintenance_backup_tmp\" \"\$backup_database_url\"
        pg_restore --list \"\$maintenance_backup_tmp\" >/dev/null
        if command -v sha256sum >/dev/null 2>&1; then
          maintenance_backup_sha=\$(sha256sum \"\$maintenance_backup_tmp\" | awk '{print \$1}')
        else
          maintenance_backup_sha=\$(shasum -a 256 \"\$maintenance_backup_tmp\" | awk '{print \$1}')
        fi
        test -s \"\$maintenance_backup_tmp\"
        mv \"\$maintenance_backup_tmp\" \"\$maintenance_backup\"
        printf '%s  %s\\n' \"\$maintenance_backup_sha\" \"\$maintenance_backup\" > \"\$maintenance_backup.sha256\"
        marker_tmp=\"\$maintenance_marker_path.tmp.\$\$\"
        printf '%s\\n' \
          \"sourceSha=\$maintenance_marker_source\" \
          \"migrations=\$maintenance_migrations\" \
          \"backupPath=\$maintenance_backup\" \
          \"backupSha256=\$maintenance_backup_sha\" > \"\$marker_tmp\"
        chmod 600 \"\$marker_tmp\"
        mv \"\$marker_tmp\" \"\$maintenance_marker_path\"
      fi
      test -s \"\$maintenance_backup\"
      test -s \"\$maintenance_backup.sha256\"
    fi
    verify_remote_deployed_record 'pre-migration'
    if [ -n '$RELEASE_GENESIS_FROM_SOURCE' ]; then
      echo '==> 在已验证、已停写且已备份的维护窗口切换 Prisma genesis 迁移历史...'
      genesis_state=\$(node \"\$release_dir/ops/prisma-genesis-cutover.mjs\" prepare \
        --database-url \"\$DIRECT_URL\" \
        --from-source-sha '$RELEASE_GENESIS_FROM_SOURCE' \
        --candidate-source-sha '$RELEASE_SOURCE_SHA' \
        --legacy-migration-count '$RELEASE_GENESIS_LEGACY_MIGRATION_COUNT' \
        --legacy-migration-set-sha256 '$RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST' \
        --baseline-migration '$RELEASE_GENESIS_BASELINE_MIGRATION' \
        --baseline-checksum '$RELEASE_GENESIS_BASELINE_CHECKSUM' \
        | node -e 'let body=\"\"; process.stdin.on(\"data\", chunk => body += chunk).on(\"end\", () => process.stdout.write(JSON.parse(body).state));')
      if [ \"\$genesis_state\" = 'cleared' ]; then
        node \"\$release_dir/node_modules/prisma/build/index.js\" migrate resolve \
          --schema=\"\$release_dir/prisma\" \
          --applied '$RELEASE_GENESIS_BASELINE_MIGRATION'
      elif [ \"\$genesis_state\" != 'baseline-recorded' ] && [ \"\$genesis_state\" != 'completed' ]; then
        echo \"[错误] 无法识别 Prisma genesis 恢复状态: \$genesis_state\"
        exit 1
      fi
      node \"\$release_dir/ops/prisma-genesis-cutover.mjs\" finalize \
        --database-url \"\$DIRECT_URL\" \
        --from-source-sha '$RELEASE_GENESIS_FROM_SOURCE' \
        --candidate-source-sha '$RELEASE_SOURCE_SHA' \
        --legacy-migration-count '$RELEASE_GENESIS_LEGACY_MIGRATION_COUNT' \
        --legacy-migration-set-sha256 '$RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST' \
        --baseline-migration '$RELEASE_GENESIS_BASELINE_MIGRATION' \
        --baseline-checksum '$RELEASE_GENESIS_BASELINE_CHECKSUM' >/dev/null
    fi
    echo '==> 执行 Prisma 数据库迁移...'
    node \"\$release_dir/node_modules/prisma/build/index.js\" migrate deploy --schema=\"\$release_dir/prisma\"
    if [ -n \"\${SQLITE_CUTOVER_SOURCE:-}\" ]; then
      if [ -z \"\${SQLITE_CUTOVER_SHA256:-}\" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_SHA256'
        exit 1
      fi
      if [ -z \"\${SQLITE_CUTOVER_ROLLBACK_ENV:-}\" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_ROLLBACK_ENV'
        exit 1
      fi
      if [ -z \"\${SQLITE_LEGACY_MIGRATIONS_DIR:-}\" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少私有 SQLITE_LEGACY_MIGRATIONS_DIR'
        exit 1
      fi
      if ! printf '%s' \"\$SQLITE_CUTOVER_SHA256\" | grep -Eq '^[0-9a-f]{64}$'; then
        echo '[错误] SQLITE_CUTOVER_SHA256 必须是 64 位小写十六进制 SHA-256'
        exit 1
      fi
      case \"\$SQLITE_CUTOVER_SOURCE\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_SOURCE 必须是绝对路径'; exit 1 ;; esac
      test -r \"\$SQLITE_CUTOVER_SOURCE\"
      cutover_manifest=\"\${SQLITE_CUTOVER_MANIFEST:-$REMOTE_BACKUP_DIR/postgresql-cutover/postgresql-execute.json}\"
      case \"\$cutover_manifest\" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_MANIFEST 必须是绝对路径'; exit 1 ;; esac
      mkdir -p \"\$(dirname \"\$cutover_manifest\")\"
      cutover_dry_run_manifest=\"\$cutover_manifest.dry-run.json\"
      echo '==> 预演一次性 SQLite 到 PostgreSQL 数据切换...'
      node \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\" \\
        --sqlite \"\$SQLITE_CUTOVER_SOURCE\" \\
        --target \"\$DIRECT_URL\" \\
        --expected-source-sha256 \"\$SQLITE_CUTOVER_SHA256\" \\
        --manifest \"\$cutover_dry_run_manifest\"
      echo '==> 执行一次性 SQLite 到 PostgreSQL 数据切换...'
      node \"\$release_dir/scripts/migrate/sqlite-to-postgresql.mjs\" \\
        --sqlite \"\$SQLITE_CUTOVER_SOURCE\" \\
        --target \"\$DIRECT_URL\" \\
        --expected-source-sha256 \"\$SQLITE_CUTOVER_SHA256\" \\
        --manifest \"\$cutover_manifest\" \\
        --execute
      psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -c \"INSERT INTO \\\"SystemConfig\\\" (\\\"key\\\", \\\"value\\\") VALUES ('database.cutover.marker', '\$SQLITE_CUTOVER_SHA256') ON CONFLICT (\\\"key\\\") DO UPDATE SET \\\"value\\\" = EXCLUDED.\\\"value\\\"\" >/dev/null
      python3 - '$REMOTE_CONTROL_ENV_FILE' \"\$cutover_manifest\" \"\$SQLITE_CUTOVER_SHA256\" <<'PY'
import json
import os
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
source_sha256 = sys.argv[3]
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if manifest.get('status') != 'success' or manifest.get('mode') != 'execute':
    raise SystemExit('SQLite cutover manifest is not a successful execute manifest')
if manifest.get('source', {}).get('sha256After') != source_sha256:
    raise SystemExit('SQLite cutover manifest source hash does not match the frozen source')
keys = {'SQLITE_CUTOVER_SOURCE', 'SQLITE_CUTOVER_SHA256', 'SQLITE_CUTOVER_MANIFEST', 'SQLITE_CUTOVER_ROLLBACK_ENV', 'SQLITE_LEGACY_MIGRATIONS_DIR'}
lines = [line for line in env_path.read_text(encoding='utf-8').splitlines() if line.split('=', 1)[0].strip() not in keys]
temporary = env_path.with_suffix('.env.cutover.tmp')
temporary.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
os.chmod(temporary, 0o600)
temporary.replace(env_path)
receipt = manifest_path.with_suffix(manifest_path.suffix + '.complete')
receipt.write_text(f'{source_sha256}  {manifest_path.name}\n', encoding='utf-8')
os.chmod(receipt, 0o600)
PY
      unset SQLITE_CUTOVER_SOURCE SQLITE_CUTOVER_SHA256 SQLITE_CUTOVER_MANIFEST SQLITE_CUTOVER_ROLLBACK_ENV SQLITE_LEGACY_MIGRATIONS_DIR
      echo '==> SQLite 一次性切换完成，切换变量已从运行态配置移除。'
    fi
    node \"\$release_dir/scripts/check/check-prisma-deploy-status.js\" --migrations-dir \"\$release_dir/prisma/migrations\"
    echo '==> 同步 RBAC resource registry...'
    node \"\$release_dir/seed-resources-runtime.mjs\" \"\$release_dir/resource-defs.json\"
    echo '==> 幂等同步 Agent 虚拟员工与岗位...'
    node \"\$release_dir/scripts/provision-agent-workforce.mjs\" --execute
    node \"\$release_dir/scripts/provision-agent-workforce.mjs\" --check
    echo '==> 校验 RBAC action grant 数据...'
    node \"\$release_dir/scripts/check/check-permission-action-grants.mjs\" \"\$release_dir/resource-defs.json\"
    user_count=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM \"User\";')
    invalid_constraint_count=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM pg_constraint WHERE connamespace = '\''public'\''::regnamespace AND NOT convalidated;')
    if [ \"\$user_count\" -lt 1 ]; then
      echo '[错误] PostgreSQL 中没有用户数据，拒绝启动生产服务'
      exit 1
    fi
    if [ \"\$invalid_constraint_count\" -ne 0 ]; then
      echo '[错误] PostgreSQL 存在未验证约束，拒绝启动生产服务'
      exit 1
    fi
    migration_checksum=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT checksum FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1')
    test -n \"\$migration_checksum\"
    direct_fingerprint=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc \"SELECT COALESCE((SELECT value FROM \\\"SystemConfig\\\" WHERE key = 'database.cutover.marker'), 'none') || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"User\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"Resource\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"FinanceVoucherItem\\\")\")
    runtime_fingerprint=\$(psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -Atc \"SELECT COALESCE((SELECT value FROM \\\"SystemConfig\\\" WHERE key = 'database.cutover.marker'), 'none') || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"User\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"Resource\\\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \\\"FinanceVoucherItem\\\")\")
    if [ -z \"\$direct_fingerprint\" ] || [ \"\$direct_fingerprint\" != \"\$runtime_fingerprint\" ]; then
      echo '[错误] DATABASE_URL 与 DIRECT_URL 的切换标记或核心数据指纹不一致'
      exit 1
    fi
    echo '==> 写入独立 control-plane lifecycle 回执...'
    test -f '$REMOTE_WORKSPACE_CONFIG_DIR/.deployment/tenant-config-manifest.json'
    node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' write \
      --file '$REMOTE_CONTROL_PLANE_RECEIPT' \
      --target production \
      --source-sha '$RELEASE_SOURCE_SHA' \
      --source-tree '$RELEASE_SOURCE_TREE' \
      --migration-set '$RELEASE_MIGRATION_SET_SHA' \
      --resource-manifest \"\$release_dir/resource-defs.json\" \
      --tenant-manifest '$REMOTE_WORKSPACE_CONFIG_DIR/.deployment/tenant-config-manifest.json' \
      --lifecycle-root \"\$release_dir\" >/dev/null
    node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' assert \
      --file '$REMOTE_CONTROL_PLANE_RECEIPT' \
      --target production \
      --migration-set '$RELEASE_MIGRATION_SET_SHA' \
      --resource-manifest \"\$release_dir/resource-defs.json\" \
      --tenant-manifest '$REMOTE_WORKSPACE_CONFIG_DIR/.deployment/tenant-config-manifest.json' \
      --lifecycle-root \"\$release_dir\" >/dev/null
    fi

    finish_remote_timing_stage passed 0
    if [ '$DEPLOY_EXECUTION_MODE' = 'control-plane-only' ]; then
      echo '==> control-plane lifecycle 已提交；不启动或切换任何应用进程'
      if [ -z "\$maintenance_migrations" ]; then
        rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
      else
        echo '[维护] maintenance migration 已提交；保留恢复点与 writer fence，等待同 source 的 fleet cutover'
      fi
      trap - EXIT
      exit 0
    fi
    begin_remote_timing_stage candidate.warmup
    pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
    PORT=3101 HOSTNAME=127.0.0.1 pm2 start \"\$release_dir/\$server_entry\" --name \"\$cutover_candidate_name\" --cwd \"\$app_dir\" --update-env
    qc_cache_ready=0
    for i in \$(seq 1 20); do
      if curl -fsS -X POST -H \"x-qc-cache-warmup: \$NEXTAUTH_SECRET\" 'http://127.0.0.1:3101/workspace/api/modules/production/qc/cache' >/dev/null; then
        qc_cache_ready=1
        break
      fi
      sleep 1
    done
    if [ \"\$qc_cache_ready\" != \"1\" ]; then
      echo '[错误] QC 模板缓存预热失败'
      pm2 logs \"\$cutover_candidate_name\" --lines 80 --nostream || true
      exit 1
    fi
    assert_release_version 'http://127.0.0.1:3101/workspace/api/settings/version' 'candidate'
    verify_remote_deployed_record 'pre-cutover'
    pm2 delete \"\$cutover_candidate_name\" 2>/dev/null || true
    if [ \"\$(pm2_pid_or_unavailable \"\$cutover_candidate_name\")\" != '0' ]; then
      echo '[错误] PostgreSQL candidate writer 未能确认停止，拒绝启动公网进程'
      exit 1
    fi
    finish_remote_timing_stage passed 0
    begin_remote_timing_stage public.cutover
    pm2 delete '$PM2_NAME' 2>/dev/null || true
    if [ \"\$(pm2_pid_or_unavailable '$PM2_NAME')\" != '0' ]; then
      echo '[错误] PostgreSQL public writer 未能确认停止，拒绝记录 WAL 基线'
      exit 1
    fi
    public_process_stopped=1
    if [ -n \"\$cutover_source\" ]; then
      cutover_public_wal_lsn=\$(psql \"\$DIRECT_URL\" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()')
    fi
    PORT=3000 HOSTNAME=0.0.0.0 pm2 start \"\$release_dir/\$server_entry\" --name '$PM2_NAME' --cwd \"\$app_dir\" --update-env
    public_ready=0
    for i in \$(seq 1 20); do
      if curl -fsS '$HEALTHCHECK_URL' >/dev/null && curl -fsS -X POST -H \"x-qc-cache-warmup: \$NEXTAUTH_SECRET\" 'http://127.0.0.1:3000/workspace/api/modules/production/qc/cache' >/dev/null; then
        public_ready=1
        break
      fi
      sleep 1
    done
    if [ \"\$public_ready\" != '1' ]; then
      pm2 logs '$PM2_NAME' --lines 80 --nostream || true
      exit 1
    fi
    assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'
    cutover_public_switched=1
    atomic_switch_current \"\$release_dir\"
    reset_gateway_overrides_to_full
    pm2 delete '$PM2_WECOM_BOT_NAME' 2>/dev/null || true
    if [ -n "\${WECHAT_BOT_ID:-}" ] && [ -n "\${WECHAT_BOT_SECRET:-}" ]; then
      pm2 start "\$release_dir/scripts/runtime/wecom-agent-bot.mjs" --name '$PM2_WECOM_BOT_NAME' --cwd "\$release_dir" --update-env
    else
      echo '==> 跳过企业微信智能机器人：WECHAT_BOT_ID/WECHAT_BOT_SECRET 未配置'
    fi
    pm2 save
    node '$REMOTE_RELEASE_RECEIPT_TOOL' write \
      --file '$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json' \
      --transport '$RELEASE_TRANSPORT' \
      --runtime-source '$RELEASE_SOURCE_SHA' \
      --runtime-tree '$RELEASE_SOURCE_TREE' \
      --canonical-source '$RELEASE_CANONICAL_SOURCE_SHA' \
      --canonical-tree '$RELEASE_CANONICAL_SOURCE_TREE' \
      --artifact-sha '$ARTIFACT_SHA' \
      --manifest-sha '$ARTIFACT_MANIFEST_SHA' \
      --migration-set '$RELEASE_MIGRATION_SET_SHA' \
      --cnb-repository '$RELEASE_CNB_REPOSITORY' \
      --cnb-branch '$RELEASE_CNB_BRANCH' \
      --cnb-injection '$RELEASE_CNB_INJECTION_SHA' \
      --release-id '$release_id' \
      --release-dir '$REMOTE_DIR/releases/$release_id'
    release_committed=1
    commit_database_replacement_state
    finish_remote_timing_stage passed 0
    rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'
    rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'
    find '$REMOTE_DIR/releases' -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | xargs -r rm -rf
    pm2 status
  "
  if [ "$REMOTE_RELEASE_TIMING_ENABLED" = "1" ] && [ -n "${RELEASE_TIMING_FILE:-}" ]; then
    local remote_timing_copy=""
    if ! remote_timing_copy="$(mktemp "${TMPDIR:-/tmp}/workspace-remote-release-timing.XXXXXX")"; then
      echo "[警告] deploy.remote 计时临时文件不可用；部署结果不受影响" >&2
    elif ssh_cmd "test -s '$remote_timing_output' && cat '$remote_timing_output'" > "$remote_timing_copy" \
      && node ./ops/release-timing.mjs validate \
        --input "$remote_timing_copy" \
        --release-id "$RELEASE_SOURCE_SHA" \
        --scope deploy.remote \
        --required-stages migration.provision,candidate.warmup,public.cutover >/dev/null \
      && cat "$remote_timing_copy" >> "$RELEASE_TIMING_FILE"; then
      chmod 600 "$RELEASE_TIMING_FILE" || true
    else
      echo "[警告] deploy.remote 计时记录未能汇入本地 release timing；部署结果不受影响" >&2
    fi
    if [ -n "$remote_timing_copy" ]; then rm -f "$remote_timing_copy" || true; fi
  fi
}

verify_control_plane_release() {
  echo "==> 校验 control-plane lifecycle 回执..."
  ssh_cmd "node '$REMOTE_CONTROL_PLANE_RECEIPT_TOOL' inspect --file '$REMOTE_CONTROL_PLANE_RECEIPT' >/dev/null"
}

run_healthcheck() {
  echo "==> 健康检查与 runtime 版本复验..."
  ssh_cmd "
    set -e
    curl -fsS '$HEALTHCHECK_URL' >/dev/null
    version_response=\$(curl -fsS 'http://127.0.0.1:3000/workspace/api/settings/version')
    VERSION_RESPONSE=\"\$version_response\" EXPECTED_VERSION='$RELEASE_SOURCE_SHA' node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || payload.version !== process.env.EXPECTED_VERSION) {
  throw new Error('post-deploy version endpoint does not match runtime source SHA');
}
NODE
  "
}

if [ "$RUN_LOCAL_CHECKS" = "1" ] && ! command -v npm >/dev/null 2>&1; then
  echo "==> 当前 CI 容器未提供 npm，自动跳过本地静态检查"
  RUN_LOCAL_CHECKS=0
fi

echo "==> 校验 CI 基础命令..."
require_local_cmd ssh
require_local_cmd rsync
require_local_cmd tar
echo "==> ssh: $(command -v ssh)"
echo "==> rsync: $(command -v rsync)"

echo "==> 校验 release metadata 与精确 source..."
resolve_release_metadata

if [ -n "${RELEASE_TIMING_FILE:-}" ]; then
  # shellcheck source=ops/lib/release-timing.sh
  source ./ops/lib/release-timing.sh
  release_timing_configure \
    "$RELEASE_TIMING_FILE" \
    "${RELEASE_TIMING_RELEASE_ID:-$RELEASE_SOURCE_SHA}" \
    deploy
  RELEASE_TIMING_ENABLED=1
fi

if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
  run_deploy_stage checks.local run_local_checks
else
  echo "==> 跳过本地静态检查（RUN_LOCAL_CHECKS=${RUN_LOCAL_CHECKS}）"
fi

echo "==> 源码与 migration 静态门禁已由 validate receipt 证明；deploy 只校验生产 migration 区间"

run_deploy_stage artifact.verify build_artifact

echo "==> 验证服务器连接..."
run_deploy_stage transport.connect start_ssh_master
run_deploy_stage transport.remote-smoke ssh_cmd "echo CONNECTED && whoami && mkdir -p '$REMOTE_DIR'"
run_deploy_stage runtime.pm2-contract verify_remote_runtime_pm2
run_deploy_stage deploy.lock acquire_remote_deploy_lock
run_deploy_stage deploy.tools sync_remote_deploy_tools
run_deploy_stage deploy.reconcile reconcile_completed_deploy_markers
verify_release_order

run_deploy_stage runtime.prepare prepare_remote_runtime
if [ "$DEPLOY_EXECUTION_MODE" = "control-plane-only" ]; then
  run_deploy_stage backup.postgresql backup_remote_postgresql
  run_deploy_stage backup.cleanup cleanup_remote_backups
  run_deploy_stage lifecycle.deploy deploy_remote_artifact
  run_deploy_stage lifecycle.verify verify_control_plane_release
else
  run_deploy_stage runtime.library ensure_remote_library_runtime_deps
  run_deploy_stage runtime.agent ensure_remote_kimi_agent_runtime
  run_deploy_stage runtime.onlyoffice ensure_remote_onlyoffice_runtime
  run_deploy_stage source.library sync_remote_library_source
  run_deploy_stage runtime.validate validate_remote_runtime
  verify_release_order
  run_deploy_stage backup.postgresql backup_remote_postgresql
  run_deploy_stage backup.runtime backup_remote_runtime
  run_deploy_stage backup.cleanup cleanup_remote_backups
  run_deploy_stage artifact.deploy deploy_remote_artifact
  run_deploy_stage health.final run_healthcheck
fi

echo ""
echo "==> ${RELEASE_TRANSPORT} 产物部署完成"
