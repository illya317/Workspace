#!/usr/bin/env bash
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
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --deploy-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --shadow-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status [--json]
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh push
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh database-replace ...
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh data ...
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh timing pause|resume|status

正式应用生命周期保持 ci -> Ready -> deploy：
  ci      冻结当前已提交候选，聚合源码失败，构建并演练 artifact；成功后签发 Application Ready。
  deploy  只消费并复验 Ready set；不会运行测试、源码检查、编译、打包或创建新候选。

独立的 deploy 前置证明：
  controller-ready  针对当前 Application Ready 验证 controller seam，运行完整 ops test shard 并签发 Controller Ready。

controller-ready 不改变 Application Ready 或 artifact。prepare、validate、build、--new-plan 已删除。
EOF
}

initialize_release_worktree() {
  RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
  : "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
  RELEASE_CI_ENV_FILE="${RELEASE_CI_ENV_FILE:-${SOURCE_DIR:-}/.env}"
  : "${RELEASE_CI_ENV_FILE:?RELEASE_CI_ENV_FILE not set in $OPS_ENV_FILE}"
  [ -f "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] release CI 环境文件不存在: $RELEASE_CI_ENV_FILE"; exit 1; }
  local release_env_target="$RELEASE_WORKTREE/.env"
  if [ -L "$release_env_target" ]; then
    [ "$(readlink "$release_env_target")" = "$RELEASE_CI_ENV_FILE" ] || {
      echo "[错误] release .env 必须是指向受控 CI 环境文件的符号链接" >&2; exit 1;
    }
  elif [ -e "$release_env_target" ]; then
    echo "[错误] release .env 必须是指向受控 CI 环境文件的符号链接" >&2; exit 1
  else
    ln -s "$RELEASE_CI_ENV_FILE" "$release_env_target"
  fi
  export RELEASE_CI_ENV_FILE
  RELEASE_SCRIPT_DIR="$RELEASE_WORKTREE/ops"
  [ -x "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" ] || { echo "[错误] release worktree 缺少候选选择器"; exit 1; }
}

capture_release_identity() {
  RELEASE_SOURCE_SHA="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)"
  local identity
  identity="$(node "$RELEASE_WORKTREE/ops/release/candidate/identity.mjs" capture --repository "$RELEASE_WORKTREE" --revision HEAD)"
  RELEASE_SOURCE_TREE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).treeId)' "$identity")"
  RELEASE_CONTENT_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).contentDigest)' "$identity")"
  export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST
}

prepare_release_worktree() {
  initialize_release_worktree
  "$SCRIPT_DIR/promote-release-branch.sh" promote
  capture_release_identity
}

load_ready_worktree() {
  initialize_release_worktree
  "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" verify
  capture_release_identity
}

validate_release_inputs() {
  WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
  if [ -z "$WORKSPACE_CONFIG_DIR" ]; then
    echo "[错误] WORKSPACE_CONFIG_DIR not set in ${OPS_ENV_FILE}；配置相关检查全部标记 blocked" >&2
    return 1
  fi
  local status=0
  local cnb_yml="${CNB_REAL_CNB_YML:-$WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml}"
  if [ ! -f "$cnb_yml" ]; then
    echo "[错误] 真实部署配置不存在: $cnb_yml" >&2
    status=1
  elif ! node "$RELEASE_SCRIPT_DIR/validate-cnb-release-config.mjs" "$cnb_yml"; then
    status=1
  fi
  if ! OPS_ENV_FILE="$OPS_ENV_FILE" WORKSPACE_CONFIG_DIR="$WORKSPACE_CONFIG_DIR" \
    "$RELEASE_SCRIPT_DIR/sync-tenant-config.sh" --dry-run --source-sha "$RELEASE_SOURCE_SHA"; then
    status=1
  fi
  return "$status"
}

# shellcheck source=ops/release/readiness/release-inputs.sh
source "$SCRIPT_DIR/release/readiness/release-inputs.sh"

