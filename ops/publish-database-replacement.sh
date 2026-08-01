#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
: "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
RECEIPT_FILE="${DATABASE_REPLACEMENT_RECEIPT_FILE:-$RELEASE_WORKTREE/.cache/release-check/database-replacement.json}"

COMMAND="${1:-}"
[ -n "$COMMAND" ] && shift

case "$COMMAND" in
  ci)
    [ "$#" = "0" ] || { echo "[错误] database-replace ci 不接受额外参数"; exit 2; }
    OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/publish.sh" ci
    OPS_ENV_FILE="$OPS_ENV_FILE" DATABASE_REPLACEMENT_RECEIPT_FILE="$RECEIPT_FILE" \
      "$SCRIPT_DIR/prepare-database-replacement.sh"
    ;;
  deploy)
    [ "$#" = "0" ] || { echo "[错误] database-replace deploy 不接受额外参数"; exit 2; }
    exec env OPS_ENV_FILE="$OPS_ENV_FILE" DATABASE_REPLACEMENT_RECEIPT_FILE="$RECEIPT_FILE" \
      "$SCRIPT_DIR/publish.sh" deploy
    ;;
  status)
    [ "$#" = "0" ] || { echo "[错误] database-replace status 不接受额外参数"; exit 2; }
    [ -f "$RECEIPT_FILE" ] || { echo "not_prepared"; exit 0; }
    source_sha="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)"
    source_tree="$(git -C "$RELEASE_WORKTREE" rev-parse 'HEAD^{tree}')"
    node "$RELEASE_WORKTREE/ops/database-replacement.mjs" verify \
      --source "$source_sha" --tree "$source_tree" --file "$RECEIPT_FILE"
    echo "prepared $RECEIPT_FILE"
    ;;
  -h|--help|"")
    cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace ci
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace deploy
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace status

ci 先签发代码 Ready Artifact，再从已停写的本地 PostgreSQL 生成、校验并上传同 source/tree 的不可变 dump。
deploy 只消费 Ready Artifact 和整库替换回执，并在服务器数据库阶段执行原子整库替换。
EOF
    ;;
  *) echo "[错误] database-replace 命令必须是 ci、deploy 或 status"; exit 2 ;;
esac
