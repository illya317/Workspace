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
  OPS_ENV_FILE=/path/to/ops/.env publish.sh prepare --deploy-unit UNIT
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy [CNB 部署选项]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh data upload|verify|status --id RELEASE_ID
  OPS_ENV_FILE=/path/to/ops/.env publish.sh timing pause|resume|status

模式:
  push           对当前提交跑自适应本地 gate；GitHub bot 创建候选 PR
  prepare        Full 运行完整 CI/E2E；单 unit 运行共享门禁和目标闭包/E2E；生成作用域回执
  deploy         只消费 prepare 回执，执行 Full 或单模块 CNB 部署；不运行编译或测试
  data           校验并上传私有数据发布源；上传只进入受控暂存区，不执行数据库写入
  timing         在处理 main 前暂停 Ops 计时；恢复 release 工作时继续累计

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
  RELEASE_SOURCE_TREE="$(git -C "$RELEASE_WORKTREE" rev-parse 'HEAD^{tree}')"
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
}

configure_release_gate_target() {
  RELEASE_TARGET_UNIT_ID="${1:-}"
  if [ -z "$RELEASE_TARGET_UNIT_ID" ]; then
    LOCAL_RELEASE_GATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/local-release-gate.json"
    LOCAL_RELEASE_GATE_VERIFY_ARGS=(--scope full)
    return
  fi
  if ! printf '%s' "$RELEASE_TARGET_UNIT_ID" | grep -Eq '^[a-z][a-z0-9-]*$'; then
    echo "[错误] deploy unit id 无效: $RELEASE_TARGET_UNIT_ID" >&2
    exit 2
  fi
  LOCAL_RELEASE_GATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/units/$RELEASE_TARGET_UNIT_ID.json"
  LOCAL_RELEASE_GATE_VERIFY_ARGS=(--scope unit --unit "$RELEASE_TARGET_UNIT_ID")
}

parse_prepare_target() {
  case "$#:${1:-}" in
    0:) RELEASE_TARGET_UNIT_ID="" ;;
    2:--deploy-unit|2:--shadow-unit) RELEASE_TARGET_UNIT_ID="$2" ;;
    *) echo "[错误] prepare 只接受可选 --deploy-unit UNIT 或 --shadow-unit UNIT"; exit 2 ;;
  esac
}

detect_deploy_target() {
  local unit_id=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --deploy-unit|--shadow-unit)
        [ -z "$unit_id" ] || { echo "[错误] 只能指定一个单元部署目标"; exit 2; }
        shift
        unit_id="${1:-}"
        [ -n "$unit_id" ] || { echo "[错误] 单元部署选项缺少 unit id"; exit 2; }
        ;;
    esac
    shift
  done
  configure_release_gate_target "$unit_id"
}

