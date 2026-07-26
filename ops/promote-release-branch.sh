#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"
SOURCE_DIR="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
RELEASE_PROMOTION_BRANCH="${RELEASE_PROMOTION_BRANCH:-main}"

cd "$SOURCE_DIR"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$RELEASE_BRANCH" ]; then
  echo "[错误] release worktree 当前分支是 $current_branch，必须是 $RELEASE_BRANCH"
  exit 1
fi
if [ -n "$(git status --short)" ]; then
  echo "[错误] release worktree 存在未提交改动"
  git status --short
  exit 1
fi

git show-ref --verify --quiet "refs/heads/$RELEASE_PROMOTION_BRANCH" || {
  echo "[错误] 本地候选分支不存在: $RELEASE_PROMOTION_BRANCH"
  exit 1
}

release_sha="$(git rev-parse "$RELEASE_BRANCH")"
candidate_sha="$(git rev-parse "$RELEASE_PROMOTION_BRANCH")"
if [ "$release_sha" = "$candidate_sha" ]; then
  echo "==> release 已对齐 $RELEASE_PROMOTION_BRANCH: ${release_sha:0:12}"
  exit 0
fi
if ! git merge-base --is-ancestor "$release_sha" "$candidate_sha"; then
  echo "[错误] $RELEASE_BRANCH 无法快进到 $RELEASE_PROMOTION_BRANCH；拒绝创建合并提交或覆盖 release 历史"
  exit 1
fi

echo "==> 快进 $RELEASE_BRANCH: ${release_sha:0:12} -> ${candidate_sha:0:12} ($RELEASE_PROMOTION_BRANCH)"
git merge --ff-only "$RELEASE_PROMOTION_BRANCH"
