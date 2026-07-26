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
WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"

COMMAND="${1:-}"
[ -n "$COMMAND" ] && shift
RELEASE_ID=""
SOURCE_SHA=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) shift; RELEASE_ID="${1:-}" ;;
    --source-sha) shift; SOURCE_SHA="${1:-}" ;;
    -h|--help)
      cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/private/.env ops/upload-data-release.sh upload --id RELEASE_ID [--source-sha SHA]
  OPS_ENV_FILE=/path/to/private/.env ops/upload-data-release.sh verify --id RELEASE_ID
  OPS_ENV_FILE=/path/to/private/.env ops/upload-data-release.sh status --id RELEASE_ID
EOF
      exit 0
      ;;
    *) echo "[错误] 未知参数: $1"; exit 2 ;;
  esac
  shift
done

case "$COMMAND" in upload|verify|status) ;; *) echo "[错误] 命令必须是 upload、verify 或 status"; exit 2 ;; esac
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
printf '%s' "$RELEASE_ID" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$' \
  || { echo "[错误] --id 格式无效"; exit 2; }
if [ -n "$SOURCE_SHA" ]; then
  printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "[错误] --source-sha 必须是完整 Git SHA"; exit 2; }
fi

REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$REMOTE_DIR/.workspace}"
if [ "$REMOTE_WORKSPACE_CONFIG_DIR" != "$REMOTE_DIR/.workspace" ]; then
  echo "[警告] REMOTE_WORKSPACE_CONFIG_DIR 已统一为 $REMOTE_DIR/.workspace"
  REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_DIR/.workspace"
fi

TMP_DIR="$(mktemp -d)"
TMP_KEY=""
cleanup() { rm -rf "$TMP_DIR"; rm -f "${TMP_KEY:-}"; }
trap cleanup EXIT

if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  TMP_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$TMP_KEY"
  chmod 600 "$TMP_KEY"
  SSH_KEY="$TMP_KEY"
else
  echo "[错误] 缺少生产上传所需 KEY/KEY_CONTENT"
  exit 1
fi

SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new"
REMOTE_RELEASE_ROOT="$REMOTE_WORKSPACE_CONFIG_DIR/data-release-uploads/$RELEASE_ID"
REMOTE_CURRENT="$REMOTE_RELEASE_ROOT/current.json"

if [ "$COMMAND" = "status" ]; then
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    set -e
    if [ ! -f '$REMOTE_CURRENT' ]; then
      echo 'not_uploaded'
      exit 0
    fi
    node - '$REMOTE_CURRENT' <<'NODE'
const receipt = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (receipt.kind !== 'workspace-data-release-upload' || receipt.releaseId !== '$RELEASE_ID') process.exit(1);
console.log(JSON.stringify({ status: 'uploaded', releaseId: receipt.releaseId, payloadDigest: receipt.payloadDigest, uploadedAt: receipt.uploadedAt }, null, 2));
NODE
  "
  exit 0
fi

if [ "$COMMAND" = "verify" ]; then
  ssh "${SSH_OPTIONS[@]}" "$SERVER" "
    set -e
    test -f '$REMOTE_CURRENT'
    digest=\$(node -p \"JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).payloadDigest\" '$REMOTE_CURRENT')
    bundle='$REMOTE_RELEASE_ROOT/'\"\$digest\"
    node \"\$bundle/data-release-transfer.mjs\" verify-staged --bundle-root \"\$bundle\" --id '$RELEASE_ID' --payload-digest \"\$digest\" >/dev/null
    echo \"VERIFIED $RELEASE_ID \$digest\"
  "
  exit 0
fi

DESCRIPTOR="$TMP_DIR/descriptor.json"
FILE_LIST="$TMP_DIR/files.txt"
node "$SCRIPT_DIR/data-release-transfer.mjs" inspect-private \
  --config-root "$WORKSPACE_CONFIG_DIR" --id "$RELEASE_ID" > "$DESCRIPTOR"
PAYLOAD_DIGEST="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).payloadDigest" "$DESCRIPTOR")"
node - "$DESCRIPTOR" > "$FILE_LIST" <<'NODE'
const descriptor = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
for (const file of descriptor.files) console.log(file.path);
NODE

SOURCE_ROOT="$WORKSPACE_CONFIG_DIR/data-release-sources/$RELEASE_ID"
MANIFEST_FILE="$WORKSPACE_CONFIG_DIR/data-release-manifests/$RELEASE_ID.json"
TOKEN="${PAYLOAD_DIGEST:0:12}-$(date +%Y%m%d%H%M%S)-$$"
REMOTE_INCOMING="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-inputs/data-releases/.incoming-$RELEASE_ID-$TOKEN"
REMOTE_FINAL="$REMOTE_RELEASE_ROOT/$PAYLOAD_DIGEST"

echo "==> 上传数据发布 $RELEASE_ID ($PAYLOAD_DIGEST) 到生产暂存区..."
ssh "${SSH_OPTIONS[@]}" "$SERVER" "set -e; mkdir -p '$REMOTE_INCOMING/sources' '$REMOTE_RELEASE_ROOT'; chmod 700 '$REMOTE_INCOMING' '$REMOTE_INCOMING/sources' '$REMOTE_RELEASE_ROOT'"
rsync -az --files-from="$FILE_LIST" -e "$RSYNC_SSH" "$SOURCE_ROOT/" "$SERVER:$REMOTE_INCOMING/sources/"
rsync -az -e "$RSYNC_SSH" "$MANIFEST_FILE" "$SCRIPT_DIR/data-release-transfer.mjs" "$SERVER:$REMOTE_INCOMING/"
ssh "${SSH_OPTIONS[@]}" "$SERVER" "
  set -e
  mv '$REMOTE_INCOMING/$RELEASE_ID.json' '$REMOTE_INCOMING/manifest.json'
  node '$REMOTE_INCOMING/data-release-transfer.mjs' verify-staged \
    --bundle-root '$REMOTE_INCOMING' --id '$RELEASE_ID' --payload-digest '$PAYLOAD_DIGEST' >/dev/null
  find '$REMOTE_INCOMING' -type d -exec chmod 700 {} +
  find '$REMOTE_INCOMING' -type f -exec chmod 600 {} +
  if [ -d '$REMOTE_FINAL' ]; then
    node '$REMOTE_FINAL/data-release-transfer.mjs' verify-staged \
      --bundle-root '$REMOTE_FINAL' --id '$RELEASE_ID' --payload-digest '$PAYLOAD_DIGEST' >/dev/null
    rm -rf '$REMOTE_INCOMING'
  else
    mv '$REMOTE_INCOMING' '$REMOTE_FINAL'
  fi
  node '$REMOTE_FINAL/data-release-transfer.mjs' write-receipt \
    --bundle-root '$REMOTE_FINAL' --id '$RELEASE_ID' --payload-digest '$PAYLOAD_DIGEST' \
    --source-sha '${SOURCE_SHA:-none}' --output '$REMOTE_CURRENT.tmp' >/dev/null
  mv '$REMOTE_CURRENT.tmp' '$REMOTE_CURRENT'
  chmod 600 '$REMOTE_CURRENT'
"
echo "==> 数据发布已上传并经远端逐文件复验: $RELEASE_ID $PAYLOAD_DIGEST"