case "${1:-}" in
  prepare)
    shift
    parse_prepare_target "$@"
    prepare_release_worktree
    validate_local_release_inputs
    configure_release_gate_target "$RELEASE_TARGET_UNIT_ID"
    if node "$RELEASE_SCRIPT_DIR/local-release-gate-receipt.mjs" verify \
      --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" \
      "${LOCAL_RELEASE_GATE_VERIFY_ARGS[@]}" \
      --file "$LOCAL_RELEASE_GATE_RECEIPT_FILE" >/dev/null 2>&1; then
      if [ -n "$RELEASE_TARGET_UNIT_ID" ]; then
        echo "==> 复用当前 tree 已通过的 $RELEASE_TARGET_UNIT_ID 单元 prepare 回执；未重复运行检查或构建。"
      else
        echo "==> 复用当前 tree 已通过的完整 CI + E2E prepare 回执；未重复运行检查。"
      fi
      exit 0
    fi
    rm -f "$LOCAL_RELEASE_GATE_RECEIPT_FILE"
    if [ -n "$RELEASE_TARGET_UNIT_ID" ]; then
      LOCAL_UNIT_CI_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/units/$RELEASE_TARGET_UNIT_ID-base.json"
      mkdir -p "$(dirname "$LOCAL_UNIT_CI_RECEIPT_FILE")"
      rm -f "$LOCAL_UNIT_CI_RECEIPT_FILE"
      echo "==> 校验当前 release tree 的发布协议与 $RELEASE_TARGET_UNIT_ID 私有源码；类型与 Next build 由目标闭包接管..."
      (
        cd "$RELEASE_WORKTREE"
        node scripts/check/with-check-lock.js -- \
          node scripts/ci/run-local-unit-ci.mjs \
            --unit "$RELEASE_TARGET_UNIT_ID" \
            --output "$LOCAL_UNIT_CI_RECEIPT_FILE"
      )
      echo "==> 使用隔离 cache 构建并验证 $RELEASE_TARGET_UNIT_ID standalone 与目标 E2E..."
      WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" \
      LOCAL_UNIT_CI_RECEIPT_FILE="$LOCAL_UNIT_CI_RECEIPT_FILE" \
        "$RELEASE_WORKTREE/ops/local-release-gate.sh" \
          --receipt "$LOCAL_RELEASE_GATE_RECEIPT_FILE" \
          --deploy-unit "$RELEASE_TARGET_UNIT_ID"
    else
      echo "==> 聚合运行当前 release tree 的完整 CI；本轮会继续收集所有独立失败..."
      (
        cd "$RELEASE_WORKTREE"
        NEXT_PUBLIC_BUILD_VERSION="$RELEASE_SOURCE_SHA" BUILD_VERSION="$RELEASE_SOURCE_SHA" npm run check:ci
      )
      echo "==> 复用已验证 production build，运行一次性数据库迁移/seed 与全量 E2E..."
      WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" \
        "$RELEASE_WORKTREE/ops/local-release-gate.sh" --receipt "$LOCAL_RELEASE_GATE_RECEIPT_FILE"
    fi
    node "$RELEASE_SCRIPT_DIR/local-release-gate-receipt.mjs" verify \
      --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" \
      "${LOCAL_RELEASE_GATE_VERIFY_ARGS[@]}" \
      --file "$LOCAL_RELEASE_GATE_RECEIPT_FILE" >/dev/null
    if [ -n "$RELEASE_TARGET_UNIT_ID" ]; then
      echo "==> prepare 完成：当前 tree 的 $RELEASE_TARGET_UNIT_ID 闭包与目标 E2E 已通过；未连接 CNB，未触发生产部署。"
    else
      echo "==> prepare 完成：当前 tree 已通过完整 CI + E2E；未连接 CNB，未触发生产部署。"
    fi
    exit 0
    ;;
  data)
    shift
    exec "$SCRIPT_DIR/upload-data-release.sh" "$@"
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
  deploy)
    shift
    deploy_args=("$@")
    load_prepared_release_worktree
    validate_local_release_inputs
    detect_deploy_target "${deploy_args[@]}"
    if ! node "$RELEASE_SCRIPT_DIR/local-release-gate-receipt.mjs" verify \
      --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" \
      "${LOCAL_RELEASE_GATE_VERIFY_ARGS[@]}" \
      --file "$LOCAL_RELEASE_GATE_RECEIPT_FILE" >/dev/null; then
      echo "[错误] 当前 release tree 没有有效 prepare 回执；拒绝进入 CNB。" >&2
      if [ -n "$RELEASE_TARGET_UNIT_ID" ]; then
        echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare --deploy-unit $RELEASE_TARGET_UNIT_ID" >&2
      else
        echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare" >&2
      fi
      exit 1
    fi
    export LOCAL_RELEASE_GATE_RECEIPT_FILE
    RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-$RELEASE_WORKTREE/.cache/release-process-timing.json}"
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
    if [ "${#deploy_args[@]}" -eq 0 ]; then
      exec "$RELEASE_SCRIPT_DIR/publish-cnb.sh"
    fi
    exec "$RELEASE_SCRIPT_DIR/publish-cnb.sh" "${deploy_args[@]}"
    ;;
esac

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
DEVELOPMENT_BRANCH="${DEVELOPMENT_BRANCH:-main}"

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
  *) echo "[错误] 请指定模式: push、prepare 或 deploy"; usage; exit 1 ;;
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
echo "==> 运行候选提交的自适应本地 gate 并更新稳定 staging ref $staging_branch..."
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

echo "==> 等待受信任 main workflow 创建 bot PR 并显式触发 candidate CI..."
promotion_deadline=$(( $(date +%s) + PROMOTION_WAIT_SECONDS ))
promotion_run_id=""
while [ "$(date +%s)" -le "$promotion_deadline" ]; do
  promotion_run_id="$(with_github_proxy gh api \
    "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${DEVELOPMENT_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq "[.workflow_runs[] | select(.id > $minimum_promotion_run_id and .head_sha == \"$remote_main_sha\")] | sort_by(.id) | last | .id // empty")"
  [ -z "$promotion_run_id" ] || break
  sleep 2
done
[ -n "$promotion_run_id" ] || { echo "[错误] 等待 Promote candidate workflow 启动超时"; exit 1; }

with_github_proxy gh run watch "$promotion_run_id" --repo "$github_repository" --exit-status --interval 5
pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
echo "==> bot PR 已就绪: $pr_url"
echo "==> push 完成：candidate CI 已触发；未推 CNB、未触发生产部署。"
