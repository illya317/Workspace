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
  OPS_ENV_FILE=/path/to/ops/.env publish.sh prepare [--fast REASON] [--cnb-from validate|build|deploy]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh prepare [--executor STAGE=local|cnb] [--new-plan]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh validate
  OPS_ENV_FILE=/path/to/ops/.env publish.sh build
  OPS_ENV_FILE=/path/to/ops/.env publish.sh deploy
  OPS_ENV_FILE=/path/to/ops/.env publish.sh status [--json]
  OPS_ENV_FILE=/path/to/ops/.env publish.sh database-replace prepare|validate|build|deploy|status
  OPS_ENV_FILE=/path/to/ops/.env publish.sh data upload|verify|status --id RELEASE_ID
  OPS_ENV_FILE=/path/to/ops/.env publish.sh timing pause|resume|status

模式:
  push           只推送当前已提交候选；共享工作区的未提交内容不参与
  prepare        冻结候选、私有配置摘要、发布模式、目标和执行器；默认全部 local
  validate       只运行一次全量源码 CI；成功、失败或快速跳过后均不可在同一 Plan 重开
  build          只编译并冻结一次目标 artifact；不重新运行 validate
  deploy         只消费同一 Plan 的验证状态和 artifact；不现场验证或编译
  status         显示当前 Plan 的单向进度表
  data           校验并上传私有数据发布源；上传只进入受控暂存区，不执行数据库写入
  timing         在处理 main 前暂停 Ops 计时；恢复 release 工作时继续累计

说明:
  --fast 必须记录原因；它把 validate 明确记为 skipped_by_fast，但 build 与生产安全切换仍必需。
  --cnb-from 从指定阶段起使用 CNB，且不允许从 CNB 回到 local；默认不走 CNB。
  完成的阶段直接复用回执。失败阶段也是终态，复盘后须显式 prepare --new-plan。
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

