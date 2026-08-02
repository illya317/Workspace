#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ "${WORKSPACE_REPO_RUNTIME_READY:-0}" != "1" ]; then
  exec "$REPOSITORY_ROOT/scripts/runtime/run-with-repo-node.sh" "$0" "$@" || exit 1
fi
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE" || exit 1

if [ "${1:-}" != deploy ]; then
  # workspace-errexit-role: non-deploy-execution
  set -o errexit
fi

usage() {
  cat <<'EOF'
用法:
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --deploy-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh ci --shadow-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready --deploy-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh controller-ready --shadow-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy --deploy-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh deploy --shadow-unit UNIT
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status [--json]
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status --deploy-unit UNIT [--json]
  OPS_ENV_FILE=/path/to/ops.env ops/publish.sh status --shadow-unit UNIT [--json]
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
  [ -n "$RELEASE_WORKTREE" ] || { echo "[错误] RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE" >&2; return 1; }
  RELEASE_CI_ENV_FILE="${RELEASE_CI_ENV_FILE:-${SOURCE_DIR:-}/.env}"
  [ -n "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] RELEASE_CI_ENV_FILE not set in $OPS_ENV_FILE" >&2; return 1; }
  RELEASE_CI_DEPENDENCIES_DIR="${RELEASE_CI_DEPENDENCIES_DIR:-${SOURCE_DIR:-}/node_modules}"
  node "$SCRIPT_DIR/release/worktree/controlled-environment.mjs" ensure \
    --worktree "$RELEASE_WORKTREE" --environment "$RELEASE_CI_ENV_FILE" \
    --dependencies "$RELEASE_CI_DEPENDENCIES_DIR" || return 1
  export RELEASE_CI_ENV_FILE RELEASE_CI_DEPENDENCIES_DIR
  RELEASE_SCRIPT_DIR="$RELEASE_WORKTREE/ops"
  [ -x "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" ] || { echo "[错误] release worktree 缺少候选选择器"; return 1; }
}

capture_release_identity() {
  RELEASE_SOURCE_SHA="$(git -C "$RELEASE_WORKTREE" rev-parse HEAD)" || return 1
  local identity
  identity="$(node "$RELEASE_WORKTREE/ops/release/candidate/identity.mjs" capture --repository "$RELEASE_WORKTREE" --revision HEAD)" || return 1
  RELEASE_SOURCE_TREE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).treeId)' "$identity")" || return 1
  RELEASE_CONTENT_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).contentDigest)' "$identity")" || return 1
  export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST
}

prepare_release_worktree() {
  initialize_release_worktree
  "$SCRIPT_DIR/promote-release-branch.sh" promote
  capture_release_identity
}

load_ready_worktree() {
  initialize_release_worktree || return 1
  "$RELEASE_SCRIPT_DIR/promote-release-branch.sh" verify || return 1
  capture_release_identity || return 1
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
# shellcheck source=ops/release/attempts/ci-attempt-shell.sh
source "$SCRIPT_DIR/release/attempts/ci-attempt-shell.sh"
# shellcheck source=ops/release/attempts/deploy-attempt-shell.sh
source "$SCRIPT_DIR/release/attempts/deploy-attempt-shell.sh"
# shellcheck source=ops/release/deploy/publish-entry-preflight.sh
source "$SCRIPT_DIR/release/deploy/publish-entry-preflight.sh"

parse_ready_selector() {
  local command="$1" allow_json="$2"
  shift 2
  SELECTED_READY_TARGET=monolith
  SELECTED_READY_MODE=activate
  SELECTED_READY_JSON=0
  local selected=0 option
  while [ "$#" -gt 0 ]; do
    option="$1"
    case "$option" in
      --deploy-unit|--shadow-unit)
        [ "$selected" = 0 ] || { echo "[错误] ${command} 只能选择一个 Ready target" >&2; exit 2; }
        shift
        SELECTED_READY_TARGET="${1:-}"
        printf '%s' "$SELECTED_READY_TARGET" | grep -Eq '^[a-z][a-z0-9-]*$' \
          || { echo "[错误] ${command} unit id 无效" >&2; exit 2; }
        [ "$SELECTED_READY_TARGET" != monolith ] \
          || { echo "[错误] ${command} unit selector 不接受保留目标 monolith" >&2; exit 2; }
        [ "$option" = --deploy-unit ] && SELECTED_READY_MODE=activate || SELECTED_READY_MODE=shadow
        selected=1
        ;;
      --json)
        [ "$allow_json" = 1 ] || { echo "[错误] ${command} 不接受 --json" >&2; exit 2; }
        [ "$SELECTED_READY_JSON" = 0 ] || { echo "[错误] ${command} 重复指定 --json" >&2; exit 2; }
        SELECTED_READY_JSON=1
        ;;
      *) echo "[错误] ${command} 未知参数: $option" >&2; exit 2 ;;
    esac
    shift
  done
  READY_SELECTOR_ARGS=(--target "$SELECTED_READY_TARGET" --target-mode "$SELECTED_READY_MODE")
}

