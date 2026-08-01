#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
PM2_NAME="${PM2_NAME:-workspace}"
PM2_WECOM_BOT_NAME="${PM2_WECOM_BOT_NAME:-${PM2_NAME}-wecom-agent}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
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
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
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


# Production deployment is composed here; implementation modules are private to this entrypoint.
# shellcheck source=ops/deploy/transport.sh
source "$SCRIPT_DIR/deploy/transport.sh"
# shellcheck source=ops/deploy/state.sh
source "$SCRIPT_DIR/deploy/state.sh"
# shellcheck source=ops/deploy/artifact.sh
source "$SCRIPT_DIR/deploy/artifact.sh"
# shellcheck source=ops/deploy/runtime-supply.sh
source "$SCRIPT_DIR/deploy/runtime-supply.sh"
# shellcheck source=ops/deploy/runtime-safety.sh
source "$SCRIPT_DIR/deploy/runtime-safety.sh"
# shellcheck source=ops/deploy/atomic-cutover.sh
source "$SCRIPT_DIR/deploy/atomic-cutover.sh"
# shellcheck source=ops/deploy/health.sh
source "$SCRIPT_DIR/deploy/health.sh"

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

echo "==> validate 回执已冻结；deploy 不运行源码、Prisma、文档或编译检查"
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