capture_release_configuration_identity() {
  WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
  : "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
  local tenant_root="$WORKSPACE_CONFIG_DIR/config/tenant"
  [ -d "$tenant_root" ] || { echo "[错误] 租户配置目录不存在: $tenant_root"; exit 1; }
  RELEASE_CONFIGURATION_DIGEST="$(node - "$tenant_root" <<'NODE'
const { createHash } = require('node:crypto');
const { lstatSync, readFileSync, readlinkSync, readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const hash = createHash('sha256');
function walk(directory) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      hash.update(`dir\0${relative}\0`);
      walk(absolute);
    } else if (stat.isSymbolicLink()) {
      hash.update(`link\0${relative}\0${readlinkSync(absolute)}\0`);
    } else if (stat.isFile()) {
      hash.update(`file\0${relative}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
    } else throw new Error(`unsupported tenant configuration entry: ${relative}`);
  }
}
walk(root);
process.stdout.write(hash.digest('hex'));
NODE
)"
  export RELEASE_CONFIGURATION_DIGEST
}

case "${1:-}" in
  prepare)
    shift
    release_mode=standard
    fast_reason=""
    prepare_executor=local
    validate_executor=local
    build_executor=local
    deploy_executor=local
    target_kind=monolith
    target_unit=""
    target_mode=""
    new_plan=0
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --fast) shift; fast_reason="${1:-}"; release_mode=fast ;;
        --standard) release_mode=standard; fast_reason="" ;;
        --new-plan) new_plan=1 ;;
        --cnb-from)
          shift
          case "${1:-}" in
            validate) validate_executor=cnb; build_executor=cnb; deploy_executor=cnb ;;
            build) build_executor=cnb; deploy_executor=cnb ;;
            deploy) deploy_executor=cnb ;;
            *) echo "[错误] --cnb-from 只能是 validate、build 或 deploy"; exit 2 ;;
          esac
          ;;
        --executor)
          shift
          assignment="${1:-}"
          stage="${assignment%%=*}"
          executor="${assignment#*=}"
          [ "$stage" != "$assignment" ] && { [ "$executor" = local ] || [ "$executor" = cnb ]; } \
            || { echo "[错误] --executor 格式必须是 STAGE=local|cnb"; exit 2; }
          case "$stage" in
            prepare) prepare_executor="$executor" ;;
            validate) validate_executor="$executor" ;;
            build) build_executor="$executor" ;;
            deploy) deploy_executor="$executor" ;;
            *) echo "[错误] 未知发布阶段: $stage"; exit 2 ;;
          esac
          ;;
        --deploy-unit|--shadow-unit)
          option="$1"; shift; target_unit="${1:-}"
          printf '%s' "$target_unit" | grep -Eq '^[a-z][a-z0-9-]*$' \
            || { echo "[错误] 单元 ID 无效: $target_unit"; exit 2; }
          target_kind=unit
          [ "$option" = "--deploy-unit" ] && target_mode=activate || target_mode=shadow
          ;;
        *) echo "[错误] prepare 未知参数: $1"; exit 2 ;;
      esac
      shift
    done
    [ "$release_mode" != fast ] || [ -n "$fast_reason" ] \
      || { echo "[错误] --fast 必须提供可审计原因"; exit 2; }
    prepare_release_worktree
    capture_release_configuration_identity
    RELEASE_CANDIDATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/release-candidate.json"
    RELEASE_PLAN_ROOT="${RELEASE_PLAN_ROOT:-$RELEASE_WORKTREE/.cache/release-plans}"
    candidate_receipt_valid=0
    if node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null 2>&1; then
      candidate_receipt_valid=1
    fi
    prior_snapshot=""
    if [ "$candidate_receipt_valid" = 1 ] \
      && prior_snapshot="$(node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" snapshot --root "$RELEASE_PLAN_ROOT" 2>/dev/null)" \
      && node -e 'const s=JSON.parse(process.argv[1]); const [sha,tree,content,config]=process.argv.slice(2); if(s.stages.prepare!=="succeeded" || s.plan.source.commitSha!==sha || s.plan.source.treeId!==tree || s.plan.source.contentDigest!==content || s.plan.configurationDigest!==config) process.exit(1)' \
        "$prior_snapshot" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST" "$RELEASE_CONFIGURATION_DIGEST"; then
      echo "==> 复用既有 Plan 的 prepare 验证；候选与私有配置摘要均未变化。"
    else
      validate_local_release_inputs
      rm -f "$RELEASE_CANDIDATE_RECEIPT_FILE"
      mkdir -p "$(dirname "$RELEASE_CANDIDATE_RECEIPT_FILE")"
      node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-create \
        --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
        --output "$RELEASE_CANDIDATE_RECEIPT_FILE"
    fi
    node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null
    executors_json="{\"prepare\":\"$prepare_executor\",\"validate\":\"$validate_executor\",\"build\":\"$build_executor\",\"deploy\":\"$deploy_executor\"}"
    if [ "$target_kind" = unit ]; then
      target_json="{\"kind\":\"unit\",\"unitId\":\"$target_unit\",\"mode\":\"$target_mode\"}"
    else
      target_json='{"kind":"monolith"}'
    fi
    plan_args=(
      create --root "$RELEASE_PLAN_ROOT"
      --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" --content "$RELEASE_CONTENT_DIGEST"
      --configuration "$RELEASE_CONFIGURATION_DIGEST" --mode "$release_mode"
      --executors "$executors_json" --target "$target_json"
    )
    [ "$release_mode" != fast ] || plan_args+=(--fast-reason "$fast_reason")
    [ "$new_plan" = 0 ] || plan_args+=(--new-plan)
    plan_result="$(node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" "${plan_args[@]}")"
    plan_id="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).planId)' "$plan_result")"
    echo "==> prepare 完成：Plan $plan_id 已冻结；默认顺序 validate -> build -> deploy。"
    node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" status --root "$RELEASE_PLAN_ROOT"
    exit 0
    ;;
  status)
    shift
    initialize_release_worktree
    RELEASE_PLAN_ROOT="${RELEASE_PLAN_ROOT:-$RELEASE_WORKTREE/.cache/release-plans}"
    status_args=(status --root "$RELEASE_PLAN_ROOT")
    [ "${1:-}" != "--json" ] || { status_args+=(--json); shift; }
    [ "$#" = 0 ] || { echo "[错误] status 只接受 --json"; exit 2; }
    node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" "${status_args[@]}"
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
  validate|build|deploy)
    release_action="$1"
    shift
    load_prepared_release_worktree
    capture_release_configuration_identity
    RELEASE_CANDIDATE_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/release-candidate.json"
    if ! node "$RELEASE_SCRIPT_DIR/release-gate-receipt.mjs" candidate-verify \
      --content "$RELEASE_CONTENT_DIGEST" --tree "$RELEASE_SOURCE_TREE" \
      --file "$RELEASE_CANDIDATE_RECEIPT_FILE" >/dev/null; then
      echo "[错误] 当前 release tree 没有有效 prepare 回执；拒绝进入发布阶段。" >&2
      echo "[提示] 先运行: OPS_ENV_FILE=$OPS_ENV_FILE ops/publish.sh prepare" >&2
      exit 1
    fi
    export RELEASE_CANDIDATE_RECEIPT_FILE
    RELEASE_PLAN_ROOT="${RELEASE_PLAN_ROOT:-$RELEASE_WORKTREE/.cache/release-plans}"
    export RELEASE_PLAN_ROOT
    plan_snapshot="$(node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" snapshot --root "$RELEASE_PLAN_ROOT")"
    stage_executor="$(node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s.plan.executors[process.argv[2]])' "$plan_snapshot" "$release_action")"
    planned_target_args=()
    target_values="$(node -e 'const s=JSON.parse(process.argv[1]); const t=s.plan.target; process.stdout.write(`${t.kind}\n${t.unitId ?? ""}\n${t.mode ?? ""}\n`)' "$plan_snapshot")"
    target_kind="$(printf '%s\n' "$target_values" | sed -n '1p')"
    target_unit="$(printf '%s\n' "$target_values" | sed -n '2p')"
    target_mode="$(printf '%s\n' "$target_values" | sed -n '3p')"
    if [ "$target_kind" = unit ]; then
      [ "$target_mode" = activate ] && planned_target_args=(--deploy-unit "$target_unit") \
        || planned_target_args=(--shadow-unit "$target_unit")
    fi
    requested_executor=""
    case "${1:-}" in
      --local|--direct) requested_executor=local; shift ;;
      --cnb) requested_executor=cnb; shift ;;
    esac
    [ -z "$requested_executor" ] || [ "$requested_executor" = "$stage_executor" ] \
      || { echo "[错误] $release_action 已封存为 ${stage_executor}，不能临时改执行器"; exit 2; }
    begin_result="$(node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" begin \
      --root "$RELEASE_PLAN_ROOT" --stage "$release_action" --executor "$stage_executor" \
      --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" --content "$RELEASE_CONTENT_DIGEST" \
      --configuration "$RELEASE_CONFIGURATION_DIGEST")"
    stage_action="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).action)' "$begin_result")"
    if [ "$stage_action" = reuse ]; then
      echo "==> $release_action 已是终态；直接复用，不执行任何旧环节。"
      node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" status --root "$RELEASE_PLAN_ROOT"
      exit 0
    fi
    stage_active=1
    finish_release_stage_on_exit() {
      local exit_code=$?
      if [ "$stage_active" = 1 ] && [ "$exit_code" -ne 0 ]; then
        local terminal=failed
        case "$exit_code" in 130|143) terminal=cancelled ;; esac
        node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" finish \
          --root "$RELEASE_PLAN_ROOT" --stage "$release_action" --status "$terminal" \
          --evidence "{\"kind\":\"stage-command\",\"exitCode\":$exit_code}" >/dev/null \
          || echo "[严重] 无法记录 $release_action 终态；必须人工审计进度账本" >&2
      fi
      return "$exit_code"
    }
    trap finish_release_stage_on_exit EXIT
    RELEASE_PROCESS_TIMING_FILE="${RELEASE_PROCESS_TIMING_FILE:-$RELEASE_WORKTREE/.cache/release-process-timing.json}"
    deploy_args=(--release-action "$release_action")
    [ "$stage_executor" != local ] || deploy_args+=(--direct)
    deploy_args+=("${planned_target_args[@]}")
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
    "$RELEASE_SCRIPT_DIR/publish-cnb.sh" "${deploy_args[@]}"
    node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" finish \
      --root "$RELEASE_PLAN_ROOT" --stage "$release_action" --status succeeded \
      --evidence "{\"kind\":\"stage-command\",\"executor\":\"$stage_executor\"}" >/dev/null
    stage_active=0
    trap - EXIT
    echo "==> $release_action 已完成并封存；以后只复用，不回头。"
    node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" status --root "$RELEASE_PLAN_ROOT"
    exit 0
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
  *) echo "[错误] 请指定模式: push、prepare、validate、build、deploy 或 status"; usage; exit 1 ;;
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
