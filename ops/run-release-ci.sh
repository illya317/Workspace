#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/release/attempts/ci-attempt-shell.sh
source "$SCRIPT_DIR/release/attempts/ci-attempt-shell.sh"
SOURCE_DIR="${RELEASE_SOURCE_DIR:?RELEASE_SOURCE_DIR is required}"
: "${RELEASE_SOURCE_SHA:?RELEASE_SOURCE_SHA is required}"
: "${RELEASE_SOURCE_TREE:?RELEASE_SOURCE_TREE is required}"
: "${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
: "${RELEASE_CONFIGURATION_DIGEST:?RELEASE_CONFIGURATION_DIGEST is required}"
: "${RELEASE_CI_ENV_FILE:?RELEASE_CI_ENV_FILE is required}"
: "${RELEASE_CI_RUN_ID:?RELEASE_CI_RUN_ID is required}"
: "${RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE:?RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE is required}"
[ -f "$RELEASE_CI_ENV_FILE" ] || { echo "[错误] CI 环境文件不存在: $RELEASE_CI_ENV_FILE" >&2; exit 1; }
[ -z "$(git -C "$SOURCE_DIR" status --short)" ] || { echo "[错误] CI 只接受干净 release tree" >&2; exit 1; }
[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$RELEASE_SOURCE_SHA" ] || { echo "[错误] CI source 已漂移" >&2; exit 1; }

set -a
# shellcheck source=/dev/null
source "$RELEASE_CI_ENV_FILE"
set +a
if [ "${RELEASE_CI_DATABASE_STATUS:-2}" -eq 0 ]; then
  DATABASE_URL="${RELEASE_CI_RUNTIME_DATABASE_URL:?sandbox runtime DATABASE_URL is required}"
  DIRECT_URL="${RELEASE_CI_CONTROL_DATABASE_URL:?sandbox control DATABASE_URL is required}"
  export DATABASE_URL DIRECT_URL
fi
export CI=1 WORKSPACE_CONFIG_DIR
TARGET_ID="${DEPLOY_UNIT_ID:-monolith}"
TARGET_MODE="${DEPLOY_UNIT_MODE:-activate}"
PREFLIGHT_STATUS="${RELEASE_CI_PREFLIGHT_STATUS:-0}"
DATABASE_STATUS="${RELEASE_CI_DATABASE_STATUS:-2}"
CI_RUN_ID="$RELEASE_CI_RUN_ID"
EVIDENCE_ROOT="$SOURCE_DIR/.cache/release-artifacts/evidence/$RELEASE_CONTENT_DIGEST"
READY_ROOT="$SOURCE_DIR/.cache/release-ready"
SOURCE_RECEIPT="$EVIDENCE_ROOT/source-validation-$TARGET_ID-$CI_RUN_ID.json"
ARTIFACT_RECEIPT="$SOURCE_DIR/.cache/release-check/release-artifact.json"
TASK_GRAPH="$SOURCE_DIR/.cache/release-task-graphs/$CI_RUN_ID.json"
SOURCE_RESULT="$EVIDENCE_ROOT/source-$CI_RUN_ID.json"
SOURCE_SNAPSHOT_RECEIPT="$EVIDENCE_ROOT/candidate-source-snapshot-$CI_RUN_ID.json"
RELEASE_EXECUTION_PLAN="$EVIDENCE_ROOT/release-execution-plan-$TARGET_ID-$TARGET_MODE-$CI_RUN_ID.json"
mkdir -p "$EVIDENCE_ROOT" "$READY_ROOT/receipts" "$(dirname "$TASK_GRAPH")" "$(dirname "$ARTIFACT_RECEIPT")"

cd "$SOURCE_DIR"
export CHECK_SOURCE_RUN_ID="$CI_RUN_ID"
export CHECK_TASK_GRAPH_FILE="$TASK_GRAPH"
export RELEASE_EVIDENCE_ROOT="$EVIDENCE_ROOT"
export RELEASE_SOURCE_VALIDATION_RECEIPT_FILE="$SOURCE_RECEIPT"
export RELEASE_SOURCE_RESULT_FILE="$SOURCE_RESULT"
export RELEASE_SOURCE_SNAPSHOT_RECEIPT_FILE="$SOURCE_SNAPSHOT_RECEIPT"
export RELEASE_VALIDATION_RUNTIME=local
export CNB_RELEASE_ARTIFACT_CACHE_ROOT="$SOURCE_DIR/.cache/release-artifacts"
export CNB_RELEASE_ARTIFACT_RECEIPT_FILE="$ARTIFACT_RECEIPT"

node "$SCRIPT_DIR/release/validation/artifact-preflight.mjs" verify \
  --file "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE" \
  --repository "$SOURCE_DIR" \
  --run-id "$CI_RUN_ID" \
  --source "$RELEASE_SOURCE_SHA" \
  --tree "$RELEASE_SOURCE_TREE" \
  --content "$RELEASE_CONTENT_DIGEST" \
  --configuration "$RELEASE_CONFIGURATION_DIGEST" \
  --target "$TARGET_ID" \
  --target-mode "$TARGET_MODE"

if [ "$DATABASE_STATUS" -eq 0 ]; then
  release_ci_attempt_log_message database "database sandbox status=passed"
  release_ci_attempt_lane_pass database
else
  release_ci_attempt_log_message database "database sandbox status=failed exit=$DATABASE_STATUS"
  release_ci_attempt_lane_fail database database-sandbox-failed "$DATABASE_STATUS"
fi

if [ "$TARGET_ID" = monolith ]; then
  ARTIFACT_FILE="$SOURCE_DIR/.next/workspace-standalone.tgz"
  MANIFEST_FILE="$SOURCE_DIR/.next/workspace-standalone.manifest.json"
  CONTRACT_ARGS=()
else
  ARTIFACT_FILE="$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/$TARGET_ID-standalone.tgz"
  MANIFEST_FILE="$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/$TARGET_ID-standalone.manifest.json"
  CONTRACT_ARGS=(--contract "$SOURCE_DIR/.cache/deploy-units/$TARGET_ID/deploy-unit-contract.json")
fi

create_candidate_evidence() {
  local plan_status=0 snapshot_status=0
  node --conditions=react-server --import tsx "$SCRIPT_DIR/release/candidate/release-execution-plan.mjs" \
    --repository "$SOURCE_DIR" \
    --baseline-root "$SOURCE_DIR/.cache/release-baselines" \
    --output "$RELEASE_EXECUTION_PLAN" \
    --source "$RELEASE_SOURCE_SHA" \
    --target "$TARGET_ID" \
    --target-mode "$TARGET_MODE" || plan_status=$?
  node "$SCRIPT_DIR/release/candidate/source-snapshot.mjs" create \
    --repository "$SOURCE_DIR" \
    --output "$SOURCE_SNAPSHOT_RECEIPT" \
    --source "$RELEASE_SOURCE_SHA" \
    --tree "$RELEASE_SOURCE_TREE" \
    --content "$RELEASE_CONTENT_DIGEST" || snapshot_status=$?
  if [ "$plan_status" -ne 0 ] || [ "$snapshot_status" -ne 0 ]; then
    echo "[candidate evidence] plan=$plan_status snapshot=$snapshot_status" >&2
    return 1
  fi
}

release_ci_attempt_lane_start candidate-evidence candidate-evidence-v1
candidate_evidence_status=0
release_ci_attempt_capture candidate-evidence -- create_candidate_evidence || candidate_evidence_status=$?
if [ "$candidate_evidence_status" -eq 0 ]; then
  release_ci_attempt_lane_pass candidate-evidence \
    "release-execution-plan:$RELEASE_EXECUTION_PLAN" \
    "source-snapshot-receipt:$SOURCE_SNAPSHOT_RECEIPT"
else
  release_ci_attempt_lane_fail candidate-evidence candidate-evidence-failed "$candidate_evidence_status"
fi
source_artifact_strategy=serial
if [ "$candidate_evidence_status" -eq 0 ]; then
  source_artifact_strategy="$(node -e '
    const plan=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!["serial", "parallel"].includes(plan.sourceArtifactStrategy)) process.exit(2);
    process.stdout.write(plan.sourceArtifactStrategy);
  ' "$RELEASE_EXECUTION_PLAN")"
