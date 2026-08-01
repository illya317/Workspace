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

RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
RELEASE_CI_ENV_FILE="${RELEASE_CI_ENV_FILE:-${SOURCE_DIR:-}/.env}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-${REMOTE_DIR:-}/.workspace}"
RECEIPT_FILE="${DATABASE_REPLACEMENT_RECEIPT_FILE:-$RELEASE_WORKTREE/.cache/release-check/database-replacement.json}"

: "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_CI_ENV_FILE:?RELEASE_CI_ENV_FILE not set in $OPS_ENV_FILE}"
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
: "${REMOTE_WORKSPACE_CONFIG_DIR:?REMOTE_WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"

[ "$#" = "0" ] || { echo "[错误] prepare-database-replacement.sh 不接受参数"; exit 2; }
[ -f "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] 本地数据库环境文件不存在: $RELEASE_CI_ENV_FILE"; exit 1; }
[ -z "$(git -C "$RELEASE_WORKTREE" status --short)" ] || {
  echo "[错误] release worktree 存在未提交改动，拒绝冻结整库替换输入"
  git -C "$RELEASE_WORKTREE" status --short
  exit 1
}

SOURCE_SHA="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)"
candidate_identity="$(node "$RELEASE_WORKTREE/ops/release/candidate/identity.mjs" capture --repository "$RELEASE_WORKTREE" --revision HEAD)"
SOURCE_TREE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.treeId)' "$candidate_identity")"
SOURCE_CONTENT_DIGEST="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.contentDigest)' "$candidate_identity")"
ready_json="$(node "$RELEASE_WORKTREE/ops/release/readiness/ready-artifact.mjs" current \
  --root "$RELEASE_WORKTREE/.cache/release-ready")"
node - "$ready_json" "$SOURCE_SHA" "$SOURCE_TREE" "$SOURCE_CONTENT_DIGEST" <<'NODE'
const receipt = JSON.parse(process.argv[2]).receipt;
if (receipt?.status !== 'ready'
  || receipt.source?.commitSha !== process.argv[3]
  || receipt.source?.treeId !== process.argv[4]
  || receipt.source?.contentDigest !== process.argv[5]
  || receipt.target?.id !== 'monolith') {
  throw new Error('database replacement requires the current monolith Ready Artifact');
}
NODE

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[错误] 本地 3000 仍在运行；整库替换快照前必须停止本地 Workspace writer" >&2
  exit 1
fi

for command_name in pg_dump pg_restore psql rsync ssh; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "[错误] 缺少命令: $command_name"; exit 1; }
done

set -a
# shellcheck source=/dev/null
source "$RELEASE_CI_ENV_FILE"
set +a
: "${DIRECT_URL:?DIRECT_URL missing from $RELEASE_CI_ENV_FILE}"
case "$DIRECT_URL" in postgres://*|postgresql://*) ;; *) echo "[错误] DIRECT_URL 必须使用 PostgreSQL"; exit 1 ;; esac

echo "==> 校验本地数据库 migration 与候选 source 完全一致..."
node "$RELEASE_WORKTREE/scripts/check/check-prisma-deploy-status.js" \
  --database-url "$DIRECT_URL" \
  --migrations-dir "$RELEASE_WORKTREE/prisma/migrations"

active_sessions="$(psql "$DIRECT_URL" -XAtqc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")"
[ "$active_sessions" = "0" ] || { echo "[错误] 本地数据库仍有 $active_sessions 个其他会话，拒绝冻结 dump"; exit 1; }

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/workspace-database-replacement.XXXXXX")"
TMP_KEY=""
cleanup() { rm -rf "$TMP_DIR"; rm -f "${TMP_KEY:-}"; }
trap cleanup EXIT
umask 077

TMP_DUMP="$TMP_DIR/workspace-postgresql.dump"
TMP_RECEIPT="$TMP_DIR/receipt.json"
echo "==> 生成本地 PostgreSQL custom dump..."
pg_dump --format=custom --no-owner --no-privileges --file="$TMP_DUMP" "$DIRECT_URL"
pg_restore --list "$TMP_DUMP" >/dev/null
node "$RELEASE_WORKTREE/ops/database-replacement.mjs" create \
  --source "$SOURCE_SHA" \
  --tree "$SOURCE_TREE" \
  --dump "$TMP_DUMP" \
  --repository-root "$RELEASE_WORKTREE" \
  --output "$TMP_RECEIPT"
node "$RELEASE_WORKTREE/ops/database-replacement.mjs" verify \
  --source "$SOURCE_SHA" --tree "$SOURCE_TREE" --file "$TMP_RECEIPT" --dump "$TMP_DUMP"

