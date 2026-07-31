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
  OPS_ENV_FILE=/path/to/ops/.env publish.sh prepare
  OPS_ENV_FILE=/path/to/ops/.env publish.sh validate [--local] [部署目标或回执修复选项]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy [--direct] [CNB 部署选项]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh database-replace prepare|validate|deploy|status
  OPS_ENV_FILE=/path/to/ops/.env publish.sh data upload|verify|status --id RELEASE_ID
  OPS_ENV_FILE=/path/to/ops/.env publish.sh timing pause|resume|status

模式:
  push           只推送当前已提交候选；共享工作区的未提交内容不参与
  prepare        冻结 release tree 并校验私有配置，生成 CNB 候选回执；不在本机编译
  validate       对候选内容运行一次全量源码 CI 与一次制品编译并冻结制品
  deploy         仅消费同一 content/tree 的已验证制品；可走 CNB 或 --direct
  data           校验并上传私有数据发布源；上传只进入受控暂存区，不执行数据库写入
  timing         在处理 main 前暂停 Ops 计时；恢复 release 工作时继续累计

一次性历史修复:
  validate/deploy 可传 --recover-local-receipt-base SHA。仅当生产 schema-v3 local 回执把
  injection SHA 误记为 source，且该基线 migration 集合与生产回执完全一致时接受。

说明:
  main 只提供候选提交，Full 与单模块发布都只在 release worktree 执行。
EOF
}

initialize_release_worktree() {
  RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
  : "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
  RELEASE_CI_ENV_FILE="${RELEASE_CI_ENV_FILE:-${SOURCE_DIR:-}/.env}"
  : "${RELEASE_CI_ENV_FILE:?RELEASE_CI_ENV_FILE not set in $OPS_ENV_FILE}"
  [ -f "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] release CI 环境文件不存在: $RELEASE_CI_ENV_FILE"; exit 1; }

  release_env_target="$RELEASE_WORKTREE/.env"
  if [ -L "$release_env_target" ]; then
    [ "$(readlink "$release_env_target")" = "$RELEASE_CI_ENV_FILE" ] || {
      echo "[错误] release .env 未指向受控 CI 环境文件"; exit 1;
    }
  elif [ -e "$release_env_target" ]; then
    echo "[错误] release .env 必须是指向受控 CI 环境文件的符号链接"
    exit 1
  else
    ln -s "$RELEASE_CI_ENV_FILE" "$release_env_target"
  fi

  RELEASE_SCRIPT_DIR="$RELEASE_WORKTREE/ops"
  [ -x "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" ] || {
    echo "[错误] release worktree 缺少可执行的候选选择器"; exit 1;
  }
}

capture_release_identity() {
  RELEASE_SOURCE_SHA="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)"
  candidate_identity="$(node "$RELEASE_WORKTREE/ops/release/candidate/identity.mjs" capture \
    --repository "$RELEASE_WORKTREE" --revision HEAD)"
  RELEASE_SOURCE_TREE="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.treeId)' "$candidate_identity")"
  RELEASE_CONTENT_DIGEST="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.contentDigest)' "$candidate_identity")"
  export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST
}

prepare_release_worktree() {
  initialize_release_worktree
  "$SCRIPT_DIR/promote-release-branch.sh" promote
  capture_release_identity
}

load_prepared_release_worktree() {
  initialize_release_worktree
  "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" verify
  capture_release_identity
}

validate_local_release_inputs() {
  WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
  : "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
  CNB_REAL_CNB_YML="${CNB_REAL_CNB_YML:-$WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml}"
  [ -f "$CNB_REAL_CNB_YML" ] || { echo "[错误] 真实 CNB 配置文件不存在: $CNB_REAL_CNB_YML"; exit 1; }
  node "$RELEASE_SCRIPT_DIR/validate-cnb-release-config.mjs" "$CNB_REAL_CNB_YML"
  OPS_ENV_FILE="$OPS_ENV_FILE" WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" \
    "$RELEASE_SCRIPT_DIR/sync-tenant-config.sh" --dry-run --source-sha "$RELEASE_SOURCE_SHA"
  (
    cd "$RELEASE_WORKTREE"
    WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" npm run docs:permission-actions:check
  )
}