fi

capture_lane_status() {
  local lane="$1" status_file="$2"
  shift 2
  local status=0
  release_ci_attempt_capture "$lane" -- "$@" || status=$?
  printf '%s\n' "$status" > "$status_file"
}

echo "==> CI ${CI_RUN_ID}：源码检查与目标 artifact 逻辑独立；unit 在资源边界内并行，monolith 保持串行"
release_ci_attempt_lane_start source source-ci-v1
source_status_file="$EVIDENCE_ROOT/.source-$CI_RUN_ID.status"
artifact_status_file="$EVIDENCE_ROOT/.artifact-$CI_RUN_ID.status"
rm -f "$source_status_file" "$artifact_status_file"

if [ "$source_artifact_strategy" = parallel ] && [ "$candidate_evidence_status" -eq 0 ]; then
  release_ci_attempt_lane_start artifact-build artifact-build-v1
  capture_lane_status source "$source_status_file" bash "$SCRIPT_DIR/run-cnb-release-gate.sh" &
  source_pid=$!
  capture_lane_status artifact-build "$artifact_status_file" bash "$SCRIPT_DIR/build-cnb-release-target.sh" &
  artifact_pid=$!
  wait "$artifact_pid"
  wait "$source_pid"
  artifact_status="$(< "$artifact_status_file")"
  source_status="$(< "$source_status_file")"