case "${1:-}" in
  ci)
    shift
    target_id=monolith
    target_mode=activate
    selected=0
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --deploy-unit|--shadow-unit)
          [ "$selected" = 0 ] || { echo "[错误] ci 只能选择一个 Ready target" >&2; exit 2; }
          option="$1"; shift; target_id="${1:-}"
          printf '%s' "$target_id" | grep -Eq '^[a-z][a-z0-9-]*$' || { echo "[错误] unit id 无效"; exit 2; }
          [ "$target_id" != monolith ] || { echo "[错误] ci unit selector 不接受保留目标 monolith" >&2; exit 2; }
          [ "$option" = --deploy-unit ] && target_mode=activate || target_mode=shadow
          selected=1
          ;;
        *) echo "[错误] ci 未知参数: $1；旧阶段和 --new-plan 不再支持"; exit 2 ;;
      esac
      shift
    done
    # Candidate identity is not available until freeze completes, but the
    # immutable attempt must start before freeze. Use a collision-resistant
    # opaque run identity that already satisfies every downstream receipt.
    printf -v release_ci_identity '%04x%04x%04x' "$RANDOM" "$RANDOM" "$RANDOM"
    printf -v release_ci_nonce '%04x%04x' "$RANDOM" "$RANDOM"
    RELEASE_CI_RUN_ID="ci-$(date -u +%Y%m%dT%H%M%SZ)-$release_ci_identity-$release_ci_nonce"
    attempt_repository="${RELEASE_SOURCE_DIR:-${SOURCE_DIR:-}}"
    [ -n "$attempt_repository" ] || { echo "[错误] RELEASE_SOURCE_DIR not set in $OPS_ENV_FILE" >&2; exit 1; }
    release_ci_attempt_begin "$attempt_repository" "$RELEASE_CI_RUN_ID" "$target_id" "$target_mode"
    release_ci_attempt_lane_start candidate-freeze candidate-freeze-v1
    set +e
    release_ci_attempt_capture candidate-freeze -- prepare_release_worktree
    prepare_status=$?
    set -e
    if [ "$prepare_status" != 0 ]; then
      release_ci_attempt_lane_fail candidate-freeze candidate-freeze-failed "$prepare_status"
      exit "$prepare_status"
    fi
    set +e
    release_ci_attempt_capture candidate-freeze -- validate_release_inputs
    inputs_status=$?
    release_ci_attempt_capture candidate-freeze -- capture_release_configuration_identity
    configuration_status=$?
    set -e
    if [ "$inputs_status" != 0 ] || [ "$configuration_status" != 0 ]; then
      if [ "$inputs_status" != 0 ]; then
        candidate_error_code=release-inputs-invalid
        candidate_exit_code="$inputs_status"
      else
        candidate_error_code=configuration-identity-invalid
        candidate_exit_code="$configuration_status"
      fi
      release_ci_attempt_lane_fail candidate-freeze "$candidate_error_code" "$candidate_exit_code"
      echo "[错误] Stage-2 Artifact 预检 blocked：外部输入或配置摘要无效；未启动 DB sandbox/source CI/build" >&2
      exit 1
    fi
    release_ci_attempt_bind "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST" "$RELEASE_CONFIGURATION_DIGEST"
    release_ci_attempt_lane_pass candidate-freeze
    release_evidence_root="$RELEASE_WORKTREE/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST"
    RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE="$release_evidence_root/artifact-preflight-$target_id-$target_mode-$RELEASE_CI_RUN_ID.json"
    export RELEASE_CI_RUN_ID RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE
    export RELEASE_SOURCE_DIR="$RELEASE_WORKTREE"
    release_ci_attempt_lane_start artifact-preflight artifact-preflight-v1
    set +e
    release_ci_attempt_capture artifact-preflight -- \
      node "$RELEASE_SCRIPT_DIR/release/validation/artifact-preflight.mjs" create \
      --output "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE" \
      --repository "$RELEASE_WORKTREE" \
      --run-id "$RELEASE_CI_RUN_ID" \
      --source "$RELEASE_SOURCE_SHA" \
      --tree "$RELEASE_SOURCE_TREE" \
      --content "$RELEASE_CONTENT_DIGEST" \
      --configuration "$RELEASE_CONFIGURATION_DIGEST" \
      --target "$target_id" \
      --target-mode "$target_mode"
    preflight_status=$?
    set -e
    if [ "$preflight_status" != 0 ]; then
      release_ci_attempt_lane_fail artifact-preflight artifact-preflight-failed "$preflight_status"
      exit "$preflight_status"
    fi
    release_ci_attempt_lane_pass artifact-preflight "preflight-receipt:$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE"
    echo "==> Stage-2 Artifact 预检通过: target=$target_id:$target_mode run=$RELEASE_CI_RUN_ID"
    export RELEASE_CI_PREFLIGHT_STATUS=0
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
    release_ci_attempt_lane_start database database-sandbox-v1
    release_ci_attempt_log_message database "database sandbox started"
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
    parse_ready_selector controller-ready 0 "$@"
    load_ready_worktree
    ready_json="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current \
      --root "$RELEASE_WORKTREE/.cache/release-ready" "${READY_SELECTOR_ARGS[@]}")"
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
    acquire_controller_ready_qualification_lock
    node "$SCRIPT_DIR/release/control/controller-ready.mjs" qualify \
      --repository "$REPOSITORY_ROOT" \
      --ready-source "$ready_source" \
      --file "$controller_ready_file"
    echo "==> CONTROLLER READY: target=${SELECTED_READY_TARGET}:${SELECTED_READY_MODE} application=${ready_source:0:12}"
    exit 0
    ;;
  status)
    shift
    parse_ready_selector status 1 "$@"
    initialize_release_worktree
    current="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current \
      --root "$RELEASE_WORKTREE/.cache/release-ready" "${READY_SELECTOR_ARGS[@]}")"
    if [ "$SELECTED_READY_JSON" = 1 ]; then printf '%s\n' "$current"; else
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
    begin_deploy_entry_preflight
    parse_ready_selector deploy 0 "$@"
    bind_deploy_entry_selector
    release_worktree_ready=1
    configuration_ready=1
    ready_receipt_ready=1
    controller_receipt_ready=1
    if ! load_ready_worktree; then
      deploy_preflight_fail candidate-identity "release worktree/candidate identity 无效"
      release_worktree_ready=0
    fi
    if [ "$release_worktree_ready" = 1 ]; then
      if ! capture_release_configuration_identity \
        || ! printf '%s' "${RELEASE_CONFIGURATION_DIGEST:-}" | grep -Eq '^[0-9a-f]{64}$'; then
        deploy_preflight_fail tenant-configuration "tenant configuration digest 无法计算"
        configuration_ready=0
      fi
    else
      deploy_preflight_block tenant-configuration "tenant configuration digest blocked：candidate worktree 无效"
      configuration_ready=0
    fi
    if ! validate_local_deploy_credentials; then
      deploy_preflight_fail deploy-credentials "本地部署凭据/目标配置无效"
    fi
    if [ "$release_worktree_ready" = 1 ] && [ "$configuration_ready" = 1 ]; then
      if ! load_selected_ready; then
        deploy_preflight_fail application-ready "Application Ready receipt/identity 无效"
        ready_receipt_ready=0
      fi
    else
      deploy_preflight_block application-ready "Application Ready receipt blocked：candidate/config identity 无效"
      ready_receipt_ready=0
    fi
    if [ "$ready_receipt_ready" = 1 ]; then
      if ! load_controller_ready_for_preflight; then
        controller_receipt_ready=0
      fi
    else
      deploy_preflight_block controller-ready "Controller Ready receipt blocked：Application Ready 无效"
      controller_receipt_ready=0
    fi
    deploy_attempt_root="$REPOSITORY_ROOT/.cache/release-deploy-attempts"
    retry_fence_file="$deploy_attempt_root/retry-fence/$deploy_entry_attempt_id.json"
    if [ "$controller_receipt_ready" = 1 ]; then
      if ! node "$(release_deploy_attempt_tool)" assert-clear \
        --root "$deploy_attempt_root" \
        --repository "$REPOSITORY_ROOT" \
        --target "$SELECTED_READY_TARGET" \
        --target-mode "$SELECTED_READY_MODE" \
        --source-content "$RELEASE_CONTENT_DIGEST" \
        --source-commit "$RELEASE_SOURCE_SHA" \
        --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" --attempt-id "$deploy_entry_attempt_id" \
        --receipt "$retry_fence_file"; then
        deploy_preflight_block retry-fence "deploy blocker ledger 未清空"
      fi
    else
      deploy_preflight_block retry-fence "deploy blocker ledger blocked：Controller Ready 无效"
    fi
    if [ "$ready_receipt_ready" = 1 ]; then
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
      if ! (cd "$RELEASE_WORKTREE" && bash ./ops/cnb-release-artifact-cache.sh restore); then
        deploy_preflight_fail artifact-cache "Ready artifact cache 恢复/复验失败"
      fi
    else
      deploy_preflight_block artifact-cache "Ready artifact cache blocked：Application Ready 无效"
    fi
    if ! finish_deploy_entry_preflight; then exit 1; fi
    export RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE="$retry_fence_file" RELEASE_DEPLOY_ATTEMPT_ID="$deploy_entry_attempt_id"
    export DEPLOY_ATTEMPT_ROOT="$deploy_attempt_root" DEPLOY_ATTEMPT_REPOSITORY="$REPOSITORY_ROOT"
    export RELEASE_CONTROLLER_READY_RECEIPT_FILE="$controller_ready_file"
    database_args=()
    if [ -n "${DATABASE_REPLACEMENT_RECEIPT_FILE:-}" ]; then
      database_args=(--database-replacement-receipt "$DATABASE_REPLACEMENT_RECEIPT_FILE")
    fi
    RELEASE_CONFIGURATION_DIGEST="$RELEASE_CONFIGURATION_DIGEST" \
      release_deploy_attempt_run -- \
      "$SCRIPT_DIR/publish-cnb.sh" --release-action deploy --direct "${target_args[@]}" "${database_args[@]}" || exit $?
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