REMOTE_ARTIFACT="$(node -p "require(process.argv[1]).dump.remoteArtifact" "$TMP_RECEIPT")"
DUMP_SHA="$(node -p "require(process.argv[1]).dump.sha256" "$TMP_RECEIPT")"
DUMP_SIZE="$(node -p "require(process.argv[1]).dump.sizeBytes" "$TMP_RECEIPT")"
LOCAL_FINAL_DIR="$WORKSPACE_CONFIG_DIR/database-replacements/$(dirname "$REMOTE_ARTIFACT")"
LOCAL_FINAL_DUMP="$WORKSPACE_CONFIG_DIR/database-replacements/$REMOTE_ARTIFACT"
LOCAL_FINAL_RECEIPT="$LOCAL_FINAL_DIR/receipt.json"
mkdir -p "$LOCAL_FINAL_DIR" "$(dirname "$RECEIPT_FILE")"
chmod 700 "$WORKSPACE_CONFIG_DIR/database-replacements" "$WORKSPACE_CONFIG_DIR/database-replacements/$SOURCE_SHA" "$LOCAL_FINAL_DIR"
if [ -f "$LOCAL_FINAL_DUMP" ] || [ -f "$LOCAL_FINAL_RECEIPT" ]; then
  [ -f "$LOCAL_FINAL_DUMP" ] && [ -f "$LOCAL_FINAL_RECEIPT" ] || { echo "[错误] 本地不可变数据库替换目录不完整"; exit 1; }
  node "$RELEASE_WORKTREE/ops/database-replacement.mjs" verify \
    --source "$SOURCE_SHA" --tree "$SOURCE_TREE" --file "$LOCAL_FINAL_RECEIPT" --dump "$LOCAL_FINAL_DUMP"
else
  mv "$TMP_DUMP" "$LOCAL_FINAL_DUMP"
  mv "$TMP_RECEIPT" "$LOCAL_FINAL_RECEIPT"
fi
cp "$LOCAL_FINAL_RECEIPT" "$RECEIPT_FILE.tmp"
chmod 600 "$RECEIPT_FILE.tmp"
mv "$RECEIPT_FILE.tmp" "$RECEIPT_FILE"

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
REMOTE_ROOT="$REMOTE_WORKSPACE_CONFIG_DIR/deploy-inputs/database-replacements"
REMOTE_FINAL_DIR="$REMOTE_ROOT/$(dirname "$REMOTE_ARTIFACT")"
REMOTE_FINAL_DUMP="$REMOTE_ROOT/$REMOTE_ARTIFACT"
REMOTE_FINAL_RECEIPT="$REMOTE_FINAL_DIR/receipt.json"
REMOTE_INCOMING="$REMOTE_ROOT/.incoming-${SOURCE_SHA:0:12}-${DUMP_SHA:0:12}-$$"

echo "==> 上传不可变数据库替换输入到生产暂存区..."
# The remote paths are resolved locally from the private deployment config; source and digest suffixes are validated.
# shellcheck disable=SC2029
ssh "${SSH_OPTIONS[@]}" "$SERVER" "set -e; umask 077; mkdir -p '$REMOTE_ROOT' '$REMOTE_INCOMING'; chmod 700 '$REMOTE_ROOT' '$REMOTE_INCOMING'"
rsync -az -e "$RSYNC_SSH" "$LOCAL_FINAL_DUMP" "$SERVER:$REMOTE_INCOMING/workspace-postgresql.dump"
rsync -az -e "$RSYNC_SSH" "$LOCAL_FINAL_RECEIPT" "$SERVER:$REMOTE_INCOMING/receipt.json"
# shellcheck disable=SC2029
ssh "${SSH_OPTIONS[@]}" "$SERVER" "set -euo pipefail
  incoming='$REMOTE_INCOMING'
  final_dir='$REMOTE_FINAL_DIR'
  dump=\"\$incoming/workspace-postgresql.dump\"
  receipt=\"\$incoming/receipt.json\"
  test -f \"\$dump\" -a -f \"\$receipt\"
  test \"\$(stat -c '%s' \"\$dump\")\" = '$DUMP_SIZE'
  actual=\$(sha256sum \"\$dump\" | awk '{print \$1}')
  test \"\$actual\" = '$DUMP_SHA'
  pg_restore --list \"\$dump\" >/dev/null
  if [ -d \"\$final_dir\" ]; then
    test -f '$REMOTE_FINAL_DUMP' -a -f '$REMOTE_FINAL_RECEIPT'
    test \"\$(stat -c '%s' '$REMOTE_FINAL_DUMP')\" = '$DUMP_SIZE'
    test \"\$(sha256sum '$REMOTE_FINAL_DUMP' | awk '{print \$1}')\" = '$DUMP_SHA'
    cmp \"\$receipt\" '$REMOTE_FINAL_RECEIPT'
    rm -rf \"\$incoming\"
  else
    mkdir -p \"\$(dirname \"\$final_dir\")\"
    mv \"\$incoming\" \"\$final_dir\"
  fi
  chmod 700 \"\$final_dir\"
  chmod 600 '$REMOTE_FINAL_DUMP' '$REMOTE_FINAL_RECEIPT'"

echo "==> 数据库替换候选已冻结并上传"
echo "    source: $SOURCE_SHA"
echo "    dump:   $DUMP_SHA ($DUMP_SIZE bytes)"
echo "    receipt: $RECEIPT_FILE"
