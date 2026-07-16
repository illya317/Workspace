#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops/.env publish.sh push
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy [选项]

模式:
  push     更新 GitHub staging ref，由受信任 workflow 创建或更新候选 PR
  deploy   将当前已提交源码交给 CNB 独立检查、构建、打包和部署

说明:
  push 不直推 main 或 CNB，也不参与生产部署。
  deploy 不调用 GitHub；详细选项使用 publish.sh deploy --help 查看。
EOF
}

mode="${1:-}"
case "$mode" in
  deploy)
    exec "$SCRIPT_DIR/publish-cnb.sh" "$@"
    ;;
  push)
    shift
    if [ "$#" -ne 0 ]; then
      echo "[错误] push 模式不接受额外参数: $*"
      exit 1
    fi
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  '')
    echo "[错误] 请指定模式: push 或 deploy"
    usage
    exit 1
    ;;
  *)
    echo "[错误] 未知模式: $mode"
    usage
    exit 1
    ;;
esac

OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE"

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

case "$PROMOTION_WAIT_SECONDS" in
  ''|*[!0-9]*) echo "[错误] PROMOTION_WAIT_SECONDS 必须是正整数"; exit 1 ;;
esac
if [ "$PROMOTION_WAIT_SECONDS" -lt 1 ]; then
  echo "[错误] PROMOTION_WAIT_SECONDS 必须至少为 1"
  exit 1
fi

cd "$SOURCE_DIR"

dirty_status="$(git status --short)"
if [ -n "$dirty_status" ]; then
  echo "[错误] 工作区存在未提交改动，请先提交或清理："
  echo "$dirty_status"
  exit 1
fi

command -v gh >/dev/null 2>&1 || {
  echo "[错误] 未找到 gh CLI；push 模式需要 GitHub PR 能力"
  exit 1
}

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
  if [ -n "$promotion_run_id" ]; then break; fi
  sleep 2
done
if [ -z "$promotion_run_id" ]; then
  echo "[错误] 等待 Promote candidate workflow 启动超时"
  exit 1
fi

with_github_proxy gh run watch "$promotion_run_id" --repo "$github_repository" --exit-status --interval 5
pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
echo "==> bot PR 已就绪: $pr_url"
echo "==> push 完成：candidate CI 已触发；未推 CNB、未触发生产部署。"