case "${1:-}" in
  ci)
    shift
    target_id=monolith
    target_mode=activate
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --deploy-unit|--shadow-unit)
          option="$1"; shift; target_id="${1:-}"
          printf '%s' "$target_id" | grep -Eq '^[a-z][a-z0-9-]*$' || { echo "[错误] unit id 无效"; exit 2; }
          [ "$option" = --deploy-unit ] && target_mode=activate || target_mode=shadow
          ;;
        *) echo "[错误] ci 未知参数: $1；旧阶段和 --new-plan 不再支持"; exit 2 ;;
      esac
      shift
    done
    prepare_release_worktree
    preflight_status=0
    set +e
    validate_release_inputs
    inputs_status=$?
    capture_release_configuration_identity
    configuration_status=$?
    node "$RELEASE_SCRIPT_DIR/cache/cache-prune.mjs" prune --root "$RELEASE_WORKTREE"
    cache_status=$?
    set -e
    for result in "$inputs_status" "$configuration_status" "$cache_status"; do
      [ "$result" = 0 ] || preflight_status=1
    done
    if [ "$configuration_status" != 0 ]; then
      RELEASE_CONFIGURATION_DIGEST="$(printf '0%.0s' {1..64})"
      export RELEASE_CONFIGURATION_DIGEST
    fi
    echo "==> CI 外部输入聚合: config-inputs=$inputs_status config-digest=$configuration_status cache=$cache_status"
    export RELEASE_CI_PREFLIGHT_STATUS="$preflight_status"
    export RELEASE_SOURCE_DIR="$RELEASE_WORKTREE"
    if [ -z "${RELEASE_CI_DATABASE_CA_FILE:-}" ]; then
      for ci_ca_candidate in /etc/workspace/postgresql/ca.pem "$(dirname "$RELEASE_WORKTREE")/postgresql-security/tls/ca.crt"; do
        if [ -f "$ci_ca_candidate" ]; then RELEASE_CI_DATABASE_CA_FILE="$ci_ca_candidate"; break; fi
      done
    fi
    export RELEASE_CI_DATABASE_CA_FILE="${RELEASE_CI_DATABASE_CA_FILE:-}"
    if [ "$target_id" = monolith ]; then
      unset DEPLOY_UNIT_ID DEPLOY_UNIT_MODE || true
    else
      export DEPLOY_UNIT_ID="$target_id" DEPLOY_UNIT_MODE="$target_mode"
    fi
    (
      set -a
      # shellcheck source=/dev/null
      source "$RELEASE_CI_ENV_FILE"
      set +a
      export RELEASE_CI_DATABASE_CA_FILE
      node "$RELEASE_SCRIPT_DIR/release/readiness/ci-database-sandbox.mjs" \
        --repository "$RELEASE_WORKTREE" -- "$RELEASE_SCRIPT_DIR/run-release-ci.sh"
    )
    exit 0
    ;;
  controller-ready)
    shift
    [ "$#" = 0 ] || { echo "[错误] controller-ready 不接受参数"; exit 2; }
    load_ready_worktree
    ready_json="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current \
      --root "$RELEASE_WORKTREE/.cache/release-ready")"
    ready_values="$(node -e '
      const r=JSON.parse(process.argv[1]).receipt;
      process.stdout.write(`${r.source.commitSha}\n${r.source.treeId}\n${r.source.contentDigest}\n`);
    ' "$ready_json")"
    ready_source="$(printf '%s\n' "$ready_values" | sed -n '1p')"
    ready_tree="$(printf '%s\n' "$ready_values" | sed -n '2p')"
    ready_content="$(printf '%s\n' "$ready_values" | sed -n '3p')"
    [ "$ready_source" = "$RELEASE_SOURCE_SHA" ] && [ "$ready_tree" = "$RELEASE_SOURCE_TREE" ] \
      && [ "$ready_content" = "$RELEASE_CONTENT_DIGEST" ] || {
        echo "[错误] 当前 release source 没有 Application Ready；先运行 ci" >&2; exit 1;
      }
    controller_ready_file="${DEPLOY_CONTROLLER_READY_RECEIPT_FILE:-$REPOSITORY_ROOT/.cache/release-control/controller-ready.json}"
    node "$SCRIPT_DIR/release/control/controller-ready.mjs" qualify \
      --repository "$REPOSITORY_ROOT" \
      --ready-source "$ready_source" \
      --file "$controller_ready_file"
    echo "==> CONTROLLER READY: application=${ready_source:0:12}"
    exit 0
    ;;
  status)
    shift
    initialize_release_worktree
    [ "$#" -le 1 ] || { echo "[错误] status 只接受 --json"; exit 2; }
    current="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current --root "$RELEASE_WORKTREE/.cache/release-ready")"
    if [ "${1:-}" = --json ]; then printf '%s\n' "$current"; else
      node -e '
        const v=JSON.parse(process.argv[1]); const r=v.receipt;
        console.log(`READY ${r.target.id}:${r.target.mode}`);
        console.log(`source  ${r.source.commitSha}`);
        console.log(`content ${r.source.contentDigest}`);
        console.log(`ci      ${r.runId}`);
        console.log(`at      ${r.completedAt}`);
      ' "$current"
    fi
    exit 0
    ;;
  deploy)
    shift
    [ "$#" = 0 ] || { echo "[错误] deploy 不接受参数；目标已经封存在 Ready Receipt"; exit 2; }
    load_ready_worktree
    capture_release_configuration_identity
    validate_local_deploy_credentials
    ready_json="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current --root "$RELEASE_WORKTREE/.cache/release-ready")"
    ready_file="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptFile)' "$ready_json")"
    ready_values="$(node -e '
      const r=JSON.parse(process.argv[1]).receipt;
      process.stdout.write(`${r.runId}\n${r.source.commitSha}\n${r.source.treeId}\n${r.source.contentDigest}\n${r.configurationDigest}\n${r.target.id}\n${r.target.mode}\n`);
    ' "$ready_json")"
    ready_run_id="$(printf '%s\n' "$ready_values" | sed -n '1p')"
    ready_source="$(printf '%s\n' "$ready_values" | sed -n '2p')"
    ready_tree="$(printf '%s\n' "$ready_values" | sed -n '3p')"
    ready_content="$(printf '%s\n' "$ready_values" | sed -n '4p')"
    ready_configuration="$(printf '%s\n' "$ready_values" | sed -n '5p')"
    target_id="$(printf '%s\n' "$ready_values" | sed -n '6p')"
    target_mode="$(printf '%s\n' "$ready_values" | sed -n '7p')"
    [ "$ready_source" = "$RELEASE_SOURCE_SHA" ] && [ "$ready_tree" = "$RELEASE_SOURCE_TREE" ] \
      && [ "$ready_content" = "$RELEASE_CONTENT_DIGEST" ] && [ "$ready_configuration" = "$RELEASE_CONFIGURATION_DIGEST" ] || {
        echo "[错误] 当前 release source/config 没有 Ready Artifact；先运行 ci" >&2; exit 1;
      }
    controller_ready_file="${DEPLOY_CONTROLLER_READY_RECEIPT_FILE:-$REPOSITORY_ROOT/.cache/release-control/controller-ready.json}"
    controller_ready_json="$(node "$SCRIPT_DIR/release/control/controller-ready.mjs" verify \
      --repository "$REPOSITORY_ROOT" --ready-source "$ready_source" --file "$controller_ready_file")"
    DEPLOY_CONTROL_SOURCE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.sourceSha)' "$controller_ready_json")"
    DEPLOY_CONTROL_TREE_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.treeId)' "$controller_ready_json")"
    DEPLOY_CONTROL_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.controlDigest)' "$controller_ready_json")"
    DEPLOY_CONTROL_RECEIPT_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptDigest)' "$controller_ready_json")"
    export DEPLOY_CONTROL_SOURCE_SHA DEPLOY_CONTROL_TREE_ID DEPLOY_CONTROL_DIGEST DEPLOY_CONTROL_RECEIPT_DIGEST
    export RELEASE_CONTROLLER_READY_RECEIPT_FILE="$controller_ready_file"
    export RELEASE_SOURCE_DIR="$RELEASE_WORKTREE"
    export RELEASE_READY_RECEIPT_FILE="$ready_file" RELEASE_CI_RUN_ID="$ready_run_id"
    export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$RELEASE_WORKTREE/.cache/release-artifacts"
    export CNB_RELEASE_ARTIFACT_RECEIPT_FILE="$RELEASE_WORKTREE/.cache/release-check/release-artifact.json"
    if [ "$target_id" = monolith ]; then
      unset DEPLOY_UNIT_ID DEPLOY_UNIT_MODE || true
      target_args=()
    else
      export DEPLOY_UNIT_ID="$target_id" DEPLOY_UNIT_MODE="$target_mode"
      [ "$target_mode" = activate ] && target_args=(--deploy-unit "$target_id") || target_args=(--shadow-unit "$target_id")
    fi
    (cd "$RELEASE_WORKTREE" && bash ./ops/cnb-release-artifact-cache.sh restore)
    database_args=()
    if [ -n "${DATABASE_REPLACEMENT_RECEIPT_FILE:-}" ]; then
      database_args=(--database-replacement-receipt "$DATABASE_REPLACEMENT_RECEIPT_FILE")
    fi
    RELEASE_CONFIGURATION_DIGEST="$RELEASE_CONFIGURATION_DIGEST" \
      "$SCRIPT_DIR/publish-cnb.sh" --release-action deploy --direct "${target_args[@]}" "${database_args[@]}"
    exit 0
    ;;
  data)
    shift; exec "$SCRIPT_DIR/upload-data-release.sh" "$@" ;;
  database-replace)
    shift; exec "$SCRIPT_DIR/publish-database-replacement.sh" "$@" ;;
  timing)
    shift
    RELEASE_WORKTREE="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
    : "${RELEASE_WORKTREE:?RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE}"
    timing_file="${RELEASE_PROCESS_TIMING_FILE:-$RELEASE_WORKTREE/.cache/release-process-timing.json}"
    case "${1:-}" in pause) command=pause ;; resume) command=resume ;; status) command=snapshot ;; *) exit 2 ;; esac
    node "$SCRIPT_DIR/release-process-timing.mjs" "$command" --file "$timing_file"
    exit 0
    ;;
  prepare|validate|build)
    echo "[错误] $1 已删除；应用 lifecycle 只有 ci -> Ready -> deploy；deploy 前另需 controller-ready" >&2
    exit 2
    ;;
