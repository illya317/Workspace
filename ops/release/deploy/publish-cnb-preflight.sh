#!/usr/bin/env bash

publish_preflight_failures=()

publish_preflight_fail() {
  publish_preflight_failures+=("$1")
}

finish_publish_preflight() {
  [ "${#publish_preflight_failures[@]}" -eq 0 ] && return 0
  echo "[错误] deploy 零写入预检发现 ${#publish_preflight_failures[@]} 项失败：" >&2
  printf '  - %s\n' "${publish_preflight_failures[@]}" >&2
  return 1
}

probe_publish_inputs() {
  local missing=0 name value
  for name in SOURCE_DIR RELEASE_BRANCH CNB_REPO WORKSPACE_CONFIG_DIR DEPLOY_CONTROL_SOURCE_SHA \
    DEPLOY_CONTROL_TREE_ID DEPLOY_CONTROL_DIGEST DEPLOY_CONTROL_RECEIPT_DIGEST \
    RELEASE_CONTROLLER_READY_RECEIPT_FILE RELEASE_READY_RECEIPT_FILE RELEASE_CONFIGURATION_DIGEST \
    RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE RELEASE_DEPLOY_ATTEMPT_ID RELEASE_DEPLOY_ATTEMPT_PARENT_PID \
    DEPLOY_ATTEMPT_ROOT DEPLOY_ATTEMPT_REPOSITORY SERVER REMOTE_DIR HEALTHCHECK_URL; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
      echo "[错误] $name not set in $OPS_ENV_FILE" >&2
      missing=1
    fi
  done
  [ "$missing" = 0 ] || return 1
  [ "$RELEASE_ACTION" = deploy ] && [ "$DIRECT_RELEASE" = 1 ] && [ "$PRINT_COMMAND_ONLY" = 0 ] || return 1
  if [ -n "$DEPLOY_UNIT_ID" ]; then
    printf '%s' "$DEPLOY_UNIT_ID" | grep -Eq '^[a-z][a-z0-9-]*$' || return 1
  fi
  case "$DEPLOY_REVIEW_SECONDS" in ''|*[!0-9]*) return 1 ;; esac
  [ "$DEPLOY_REVIEW_SECONDS" -ge 1 ] || return 1
  [ -f "$CNB_REAL_CNB_YML" ] || return 1
}

probe_deploy_retry_fence() {
  local source_sha candidate_identity source_content
  source_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)" || return 1
  candidate_identity="$(node "$SCRIPT_DIR/release/candidate/identity.mjs" capture \
    --repository "$SOURCE_DIR" --revision HEAD)" || return 1
  source_content="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).contentDigest)' "$candidate_identity")" || return 1
  node "$SCRIPT_DIR/release/attempts/deploy-blocker.mjs" verify-clear \
    --root "$DEPLOY_ATTEMPT_ROOT" --repository "$DEPLOY_ATTEMPT_REPOSITORY" \
    --target "${DEPLOY_UNIT_ID:-monolith}" --target-mode "${DEPLOY_UNIT_MODE:-activate}" \
    --source-content "$source_content" --source-commit "$source_sha" \
    --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" \
    --attempt-id "$RELEASE_DEPLOY_ATTEMPT_ID" \
    --receipt "$RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE" >/dev/null
}

verify_consumed_deploy_retry_fence() {
  [ "$PPID" = "$RELEASE_DEPLOY_ATTEMPT_PARENT_PID" ] || return 1
  local source_sha candidate_identity source_content
  source_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)" || return 1
  candidate_identity="$(node "$SCRIPT_DIR/release/candidate/identity.mjs" capture \
    --repository "$SOURCE_DIR" --revision HEAD)" || return 1
  source_content="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).contentDigest)' "$candidate_identity")" || return 1
  node "$SCRIPT_DIR/release/attempts/deploy-blocker.mjs" verify-consumed \
    --root "$DEPLOY_ATTEMPT_ROOT" --repository "$DEPLOY_ATTEMPT_REPOSITORY" \
    --target "${DEPLOY_UNIT_ID:-monolith}" --target-mode "${DEPLOY_UNIT_MODE:-activate}" \
    --source-content "$source_content" --source-commit "$source_sha" \
    --controller-commit "$DEPLOY_CONTROL_SOURCE_SHA" --attempt-id "$RELEASE_DEPLOY_ATTEMPT_ID" \
    --parent-pid "$RELEASE_DEPLOY_ATTEMPT_PARENT_PID" \
    --receipt "$RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE" >/dev/null
}

