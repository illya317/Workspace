#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@"
fi
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"
SOURCE_DIR="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"

DRY_RUN=0
SOURCE_SHA=""
DEPLOY_LOCK_TOKEN=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --source-sha)
      shift
      SOURCE_SHA="${1:-}"
      ;;
    --lock-token)
      shift
      DEPLOY_LOCK_TOKEN="${1:-}"
      ;;
    -h|--help)
      cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env ops/sync-tenant-config.sh [--dry-run] [--source-sha SHA] [--lock-token TOKEN]

根据 config/tenant/profile.json 收集租户配置及其引用文件，先上传到服务器
暂存目录并逐文件校验，再切换到 REMOTE_DIR/.workspace。失败时拒绝部署。
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 1 ;;
  esac
  shift
done

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
cd "$SOURCE_DIR"

case "$WORKSPACE_CONFIG_DIR" in
  /*) ;;
  *) echo "[错误] WORKSPACE_CONFIG_DIR 必须是绝对路径"; exit 1 ;;
esac
if [ -z "$SOURCE_SHA" ]; then
  SOURCE_SHA="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
fi
if ! printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "[错误] --source-sha 必须是 40 位小写 Git SHA"
  exit 1
fi

REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$REMOTE_DIR/.workspace}"
if [ "$REMOTE_WORKSPACE_CONFIG_DIR" != "$REMOTE_DIR/.workspace" ]; then
  echo "[警告] REMOTE_WORKSPACE_CONFIG_DIR 已统一为 $REMOTE_DIR/.workspace，忽略旧值: $REMOTE_WORKSPACE_CONFIG_DIR"
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

SYNC_TMP_DIR="$(mktemp -d)"
SYNC_TMP_KEY=""
cleanup() {
  rm -rf "$SYNC_TMP_DIR"
  rm -f "${SYNC_TMP_KEY:-}"
}
trap cleanup EXIT

MANIFEST_FILE="$SYNC_TMP_DIR/tenant-config-manifest.json"
FILE_LIST="$SYNC_TMP_DIR/tenant-config-files.txt"
echo "==> 生成租户配置发布清单..."
TENANT_CONFIG_DIGEST="$(node "$SCRIPT_DIR/tenant-config-manifest.mjs" create \
  --root "$WORKSPACE_CONFIG_DIR" --output "$MANIFEST_FILE")"
node "$SCRIPT_DIR/tenant-config-manifest.mjs" paths --manifest "$MANIFEST_FILE" > "$FILE_LIST"
echo "==> 租户配置清单: $TENANT_CONFIG_DIGEST ($(wc -l < "$FILE_LIST" | tr -d ' ') files)"
echo "==> 使用当前 source 的 Platform schema 校验租户配置..."
WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" node --conditions=react-server --import tsx -e '
  const tenant = await import("./packages/platform/server/tenant-config.ts");
  tenant.getTenantConfig();
'

if [ "$DRY_RUN" = "1" ]; then
  sed 's/^/    - /' "$FILE_LIST"
  echo "==> dry-run：租户配置校验通过，未连接服务器。"
  exit 0
fi

[ -n "$DEPLOY_LOCK_TOKEN" ] || {
  echo "[错误] 租户配置安装只能在已获取的共享 deploy.lock 内执行" >&2
  exit 73
}
case "$DEPLOY_LOCK_TOKEN" in
  *[!A-Za-z0-9._:-]*) echo "[错误] deploy lock token 格式无效" >&2; exit 73 ;;
esac

if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  SYNC_TMP_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$SYNC_TMP_KEY"
  chmod 600 "$SYNC_TMP_KEY"
  SSH_KEY="$SYNC_TMP_KEY"
else
  echo "[错误] 缺少租户配置同步所需 KEY/KEY_CONTENT"
  exit 1
fi

SYNC_TOKEN="${SOURCE_SHA:0:12}-$(date +%Y%m%d%H%M%S)-$$"
REMOTE_STAGING_ROOT="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-inputs/tenant-config/$SYNC_TOKEN"
REMOTE_BACKUP_ROOT="$REMOTE_DIR/.workspace.backups/tenant-config/$SYNC_TOKEN"
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new"

echo "==> 上传租户配置到服务器暂存目录..."
ssh "${SSH_OPTIONS[@]}" "$SERVER" \
  "set -e
   owner_file='$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.owner'
   lock_file='$REMOTE_WORKSPACE_CONFIG_DIR/deploy.lock'
   test \"\$(cat \"\$owner_file\" 2>/dev/null)\" = '$DEPLOY_LOCK_TOKEN'
   if flock -n \"\$lock_file\" true; then
     echo '[错误] 租户配置安装未检测到外层持有的共享 deploy.lock' >&2
     exit 73
   fi
   mkdir -p '$REMOTE_STAGING_ROOT/.deployment' '$REMOTE_DIR/.workspace.backups/tenant-config'"
rsync -az --files-from="$FILE_LIST" -e "$RSYNC_SSH" \
  "$WORKSPACE_CONFIG_DIR/" "$SERVER:$REMOTE_STAGING_ROOT/"
rsync -az -e "$RSYNC_SSH" \
  "$MANIFEST_FILE" "$SCRIPT_DIR/tenant-config-manifest.mjs" \
  "$SCRIPT_DIR/reconcile-runtime-config-permissions.sh" \
  "$SERVER:$REMOTE_STAGING_ROOT/.deployment/"

echo "==> 服务器逐文件校验并切换租户配置..."
ssh "${SSH_OPTIONS[@]}" "$SERVER" "
  set -e
  test \"\$(cat '$REMOTE_WORKSPACE_CONFIG_DIR/deploy-lock.owner' 2>/dev/null)\" = '$DEPLOY_LOCK_TOKEN'
  if flock -n '$REMOTE_WORKSPACE_CONFIG_DIR/deploy.lock' true; then
    echo '[错误] 租户配置切换时共享 deploy.lock 已丢失' >&2
    exit 73
  fi
  tool='$REMOTE_STAGING_ROOT/.deployment/tenant-config-manifest.mjs'
  manifest='$REMOTE_STAGING_ROOT/.deployment/tenant-config-manifest.json'
  reconciler='$REMOTE_STAGING_ROOT/.deployment/reconcile-runtime-config-permissions.sh'
  node \"\$tool\" verify --root '$REMOTE_STAGING_ROOT' --manifest \"\$manifest\"
  node \"\$tool\" install \
    --staging-root '$REMOTE_STAGING_ROOT' \
    --target-root '$REMOTE_WORKSPACE_CONFIG_DIR' \
    --backup-root '$REMOTE_BACKUP_ROOT' \
    --manifest \"\$manifest\"
  sudo -n -- bash \"\$reconciler\" '$REMOTE_WORKSPACE_CONFIG_DIR' workspace-runtime
  node \"\$tool\" verify --root '$REMOTE_WORKSPACE_CONFIG_DIR' --manifest \"\$manifest\"
  rm -rf '$REMOTE_STAGING_ROOT'
  find '$REMOTE_DIR/.workspace.backups/tenant-config' -mindepth 1 -maxdepth 1 -type d \
    -printf '%f\\n' | sort -r | tail -n +6 | while IFS= read -r stale; do
      rm -rf '$REMOTE_DIR/.workspace.backups/tenant-config/'\"\$stale\"
    done
"
echo "==> 租户配置同步完成并通过服务器摘要校验: $TENANT_CONFIG_DIGEST"