esac

: "${SOURCE_DIR:?SOURCE_DIR not set in $OPS_ENV_FILE}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH not set in $OPS_ENV_FILE}"
DEVELOPMENT_BRANCH="${DEVELOPMENT_BRANCH:-main}"
GITHUB_REMOTE_NAME="${GITHUB_REMOTE:-origin}"
GITHUB_HTTPS_PROXY="${GITHUB_HTTPS_PROXY-http://127.0.0.1:7897}"
PROMOTION_REVIEW_SECONDS="${PROMOTION_REVIEW_SECONDS:-600}"

with_github_proxy() {
  if [ -n "$GITHUB_HTTPS_PROXY" ]; then HTTPS_PROXY="$GITHUB_HTTPS_PROXY" "$@"; else "$@"; fi
}

case "${1:-}" in push) shift ;; -h|--help) usage; exit 0 ;; *) usage; exit 1 ;; esac
[ "$#" = 0 ] || { echo "[错误] push 不接受额外参数"; exit 1; }
case "$PROMOTION_REVIEW_SECONDS" in ''|*[!0-9]*) exit 1 ;; esac
[ "$PROMOTION_REVIEW_SECONDS" -ge 1 ] || exit 1

cd "$SOURCE_DIR"
echo "==> 候选固定为已提交 HEAD；工作区未提交内容不参与。"
command -v gh >/dev/null 2>&1 || { echo "[错误] 未找到 gh CLI"; exit 1; }
with_github_proxy git fetch "$GITHUB_REMOTE_NAME" "$DEVELOPMENT_BRANCH"
remote_main_sha="$(git rev-parse "$GITHUB_REMOTE_NAME/$DEVELOPMENT_BRANCH")"
head_sha="$(git rev-parse HEAD)"
github_repository="${GITHUB_REPOSITORY:-$(with_github_proxy gh repo view --json nameWithOwner --jq .nameWithOwner)}"
git merge-base --is-ancestor "$remote_main_sha" "$head_sha" || { echo "[错误] 候选不是远端主分支的快进后代"; exit 1; }
staging_branch=codex/staging-main
candidate_branch=codex/candidate-main
staging_before="$(with_github_proxy git ls-remote --heads "$GITHUB_REMOTE_NAME" "refs/heads/$staging_branch" | awk '{print $1}')"
WORKSPACE_DIFF_BASE="$remote_main_sha" WORKSPACE_DIFF_HEAD="$head_sha" with_github_proxy git push "$GITHUB_REMOTE_NAME" \
  --force-with-lease="refs/heads/$staging_branch:$staging_before" "HEAD:refs/heads/$staging_branch"