else
  set +e
  release_ci_attempt_capture source -- bash "$SCRIPT_DIR/run-cnb-release-gate.sh"
  source_status=$?
  set -e
  if [ "$candidate_evidence_status" -eq 0 ]; then
    release_ci_attempt_lane_start artifact-build artifact-build-v1
    set +e
    release_ci_attempt_capture artifact-build -- bash "$SCRIPT_DIR/build-cnb-release-target.sh"
    artifact_status=$?
    set -e
  else
    artifact_status=2
    release_ci_attempt_lane_block artifact-build artifact-build-v1
  fi
fi
rm -f "$source_status_file" "$artifact_status_file"

source_evidence=()
[ ! -f "$SOURCE_RECEIPT" ] || source_evidence+=("source-receipt:$SOURCE_RECEIPT")
[ ! -f "$SOURCE_RESULT" ] || source_evidence+=("source-result:$SOURCE_RESULT")
[ ! -f "$TASK_GRAPH" ] || source_evidence+=("task-graph:$TASK_GRAPH")
if [ "$source_status" -eq 0 ]; then
  release_ci_attempt_lane_pass source "${source_evidence[@]}"
else
  release_ci_attempt_lane_fail source source-ci-failed "$source_status" "${source_evidence[@]}"
fi

artifact_evidence=()
[ ! -f "$ARTIFACT_RECEIPT" ] || artifact_evidence+=("artifact-receipt:$ARTIFACT_RECEIPT")
[ ! -f "$MANIFEST_FILE" ] || artifact_evidence+=("artifact-manifest:$MANIFEST_FILE")
if [ "$artifact_status" -eq 0 ]; then
  release_ci_attempt_lane_pass artifact-build "${artifact_evidence[@]}"
  release_ci_attempt_lane_start static-acceptance artifact-static-acceptance-v1
  set +e
  STATIC_ACCEPTANCE_FILE="$EVIDENCE_ROOT/static-acceptance-$TARGET_ID-$TARGET_MODE-$CI_RUN_ID.json"
  release_ci_attempt_capture static-acceptance -- \
    node "$SCRIPT_DIR/release/readiness/artifact-static-acceptance.mjs" \
      --artifact "$ARTIFACT_FILE" --manifest "$MANIFEST_FILE" --target "$TARGET_ID" \
      "${CONTRACT_ARGS[@]}" \
      --output "$STATIC_ACCEPTANCE_FILE"
  static_status=$?
  set -e
  if [ "$static_status" -eq 0 ]; then
    release_ci_attempt_lane_pass static-acceptance \
      "static-acceptance-receipt:$STATIC_ACCEPTANCE_FILE" "${artifact_evidence[@]}"
  else
    release_ci_attempt_lane_fail static-acceptance artifact-static-acceptance-failed "$static_status" "${artifact_evidence[@]}"
  fi
else
  release_ci_attempt_lane_fail artifact-build artifact-build-failed "$artifact_status" "${artifact_evidence[@]}"
  release_ci_attempt_lane_block static-acceptance artifact-static-acceptance-v1
  static_status=2
fi
STATIC_ACCEPTANCE_FILE="${STATIC_ACCEPTANCE_FILE:-$EVIDENCE_ROOT/static-acceptance-$TARGET_ID-$TARGET_MODE-$CI_RUN_ID.json}"
REHEARSAL_FILE="$EVIDENCE_ROOT/rehearsal-$TARGET_ID-$TARGET_MODE-$CI_RUN_ID-$RELEASE_CONFIGURATION_DIGEST.json"
if [ "$artifact_status" -eq 0 ] && [ "$static_status" -eq 0 ] && [ "$DATABASE_STATUS" -eq 0 ]; then
  # A database reset/migration is new runtime evidence even for identical source bytes.
  # Never let a historical receipt skip the exact archive startup in this CI invocation.
  rm -f "$REHEARSAL_FILE"
  release_ci_attempt_lane_start rehearsal artifact-rehearsal-v1
  set +e
  runtime_database_url="$DATABASE_URL"
  unset DIRECT_URL SHADOW_DATABASE_URL
  export DATABASE_URL="$runtime_database_url"
  release_ci_attempt_capture rehearsal -- \
    node "$SCRIPT_DIR/release/readiness/rehearse-artifact.mjs" \
    --repository "$SOURCE_DIR" --output "$REHEARSAL_FILE" \
    --source "$RELEASE_SOURCE_SHA" --tree "$RELEASE_SOURCE_TREE" --content "$RELEASE_CONTENT_DIGEST" \
    --configuration "$RELEASE_CONFIGURATION_DIGEST" --target "$TARGET_ID" --target-mode "$TARGET_MODE" \
    --artifact "$ARTIFACT_FILE" --manifest "$MANIFEST_FILE" \
    --static-acceptance "$STATIC_ACCEPTANCE_FILE"
  rehearsal_status=$?
  set -e
  if [ "$rehearsal_status" -eq 0 ]; then
    release_ci_attempt_lane_pass rehearsal "rehearsal-receipt:$REHEARSAL_FILE"
  else
    rehearsal_evidence=()
    [ ! -f "$REHEARSAL_FILE" ] || rehearsal_evidence+=("rehearsal-receipt:$REHEARSAL_FILE")
    release_ci_attempt_lane_fail rehearsal artifact-rehearsal-failed "$rehearsal_status" "${rehearsal_evidence[@]}"
  fi