case "${1:-}" in
  prepare)
    shift
    [ "$#" = "0" ] || { echo "[错误] prepare 不接受额外参数"; exit 2; }
    prepare_release_worktree
    validate_local_release_inputs
    RELEASE_CANDIDATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/release-candidate.json"
    if node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null 2>&1; then
      echo "==> 复用当前 tree 的 CNB 候选回执；本机未运行编译或 E2E。"
      exit 0
    fi
    rm -f "$RELEASE_CANDIDATE_RECEIPT_FILE"
    mkdir -p "$(dirname "$RELEASE_CANDIDATE_RECEIPT_FILE")"
    node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-create \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --output "$RELEASE_CANDIDATE_RECEIPT_FILE"
    node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null
    echo "==> prepare 完成：候选与私有配置已冻结；下一步选择 validate --local 或 CNB validate。"
    exit 0
    ;;
  data)
    shift
    exec "$SCRIPT_DIR/upload-data-release.sh" "$@"
    ;;
  database-replace)
    shift
    exec "$SCRIPT_DIR/publish-database-replacement.sh" "$@"
    ;;
  timing)
    shift
    RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
    : "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
    RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-$RELEASE_WORKTREE/.cache/release-process-timing.json}"
    case "${1:-}" in
      pause) timing_command=pause ;;
      resume) timing_command=resume ;;
      status) timing_command=snapshot ;;
      *) echo "[错误] timing 需要 pause、resume 或 status"; usage; exit 2 ;;
    esac
    node "$SCRIPT_DIR/release-process-timing.mjs" "$timing_command" --file "$RELEASE_PROCESS_TIMING_FILE"
    exit 0
    ;;
esac

case "${1:-}" in
  deploy|validate)
    release_action="$1"
    shift
    load_prepared_release_worktree
    validate_local_release_inputs
    RELEASE_CANDIDATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/release-candidate.json"
    if ! node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null; then
      echo "[错误] 当前 release tree 没有有效 prepare 回执；拒绝进入 CNB。" >&2
      echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare" >&2
      exit 1
    fi
    export RELEASE_CANDIDATE_RECEIPT_FILE
    RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-$RELEASE_WORKTREE/.cache/release-process-timing.json}"
    deploy_args=(--release-action "$release_action")
    if [ "$release_action" = "validate" ] && [ "${1:-}" = "--local" ]; then
      deploy_args+=(--direct)
      shift
    fi
    deploy_args+=("$@")
    candidate_sha="$RELEASE_SOURCE_SHA"
    if [ -f "$RELEASE_PROCESS_TIMING_FILE" ]; then
      node "$RELEASE_SCRIPT_DIR/release-process-timing.mjs" resume --file "$RELEASE_PROCESS_TIMING_FILE" >/dev/null
    fi
    release_session="$(node "$RELEASE_SCRIPT_DIR/release-process-timing.mjs" begin \
      --file "$RELEASE_PROCESS_TIMING_FILE" \
      --repository-root "$RELEASE_WORKTREE" \
      --source-sha "$candidate_sha")"
    export RELEASE_PROCESS_TIMING_FILE
    node -e '
      const session = JSON.parse(process.argv[1]);
      console.log(`==> release 流程计时：第 ${session.releaseAttemptCount} 次尝试，完整累计 ${session.releaseProcessSeconds}s`);
    ' "$release_session"
    exec "$RELEASE_SCRIPT_DIR/publish-cnb.sh" "${deploy_args[@]}"
    ;;
esac

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
DEVELOPMENT_BRANCH="${DEVELOPMENT_BRANCH:-main}"

GITHUB_REMOTE_NAME="${GITHUB_REMOTE:-origin}"
GITHUB_HTTPS_PROXY="${GITHUB_HTTPS_PROXY-http://127.0.0.1:7897}"
PROMOTION_REVIEW_SECONDS="${PROMOTION_REVIEW_SECONDS:-600}"

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
  *) echo "[错误] 请指定模式: push、prepare、validate 或 deploy"; usage; exit 1 ;;