probe_candidate_ready_artifact() {
  [ "$(git -C "$SOURCE_DIR" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || return 1
  [ "$(git -C "$SOURCE_DIR" rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ] || return 1
  [ -z "$(git -C "$SOURCE_DIR" status --short)" ] || return 1
  local source_sha candidate_identity source_tree source_content ready_values
  local run_id ready_source ready_tree ready_content ready_configuration ready_target ready_mode
  source_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)" || return 1
  candidate_identity="$(node "$SCRIPT_DIR/release/candidate/identity.mjs" capture --repository "$SOURCE_DIR" --revision HEAD)" || return 1
  source_tree="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).treeId)' "$candidate_identity")" || return 1
  source_content="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).contentDigest)' "$candidate_identity")" || return 1
  [ -f "$RELEASE_READY_RECEIPT_FILE" ] || return 1
  ready_values="$(node - "$RELEASE_READY_RECEIPT_FILE" <<'NODE'
const receipt = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (receipt.schemaVersion !== 1 || receipt.kind !== 'workspace-ready-artifact'
  || receipt.status !== 'ready' || receipt.command !== 'ops/publish.sh ci') process.exit(1);
process.stdout.write(`${receipt.runId}\n${receipt.source.commitSha}\n${receipt.source.treeId}\n${receipt.source.contentDigest}\n${receipt.configurationDigest}\n${receipt.target.id}\n${receipt.target.mode}\n`);
NODE
)" || return 1
  run_id="$(printf '%s\n' "$ready_values" | sed -n '1p')"
  ready_source="$(printf '%s\n' "$ready_values" | sed -n '2p')"
  ready_tree="$(printf '%s\n' "$ready_values" | sed -n '3p')"
  ready_content="$(printf '%s\n' "$ready_values" | sed -n '4p')"
  ready_configuration="$(printf '%s\n' "$ready_values" | sed -n '5p')"
  ready_target="$(printf '%s\n' "$ready_values" | sed -n '6p')"
  ready_mode="$(printf '%s\n' "$ready_values" | sed -n '7p')"
  [ "$ready_source" = "$source_sha" ] && [ "$ready_tree" = "$source_tree" ] \
    && [ "$ready_content" = "$source_content" ] \
    && [ "$ready_configuration" = "$RELEASE_CONFIGURATION_DIGEST" ] \
    && [ "$ready_target" = "${DEPLOY_UNIT_ID:-monolith}" ] \
    && [ "$ready_mode" = "${DEPLOY_UNIT_MODE:-activate}" ] || return 1
  local ready_args=(
    --file "$RELEASE_READY_RECEIPT_FILE" --repository "$SOURCE_DIR" --run-id "$run_id"
    --source "$source_sha" --tree "$source_tree" --content "$source_content"
    --configuration "$RELEASE_CONFIGURATION_DIGEST" --target "$ready_target" --target-mode "$ready_mode"
    --source-receipt "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/source-validation-$ready_target-$run_id.json"
    --source-result "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/source-$run_id.json"
    --source-snapshot "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/candidate-source-snapshot-$run_id.json"
    --task-graph "$SOURCE_DIR/.cache/release-task-graphs/$run_id.json"
    --artifact-preflight "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/artifact-preflight-$ready_target-$ready_mode-$run_id.json"
    --static-acceptance "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/static-acceptance-$ready_target-$ready_mode-$run_id.json"
    --rehearsal "$SOURCE_DIR/.cache/release-artifacts/evidence/$source_content/rehearsal-$ready_target-$ready_mode-$run_id-$RELEASE_CONFIGURATION_DIGEST.json"
    --artifact-receipt "$SOURCE_DIR/.cache/release-check/release-artifact.json"
  )
  if [ "$ready_target" = monolith ]; then
    ready_args+=(--artifact "$SOURCE_DIR/.next/workspace-standalone.tgz" --manifest "$SOURCE_DIR/.next/workspace-standalone.manifest.json")
  else
    ready_args+=(--artifact "$SOURCE_DIR/.cache/deploy-units/$ready_target/$ready_target-standalone.tgz"
      --manifest "$SOURCE_DIR/.cache/deploy-units/$ready_target/$ready_target-standalone.manifest.json"
      --contract "$SOURCE_DIR/.cache/deploy-units/$ready_target/deploy-unit-contract.json")
  fi
  node "$SCRIPT_DIR/release/readiness/ready-artifact.mjs" verify "${ready_args[@]}" >/dev/null
}

