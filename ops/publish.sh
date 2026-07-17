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

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env publish.sh push
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy --full [CNB 部署选项]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh hotfix

模式:
  push           对当前提交跑自适应本地 gate；GitHub bot 创建候选 PR
  deploy         默认 hotfix；经 SSH 在服务器隔离构建并受治理切换
  deploy --full  显式完整部署；转交 CNB-native 发布入口
  hotfix         `deploy` 默认行为的显式别名

说明:
  只有用户明确指定 `deploy --full` 才会触发 CNB 完整部署。
EOF
}

case "${1:-}" in
  deploy)
    shift
    case "${1:-}" in
      "") exec "$SCRIPT_DIR/publish-hotfix.sh" ;;
      --full)
        shift
        exec "$SCRIPT_DIR/publish-cnb.sh" "$@"
        ;;
      -h|--help) usage; exit 0 ;;
      *) echo "[错误] deploy 默认为 hotfix；完整部署请显式使用 deploy --full"; usage; exit 1 ;;
    esac
    ;;
  hotfix)
    shift
    exec "$SCRIPT_DIR/publish-hotfix.sh" "$@"
    ;;
esac

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"

GITHUB_REMOTE_NAME="${GITHUB_REMOTE:-origin}"
GITHUB_HTTPS_PROXY="${GITHUB_HTTPS_PROXY-http://127.0.0.1:7897}"
PROMOTION_WAIT_SECONDS="${PROMOTION_WAIT_SECONDS:-600}"

with_github_proxy() {
  if [ -n "$GITHUB_HTTPS_PROXY" ]; then
    HTTPS_PROXY="$GITHUB_HTTPS_PROXY" "$@"
  else
    "$@"
  fi
}

case "${1:-}" in
  push) shift ;;
  -h|--help) usage; exit 0 ;;
  *) echo "[错误] 请指定模式: push 或 deploy"; usage; exit 1 ;;
esac
[ "$#" = "0" ] || { echo "[错误] push 不接受额外参数"; exit 1; }

case "$PROMOTION_WAIT_SECONDS" in
  ''|*[!0-9]*) echo "[错误] PROMOTION_WAIT_SECONDS 必须是正整数"; exit 1 ;;
esac
[ "$PROMOTION_WAIT_SECONDS" -ge 1 ] || { echo "[错误] PROMOTION_WAIT_SECONDS 必须至少为 1"; exit 1; }

cd "$SOURCE_DIR"
dirty_status="$(git status --short)"
if [ -n "$dirty_status" ]; then
  echo "[错误] 工作区存在未提交改动，请先提交或清理："
  echo "$dirty_status"
  exit 1
fi

command -v gh >/dev/null 2>&1 || { echo "[错误] 未找到 gh CLI；push 需要 GitHub PR/CI 能力"; exit 1; }

echo "==> 拉取 GitHub $RELEASE_BRANCH..."
with_github_proxy git fetch "$GITHUB_REMOTE_NAME" "$RELEASE_BRANCH"
remote_main_sha="$(git rev-parse "$GITHUB_REMOTE_NAME/$RELEASE_BRANCH")"
head_sha="$(git rev-parse HEAD)"
github_repository="${GITHUB_REPOSITORY:-$(with_github_proxy gh repo view --json nameWithOwner --jq .nameWithOwner)}"

if ! git merge-base --is-ancestor "$remote_main_sha" "$head_sha"; then
  echo "[错误] 当前提交不是 GitHub $RELEASE_BRANCH 的快进候选；请先同步主分支"
  exit 1
fi

staging_branch="codex/staging-main"
candidate_branch="codex/candidate-main"
staging_before="$(with_github_proxy git ls-remote --heads "$GITHUB_REMOTE_NAME" "refs/heads/$staging_branch" | awk '{print $1}')"
echo "==> 运行候选提交的自适应本地 gate 并更新稳定 staging ref $staging_branch..."
WORKSPACE_DIFF_BASE="$remote_main_sha" \
WORKSPACE_DIFF_HEAD="$head_sha" \
  with_github_proxy git push "$GITHUB_REMOTE_NAME" \
    --force-with-lease="refs/heads/$staging_branch:$staging_before" \
    "HEAD:refs/heads/$staging_branch"

minimum_promotion_run_id="$(with_github_proxy gh api \
  "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${RELEASE_BRANCH}&event=workflow_dispatch&per_page=100" \
  --jq '[.workflow_runs[].id] | max // 0')"
with_github_proxy gh workflow run promote-candidate.yml \
  --repo "$github_repository" \
  --ref "$RELEASE_BRANCH" \
  -f staging_branch="$staging_branch" \
  -f staging_sha="$head_sha" \
  -f base_sha="$remote_main_sha"

echo "==> 等待受信任 main workflow 创建 bot PR 并显式触发 candidate CI..."
promotion_deadline=$(( $(date +%s) + PROMOTION_WAIT_SECONDS ))
promotion_run_id=""
while [ "$(date +%s)" -le "$promotion_deadline" ]; do
  promotion_run_id="$(with_github_proxy gh api \
    "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${RELEASE_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq "[.workflow_runs[] | select(.id > $minimum_promotion_run_id and .head_sha == \"$remote_main_sha\")] | sort_by(.id) | last | .id // empty")"
  [ -z "$promotion_run_id" ] || break
  sleep 2
done
[ -n "$promotion_run_id" ] || { echo "[错误] 等待 Promote candidate workflow 启动超时"; exit 1; }

with_github_proxy gh run watch "$promotion_run_id" --repo "$github_repository" --exit-status --interval 5
pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
echo "==> bot PR 已就绪: $pr_url"
echo "==> push 完成：candidate CI 已触发；未推 CNB、未触发生产部署。"
