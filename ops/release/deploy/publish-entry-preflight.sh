#!/usr/bin/env bash

deploy_preflight_failures=()

deploy_preflight_fail() {
  deploy_preflight_failures+=("$1")
}

finish_deploy_entry_preflight() {
  [ "${#deploy_preflight_failures[@]}" -eq 0 ] && return 0
  echo "[错误] deploy 入口预检发现 ${#deploy_preflight_failures[@]} 项失败：" >&2
  printf '  - %s\n' "${deploy_preflight_failures[@]}" >&2
  return 1
}

load_selected_ready() {
  ready_json="$(node "$RELEASE_SCRIPT_DIR/release/readiness/ready-artifact.mjs" current \
    --root "$RELEASE_WORKTREE/.cache/release-ready" "${READY_SELECTOR_ARGS[@]}")" || return 1
  ready_file="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptFile)' "$ready_json")" || return 1
  ready_values="$(node -e '
    const r=JSON.parse(process.argv[1]).receipt;
    process.stdout.write(`${r.runId}\n${r.source.commitSha}\n${r.source.treeId}\n${r.source.contentDigest}\n${r.configurationDigest}\n${r.target.id}\n${r.target.mode}\n`);
  ' "$ready_json")" || return 1
  ready_run_id="$(printf '%s\n' "$ready_values" | sed -n '1p')"
  ready_source="$(printf '%s\n' "$ready_values" | sed -n '2p')"
  ready_tree="$(printf '%s\n' "$ready_values" | sed -n '3p')"
  ready_content="$(printf '%s\n' "$ready_values" | sed -n '4p')"
  ready_configuration="$(printf '%s\n' "$ready_values" | sed -n '5p')"
  target_id="$(printf '%s\n' "$ready_values" | sed -n '6p')"
  target_mode="$(printf '%s\n' "$ready_values" | sed -n '7p')"
  [ "$target_id" = "$SELECTED_READY_TARGET" ] && [ "$target_mode" = "$SELECTED_READY_MODE" ] || {
    echo "[错误] selected Ready target 与 receipt target 不一致；deploy 禁止重定向目标" >&2
    return 1
  }
  [ "$ready_source" = "$RELEASE_SOURCE_SHA" ] && [ "$ready_tree" = "$RELEASE_SOURCE_TREE" ] \
    && [ "$ready_content" = "$RELEASE_CONTENT_DIGEST" ] && [ "$ready_configuration" = "$RELEASE_CONFIGURATION_DIGEST" ] || {
      echo "[错误] 当前 release source/config 没有 Ready Artifact；先运行 ci" >&2
      return 1
    }
}

load_controller_ready() {
  controller_ready_file="${DEPLOY_CONTROLLER_READY_RECEIPT_FILE:-$REPOSITORY_ROOT/.cache/release-control/controller-ready.json}"
  controller_ready_json="$(node "$SCRIPT_DIR/release/control/controller-ready.mjs" verify \
    --repository "$REPOSITORY_ROOT" --ready-source "$ready_source" --file "$controller_ready_file")" || return 1
  DEPLOY_CONTROL_SOURCE_SHA="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.sourceSha)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_TREE_ID="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.treeId)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).controller.controlDigest)' "$controller_ready_json")" || return 1
  DEPLOY_CONTROL_RECEIPT_DIGEST="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).receiptDigest)' "$controller_ready_json")" || return 1
  export DEPLOY_CONTROL_SOURCE_SHA DEPLOY_CONTROL_TREE_ID DEPLOY_CONTROL_DIGEST DEPLOY_CONTROL_RECEIPT_DIGEST
}
