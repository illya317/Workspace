#!/usr/bin/env bash
set -euo pipefail
RUNTIME_USER="${WORKSPACE_RUNTIME_OS_USER:-workspace-runtime}"
RUNTIME_HOME="${WORKSPACE_RUNTIME_HOME:-/var/lib/workspace-runtime}"
RUNTIME_ENV_FILE="${WORKSPACE_RUNTIME_ENV_FILE:-/home/ubuntu/workspace/.workspace/runtime.env}"
PM2_BINARY="${WORKSPACE_PM2_BINARY:-/usr/bin/pm2}"
[ "$(id -u)" -eq 0 ] || { echo "[错误] 必须由 root/sudo 调用" >&2; exit 77; }
[ -r "$RUNTIME_ENV_FILE" ] || { echo "[错误] runtime env 不可读: $RUNTIME_ENV_FILE" >&2; exit 1; }
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?(DIRECT_URL|SHADOW_DATABASE_URL|WORKSPACE_BACKUP_DATABASE_URL|WORKSPACE_MONITOR_DATABASE_URL|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGOPTIONS|PGUSER|PGHOST|PGDATABASE)=' "$RUNTIME_ENV_FILE"; then
  echo "[错误] runtime env 禁止包含 control-plane URL 或替代 PostgreSQL 身份变量" >&2
  exit 1
fi
grep -Eq '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$RUNTIME_ENV_FILE" || { echo "[错误] runtime env 缺少 DATABASE_URL" >&2; exit 1; }
process_environment=()
for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION PG_POOL_MAX PG_APPLICATION_NAME \
  WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_INTERNAL_ORIGIN WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE \
  WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL; do
  value="${!key-}"
  [ -z "$value" ] || process_environment+=("WORKSPACE_PM2_PROCESS_$key=$value")
done
exec runuser -u "$RUNTIME_USER" -- env -i \
  HOME="$RUNTIME_HOME" USER="$RUNTIME_USER" LOGNAME="$RUNTIME_USER" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  PM2_HOME="$RUNTIME_HOME/.pm2" WORKSPACE_RUNTIME_ENV_FILE="$RUNTIME_ENV_FILE" \
  "${process_environment[@]}" \
  /bin/bash -c '
    set -euo pipefail
    declare -A process_values=()
    for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION PG_POOL_MAX PG_APPLICATION_NAME \
      WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_INTERNAL_ORIGIN WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE \
      WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL; do
      prefixed="WORKSPACE_PM2_PROCESS_$key"
      process_values["$key"]="${!prefixed-}"
      unset "$prefixed"
    done
    set -a
    . "$WORKSPACE_RUNTIME_ENV_FILE"
    set +a
    unset DIRECT_URL SHADOW_DATABASE_URL WORKSPACE_BACKUP_DATABASE_URL WORKSPACE_MONITOR_DATABASE_URL
    unset PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS PGUSER PGHOST PGDATABASE
    for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION PG_POOL_MAX PG_APPLICATION_NAME \
      WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_INTERNAL_ORIGIN WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE \
      WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL; do
      value="${process_values[$key]-}"
      [ -z "$value" ] || export "$key=$value"
    done
    exec "$0" "${@:1}"
  ' "$PM2_BINARY" "$@"
