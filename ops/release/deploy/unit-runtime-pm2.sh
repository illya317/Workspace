#!/usr/bin/env bash

unit_runtime_pm2_initialize() {
  RUNTIME_PM2_RUNNER="${WORKSPACE_RUNTIME_PM2_RUNNER:-/usr/local/sbin/workspace-runtime-pm2}"
  case "$RUNTIME_PM2_RUNNER" in /*) ;; *) echo "[错误] WORKSPACE_RUNTIME_PM2_RUNNER 必须是绝对路径" >&2; return 1 ;; esac
  case "$RUNTIME_PM2_RUNNER" in *[!A-Za-z0-9_./-]*) echo "[错误] WORKSPACE_RUNTIME_PM2_RUNNER 包含不安全字符" >&2; return 1 ;; esac
  sudo -n -- test -x "$RUNTIME_PM2_RUNNER" || { echo "[错误] hardened runtime PM2 runner 不可执行" >&2; return 1; }
}

runtime_pm2() {
  local key value
  local runner_environment=(WORKSPACE_RUNTIME_PM2_TARGET=unit)
  for key in PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION NEXT_PUBLIC_BASE_PATH PG_POOL_MAX PG_APPLICATION_NAME \
    WORKSPACE_CONFIG_DIR WORKSPACE_DEPLOY_UNIT_ID WORKSPACE_DEPLOY_SLOT WORKSPACE_DEPLOY_CURRENT_STATE_FILE \
    WORKSPACE_INTERNAL_ORIGIN WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE \
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY WECHAT_BOT_BRIDGE_URL PROJECT_NOTIFICATION_SCHEDULER_DISABLED; do
    value="${!key-}"
    [ -z "$value" ] || runner_environment+=("$key=$value")
  done
  sudo -n -- env "${runner_environment[@]}" "$RUNTIME_PM2_RUNNER" "$@"
}