minimum_run_id="$(with_github_proxy gh api "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${DEVELOPMENT_BRANCH}&event=workflow_dispatch&per_page=100" --jq '[.workflow_runs[].id] | max // 0')"
with_github_proxy gh workflow run promote-candidate.yml --repo "$github_repository" --ref "$DEVELOPMENT_BRANCH" \
  -f staging_branch="$staging_branch" -f staging_sha="$head_sha" -f base_sha="$remote_main_sha"
review_at=$(( $(date +%s) + PROMOTION_REVIEW_SECONDS )); notice=0; run_id=""
while [ -z "$run_id" ]; do
  run_id="$(with_github_proxy gh api "repos/${github_repository}/actions/workflows/promote-candidate.yml/runs?branch=${DEVELOPMENT_BRANCH}&event=workflow_dispatch&per_page=100" \
    --jq "[.workflow_runs[] | select(.id > $minimum_run_id and .head_sha == \"$remote_main_sha\")] | sort_by(.id) | last | .id // empty")"
  [ -n "$run_id" ] && break
  if [ "$notice" = 0 ] && [ "$(date +%s)" -ge "$review_at" ]; then echo "[提示] promotion 等待超过软复查阈值" >&2; notice=1; fi
  sleep 2
done
with_github_proxy gh run watch "$run_id" --repo "$github_repository" --exit-status --interval 5
pr_url="$(with_github_proxy gh pr view "$candidate_branch" --repo "$github_repository" --json url --jq .url)"
echo "==> bot PR 已就绪: $pr_url"
