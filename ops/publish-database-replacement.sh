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
  prepare)
    [ "$#" = "0" ] || { echo "[错误] database-replace prepare 不接受额外参数"; exit 2; }
    OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/publish.sh" prepare
    OPS_ENV_FILE="$OPS_ENV_FILE" DATABASE_REPLACEMENT_RECEIPT_FILE="$RECEIPT_FILE" \
      "$SCRIPT_DIR/prepare-database-replacement.sh"
    ;;
  validate)
    exec env OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/publish.sh" validate "$@"
    ;;
  deploy)
    exec env OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/publish.sh" deploy \
      --database-replacement-receipt "$RECEIPT_FILE" "$@"
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
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace prepare
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace validate [--local]
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace deploy
  OPS_ENV_FILE=/path/to/private/.env ops/publish.sh database-replace status

prepare 复用普通候选冻结，再从已停写的本地 PostgreSQL 生成、校验并上传不可变 dump。
validate 对 Git base/head 的受影响依赖闭包验证一次并冻结 Full artifact；可用 --local。
deploy 只消费该 artifact，并在服务器数据库阶段执行原子整库替换。
EOF
    ;;
  *) echo "[错误] database-replace 命令必须是 prepare、validate、deploy 或 status"; exit 2 ;;
esac