probe_controller_ready() {
  local source_sha controller_json
  source_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)" || return 1
  controller_json="$(node "$SCRIPT_DIR/release/control/controller-ready.mjs" verify \
    --repository "$REPOSITORY_ROOT" --ready-source "$source_sha" --file "$RELEASE_CONTROLLER_READY_RECEIPT_FILE")" || return 1
  [ "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.sourceSha)' "$controller_json")" = "$DEPLOY_CONTROL_SOURCE_SHA" ] \
    && [ "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.treeId)' "$controller_json")" = "$DEPLOY_CONTROL_TREE_ID" ] \
    && [ "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.controlDigest)' "$controller_json")" = "$DEPLOY_CONTROL_DIGEST" ] \
    && [ "$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptDigest)' "$controller_json")" = "$DEPLOY_CONTROL_RECEIPT_DIGEST" ]
}

probe_production_state() {
  [ -n "${SERVER_READ_KEY:-}" ] && [ -f "$SERVER_READ_KEY" ] || return 1
  [ -n "$BOOTSTRAP_PRODUCTION_BASE" ] && return 0
  local source_sha candidate_identity source_tree production_state receipt_file result_file
  source_sha="$(git -C "$SOURCE_DIR" rev-parse HEAD)" || return 1
  candidate_identity="$(node "$SCRIPT_DIR/release/candidate/identity.mjs" capture --repository "$SOURCE_DIR" --revision HEAD)" || return 1
  source_tree="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).treeId)' "$candidate_identity")" || return 1
  production_state="$(ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "if [ -e '$REMOTE_DIR/.workspace/database-replacement-in-progress.json' ]; then printf 'database-replacement:'; node -e 'const s=require(process.argv[1]); process.stdout.write(s.source?.commitSha??\"\")' '$REMOTE_DIR/.workspace/database-replacement-in-progress.json'; elif [ -e '$REMOTE_DIR/.workspace/maintenance-deploy' ]; then printf 'maintenance:'; sed -n 's/^sourceSha=//p' '$REMOTE_DIR/.workspace/maintenance-deploy'; elif [ -e '$REMOTE_DIR/.workspace/production-bootstrap-in-progress.json' ]; then printf bootstrap; elif [ -f '$REMOTE_DIR/.workspace/deployed-release.json' ]; then printf ready; else printf missing; fi")" || return 1
  case "$production_state" in
    ready|"maintenance:$source_sha") ;;
    "database-replacement:$source_sha") [ -n "$DATABASE_REPLACEMENT_RECEIPT_FILE" ] || return 1 ;;
    *) return 1 ;;
  esac
  receipt_file="$TMP_DIR/preflight-probe-deployed-release.json"
  result_file="$TMP_DIR/preflight-probe-result.json"
  ssh -i "$SERVER_READ_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$SERVER" \
    "cat '$REMOTE_DIR/.workspace/deployed-release.json'" > "$receipt_file" || return 1
  local preflight_args=(
    --cwd "$SOURCE_DIR" --receipt "$receipt_file" --candidate "$source_sha"
    --candidate-tree "$source_tree" --expected-repository "$CNB_REPO"
  )
  [ -z "$GENESIS_PRODUCTION_BASE" ] || preflight_args+=(--genesis-from "$GENESIS_PRODUCTION_BASE")
  [ -z "$LOCAL_RECEIPT_RECOVERY_BASE" ] \
    || preflight_args+=(--recover-local-receipt-base "$LOCAL_RECEIPT_RECOVERY_BASE")
  node "$SCRIPT_DIR/production-deploy-preflight.mjs" "${preflight_args[@]}" > "$result_file"
}

probe_tenant_config() {
  OPS_ENV_FILE="$OPS_ENV_FILE" "$SCRIPT_DIR/sync-tenant-config.sh" --dry-run \
    --source-sha "$(git -C "$SOURCE_DIR" rev-parse HEAD)"
}
