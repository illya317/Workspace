unit_preflight_initialize() {
  DEPLOY_PREFLIGHT_EVIDENCE_ROOT="${DEPLOY_PREFLIGHT_EVIDENCE_ROOT:-$PROJECT_ROOT/.cache/release-deploy-preflight}"
  case "$DEPLOY_PREFLIGHT_EVIDENCE_ROOT" in /*) ;; *) DEPLOY_PREFLIGHT_EVIDENCE_ROOT="$PROJECT_ROOT/$DEPLOY_PREFLIGHT_EVIDENCE_ROOT" ;; esac
  DEPLOY_PREFLIGHT_ATTEMPT_ID="unit-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  DEPLOY_PREFLIGHT_LOG_ROOT="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/logs/$DEPLOY_PREFLIGHT_ATTEMPT_ID"
  DEPLOY_PREFLIGHT_BINDINGS_FILE="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/$DEPLOY_PREFLIGHT_ATTEMPT_ID-bindings.json"
  DEPLOY_PREFLIGHT_CHECKS_FILE="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/$DEPLOY_PREFLIGHT_ATTEMPT_ID-checks.tsv"
  DEPLOY_PREFLIGHT_SNAPSHOT_FILE="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/$DEPLOY_PREFLIGHT_ATTEMPT_ID-snapshot.json"
  DEPLOY_PREFLIGHT_LOCKED_SNAPSHOT_FILE="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/$DEPLOY_PREFLIGHT_ATTEMPT_ID-locked-snapshot.json"
  mkdir -p "$DEPLOY_PREFLIGHT_LOG_ROOT" || return 1
  chmod 700 "$DEPLOY_PREFLIGHT_EVIDENCE_ROOT" "$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/logs" "$DEPLOY_PREFLIGHT_LOG_ROOT" || return 1
  : > "$DEPLOY_PREFLIGHT_CHECKS_FILE" || return 1
  chmod 600 "$DEPLOY_PREFLIGHT_CHECKS_FILE" || return 1
}

unit_preflight_build_bindings() {
  local strict="$1"
  local unavailable="$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/unavailable"
  node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" bindings \
    --metadata "$PROJECT_ROOT/.cnb-release.json" \
    --artifact "${ARTIFACT_FILE:-$unavailable-artifact}" \
    --manifest "${MANIFEST_FILE:-$unavailable-manifest}" \
    --graph "${GRAPH_FILE:-$unavailable-graph}" \
    --bundle "${DEPLOY_TOOL_BUNDLE_TMP:-$unavailable-bundle}/deploy-tool-bundle-manifest.json" \
    --snapshot "$DEPLOY_PREFLIGHT_SNAPSHOT_FILE" \
    --source "${RELEASE_SOURCE_SHA:-}" --tree "${RELEASE_SOURCE_TREE:-}" \
    --content "${RELEASE_CONTENT_DIGEST:-}" --unit "${UNIT_ID:-unavailable}" \
    --mode "${MODE:-unavailable}" --operation "${COMMAND:-unavailable}" \
    --execution "${UNIT_DEPLOY_EXECUTION_MODE:-release}" \
    --server "${SERVER:-}" --remote-root "${REMOTE_DIR:-}" \
    --strict "$strict" --output "$DEPLOY_PREFLIGHT_BINDINGS_FILE"
}

unit_preflight_write_snapshot() {
  node - "$1" "$2" "$3" <<'NODE'
const { createHash } = require("node:crypto");
const { chmodSync, writeFileSync } = require("node:fs");
const [unitId, output, lines] = process.argv.slice(2);
const values = Object.fromEntries(lines.split("\n").filter(Boolean).map((line) => line.split("=")));
const body = {
  schema: "workspace.unit-production-semantic-snapshot/v1",
  currentTargetDigest: values["current-target"], deployedReceiptDigest: values["deployed-receipt"],
  gatewayManifestDigest: values["gateway-manifest"], tenantManifestDigest: values["tenant-manifest"],
  unitId, unitStateDigest: values["unit-state"],
};
const canonical = (value) => value && typeof value === "object"
  ? Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  : JSON.stringify(value);
const semanticDigest = createHash("sha256").update(canonical(body)).digest("hex");
writeFileSync(output, `${JSON.stringify({ ...body, semanticDigest }, null, 2)}\n`, { mode: 0o600 });
chmodSync(output, 0o600);
NODE
}

unit_preflight_append_check() {
  local key="$1" command_id="$2" status="$3" dependencies="$4"
  local exit_code="" log_file="$DEPLOY_PREFLIGHT_LOG_ROOT/$key.log" input_digest
  case "$status" in passed) exit_code=0 ;; failed) exit_code=1 ;; blocked) ;; *) return 1 ;; esac
  printf 'check=%s status=%s exitCode=%s\n' "$key" "$status" "${exit_code:-null}" > "$log_file" || return 1
  chmod 600 "$log_file" || return 1
  input_digest="$(node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" input-digest \
    --bindings "$DEPLOY_PREFLIGHT_BINDINGS_FILE" --key "$key" --command "$command_id")" || return 1
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$key" "$command_id" "$input_digest" "$status" "$exit_code" "$dependencies" "$log_file" \
    >> "$DEPLOY_PREFLIGHT_CHECKS_FILE"
}

unit_preflight_record_receipts() {
  local record_json
  record_json="$(node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" record \
    --root "$DEPLOY_PREFLIGHT_EVIDENCE_ROOT" --attempt "$DEPLOY_PREFLIGHT_ATTEMPT_ID" \
    --bindings "$DEPLOY_PREFLIGHT_BINDINGS_FILE" --checks "$DEPLOY_PREFLIGHT_CHECKS_FILE")" || return 1
  DEPLOY_PREFLIGHT_ATTEMPT_FILE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).attemptFile)' "$record_json")" || return 1
  DEPLOY_PREFLIGHT_READY_FILE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).readyFile ?? "")' "$record_json")" || return 1
}

unit_preflight_verify_ready() {
  [ -n "$DEPLOY_PREFLIGHT_READY_FILE" ] || return 1
  node "$PROJECT_ROOT/ops/release/deploy/unit-preflight.mjs" verify \
    --bindings "$DEPLOY_PREFLIGHT_BINDINGS_FILE" --ready "$DEPLOY_PREFLIGHT_READY_FILE" \
    --attempt "$DEPLOY_PREFLIGHT_ATTEMPT_FILE" >/dev/null
}

unit_preflight_failed_matches() {
  local item pattern
  for item in "${preflight_failed[@]}"; do
    for pattern in "$@"; do case "$item" in $pattern) return 0 ;; esac; done
  done
  return 1
}

unit_preflight_finalize_evidence() {
  unit_preflight_build_bindings 0 || return 1
  local input_local_status=passed input_remote_status=passed bundle_status=passed
  local artifact_status=passed tenant_status=passed transport_status=passed
  local runtime_status=passed snapshot_status=passed exact_status=blocked
  unit_preflight_failed_matches 'runtime.deploy-*' 'runtime.package-*' 'metadata.*' 'input.unit-*' 'input.command' \
    'input.deploy-mode' 'input.trusted-build' 'input.prepared-*' 'input.OPS_ENV_FILE' 'input.RELEASE_SOURCE_SHA' \
    && input_local_status=failed
  unit_preflight_failed_matches 'input.SERVER' 'input.REMOTE_DIR' 'input.shell-safe-*' 'input.pm2-*' 'input.KEY*' \
    'input.deploy-key' 'runtime.ssh-control-*' && input_remote_status=failed
  unit_preflight_failed_matches 'deploy-tool-bundle.*' && bundle_status=failed
  unit_preflight_failed_matches 'artifact.*' 'gateway.*' && artifact_status=failed
  if [ "$input_local_status" != passed ]; then tenant_status=blocked
  elif unit_preflight_failed_matches 'tenant-config.*'; then tenant_status=failed; fi
  if [ "$input_remote_status" != passed ]; then transport_status=blocked
  elif unit_preflight_failed_matches 'transport.connect'; then transport_status=failed; fi
  if [ "$transport_status" != passed ]; then runtime_status=blocked
  elif unit_preflight_failed_matches 'runtime.remote-contract'; then runtime_status=failed; fi
  if [ "$runtime_status" != passed ]; then snapshot_status=blocked
  elif unit_preflight_failed_matches 'production.semantic-snapshot'; then snapshot_status=failed; fi
  if [ "$input_local_status" = passed ] && [ "$input_remote_status" = passed ] \
    && [ "$bundle_status" = passed ] && [ "$artifact_status" = passed ] \
    && [ "$tenant_status" = passed ] && [ "$transport_status" = passed ] \
    && [ "$runtime_status" = passed ] && [ "$snapshot_status" = passed ]; then
    if unit_preflight_build_bindings 1; then exact_status=passed
    else exact_status=failed; preflight_fail "bindings.exact"; fi
  fi
  unit_preflight_append_check input.local unit-input-local-v1 "$input_local_status" "" \
    && unit_preflight_append_check input.remote unit-input-remote-v1 "$input_remote_status" "" \
    && unit_preflight_append_check deploy-tool-bundle unit-tool-bundle-v1 "$bundle_status" "" \
    && unit_preflight_append_check artifact.contract unit-artifact-contract-v1 "$artifact_status" "" \
    && unit_preflight_append_check transport.connect unit-transport-v1 "$transport_status" input.remote \
    && unit_preflight_append_check tenant-config unit-tenant-config-v1 "$tenant_status" input.local \
    && unit_preflight_append_check runtime.remote-contract unit-runtime-contract-v1 "$runtime_status" transport.connect \
    && unit_preflight_append_check production.semantic-snapshot unit-production-snapshot-v1 "$snapshot_status" runtime.remote-contract \
    && unit_preflight_append_check bindings.exact unit-bindings-v1 "$exact_status" \
      'input.local,input.remote,deploy-tool-bundle,artifact.contract,transport.connect,tenant-config,runtime.remote-contract,production.semantic-snapshot' \
    && unit_preflight_record_receipts
}