else
  rehearsal_status=2
  release_ci_attempt_lane_block rehearsal artifact-rehearsal-v1
  echo "[CI] artifact 启动演练 blocked：artifact 或 CI database 未就绪" >&2
fi

if [ "$PREFLIGHT_STATUS" -ne 0 ] || [ "$DATABASE_STATUS" -ne 0 ] || [ "$candidate_evidence_status" -ne 0 ] || [ "$source_status" -ne 0 ] || [ "$artifact_status" -ne 0 ] || [ "$static_status" -ne 0 ] || [ "$rehearsal_status" -ne 0 ]; then
  release_ci_attempt_lane_block application-ready application-ready-v1
  echo "" >&2
  echo "[CI 汇总] preflight=$PREFLIGHT_STATUS database=$DATABASE_STATUS candidate-evidence=$candidate_evidence_status source=$source_status artifact=$artifact_status static=$static_status rehearsal=${rehearsal_status}；未签发 Ready Artifact" >&2
  echo "[CI 汇总] 修复完整清单后再次运行 ci；精确输入未变化的成功任务会直接复用。" >&2
  exit 1
fi

READY_FILE="$READY_ROOT/receipts/$TARGET_ID/$TARGET_MODE/$CI_RUN_ID-$RELEASE_CONTENT_DIGEST-$RELEASE_CONFIGURATION_DIGEST.json"
release_ci_attempt_lane_start application-ready application-ready-v1
set +e
release_ci_attempt_capture application-ready -- \
  node "$SCRIPT_DIR/release/readiness/ready-artifact.mjs" create \
  --root "$READY_ROOT" \
  --output "$READY_FILE" \
  --repository "$SOURCE_DIR" \
  --run-id "$CI_RUN_ID" \
  --source "$RELEASE_SOURCE_SHA" \
  --tree "$RELEASE_SOURCE_TREE" \
  --content "$RELEASE_CONTENT_DIGEST" \
  --configuration "$RELEASE_CONFIGURATION_DIGEST" \
  --target "$TARGET_ID" \
  --target-mode "$TARGET_MODE" \
  --artifact "$ARTIFACT_FILE" \
  --manifest "$MANIFEST_FILE" \
  --source-receipt "$SOURCE_RECEIPT" \
  --source-result "$SOURCE_RESULT" \
  --source-snapshot "$SOURCE_SNAPSHOT_RECEIPT" \
  --task-graph "$TASK_GRAPH" \
  --static-acceptance "$STATIC_ACCEPTANCE_FILE" \
  --rehearsal "$REHEARSAL_FILE" \
  --artifact-receipt "$ARTIFACT_RECEIPT" \
  --artifact-preflight "$RELEASE_ARTIFACT_PREFLIGHT_RECEIPT_FILE" \
  "${CONTRACT_ARGS[@]}"
ready_status=$?
set -e
if [ "$ready_status" -ne 0 ]; then
  ready_evidence=()
  [ ! -f "$READY_FILE" ] || ready_evidence+=("application-ready-receipt:$READY_FILE")
  release_ci_attempt_lane_fail application-ready application-ready-failed "$ready_status" "${ready_evidence[@]}"
  exit "$ready_status"
fi
release_ci_attempt_lane_pass application-ready "application-ready-receipt:$READY_FILE"

echo "==> READY: $TARGET_ID ${RELEASE_SOURCE_SHA:0:12} content=${RELEASE_CONTENT_DIGEST:0:12}"
echo "==> deploy 现在只会消费这个 Ready Artifact，不再运行检查或构建。"