esac
[ "$#" = "0" ] || { echo "[错误] push 不接受额外参数"; exit 1; }

case "$PROMOTION_REVIEW_SECONDS" in
  ''|*[!0-9]*) echo "[错误] PROMOTION_REVIEW_SECONDS 必须是正整数"; exit 1 ;;
esac
[ "$PROMOTION_REVIEW_SECONDS" -ge 1 ] || { echo "[错误] PROMOTION_REVIEW_SECONDS 必须至少为 1"; exit 1; }

cd "$SOURCE_DIR"
echo "==> 候选固定为已提交 HEAD；未暂存、已暂存和未跟踪工作区内容全部忽略。"

command -v gh >/dev/null 2>&1 || { echo "[错误] 未找到 gh CLI；push 需要 GitHub PR/CI 能力"; exit 1; }

echo "==> 拉取 GitHub $DEVELOPMENT_BRANCH..."
with_github_proxy git fetch "$GITHUB_REMOTE_NAME" "$DEVELOPMENT_BRANCH"
remote_main_sha="$(git rev-parse "$GITHUB_REMOTE_NAME/$DEVELOPMENT_BRANCH")"
head_sha="$(git rev-parse HEAD)"
github_repository="${GITHUB_REPOSITORY:-$(with_github_proxy gh repo view --json nameWithOwner --jq .nameWithOwner)}"

if ! git merge-base --is-ancestor "$remote_main_sha" "$head_sha"; then
  echo "[错误] 当前提交不是 GitHub $DEVELOPMENT_BRANCH 的快进候选；请先同步主分支"
  exit 1
fi

staging_branch="codex/staging-main"
candidate_branch="codex/candidate-main"
staging_before="$(with_github_proxy git ls-remote --heads "$GITHUB_REMOTE_NAME" "refs/heads/$staging_branch" | awk '{print $1}')"
echo "==> 更新稳定 staging ref ${staging_branch}；源码门禁由远端 base/head affected CI 执行..."
WORKSPACE_DIFF_BASE="$remote_main_sha" \
WORKSPACE_DIFF_HEAD="$head_sha" \
  with_github_proxy git push "$GITHUB_REMOTE_NAME" \
    --force-with-lease="refs/heads/$staging_branch:$staging_before" \
    "HEAD:refs/heads/$staging_branch"

minimum_promotion_run_id="$(with_github_proxy gh api \
  "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${DEVELOPMENT_BRANCH}&event=workflow_dispatch&per_page=100" \
  --jq '[.workflow_runs[].id] | max // 0')"
with_github_proxy gh workflow run promote-candidate.yml \
  --repo "$github_repository" \
  --ref "$DEVELOPMENT_BRANCH" \
  -f staging_branch="$staging_branch" \
  -f staging_sha="$head_sha" \
  -f base_sha="$remote_main_sha"

echo "==> 等待受信任 main workflow 创建 bot PR 并显式触发 candidate CI；${PROMOTION_REVIEW_SECONDS}s 后只提示复查。"
promotion_review_at=$(( $(date +%s) + PROMOTION_REVIEW_SECONDS ))
promotion_review_sent=0
promotion_run_id=""
while [ -z "$promotion_run_id" ]; do
  promotion_run_id="$(with_github_proxy gh api \
    "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${DEVELOPMENT_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq "[.workflow_runs[] | select(.id > $minimum_promotion_run_id and .head_sha == \"$remote_main_sha\")] | sort_by(.id) | last | .id // empty")"
  [ -z "$promotion_run_id" ] || break
  if [ "$promotion_review_sent" = "0" ] && [ "$(date +%s)" -ge "$promotion_review_at" ]; then
    echo "[提示] Promote candidate 启动等待超过软复查阈值；Agent 应检查 workflow 排队、权限和触发条件，当前流程继续等待。" >&2
    promotion_review_sent=1
  fi
  sleep 2
done

with_github_proxy gh run watch "$promotion_run_id" --repo "$github_repository" --exit-status --interval 5
pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
echo "==> bot PR 已就绪: $pr_url"
echo "==> push 完成：candidate CI 已触发；未推 CNB、未触发生产部署。"
