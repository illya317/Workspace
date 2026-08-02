preflight_candidate_artifact_graph() (
  trap - EXIT
  resolve_release_metadata || exit "$?"
  build_artifact || exit "$?"
  prepare_local_deploy_graph
  status=$?
  rm -f "${FULL_DEPLOY_GRAPH_TMP:-}"
  exit "$status"
)

preflight_deploy_tool_bundle() (
  trap - EXIT
  prepare_local_deploy_tool_bundle
  status=$?
  [ -z "${DEPLOY_TOOL_BUNDLE_TMP:-}" ] || rm -rf "$DEPLOY_TOOL_BUNDLE_TMP"
  exit "$status"
)

capture_production_semantic_snapshot() {
  local output_file="$1"
  local snapshot_json
  snapshot_json="$(ssh_cmd "node - '$REMOTE_DIR' '$REMOTE_WORKSPACE_CONFIG_DIR' '$REMOTE_CONTROL_PLANE_RECEIPT' '$REMOTE_GATEWAY_ROOT' <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, readlinkSync } = require('node:fs');
const { join } = require('node:path');
const [root, configRoot, controllerReceipt, gatewayRoot] = process.argv.slice(2);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => value && typeof value === 'object' && !Buffer.isBuffer(value)
  ? Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  : JSON.stringify(value);
const fileDigest = (file, label) => {
  try { return hash(readFileSync(file)); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return hash('missing:' + label);
  }
};
let currentTargetDigest;
try { currentTargetDigest = hash('symlink:' + readlinkSync(join(root, 'current'))); }
catch (error) {
  if (error?.code !== 'ENOENT' && error?.code !== 'EINVAL') throw error;
  currentTargetDigest = hash('missing:current');
}
const body = {
  schema: 'workspace.production-semantic-snapshot/v1',
  controllerReceiptDigest: fileDigest(controllerReceipt, 'controller-receipt'),
  currentTargetDigest,
  deployedReceiptDigest: fileDigest(join(configRoot, 'deployed-release.json'), 'deployed-receipt'),
  gatewayRouteMapDigest: fileDigest(join(gatewayRoot, 'current', 'route-map.json'), 'gateway-route-map'),
  tenantManifestDigest: fileDigest(join(configRoot, '.deployment', 'tenant-config-manifest.json'), 'tenant-manifest'),
};
process.stdout.write(JSON.stringify({ ...body, semanticDigest: hash(canonical(body)) }));
NODE
")" || return 1
  printf '%s\n' "$snapshot_json" > "$output_file"
  chmod 600 "$output_file"
  node "$SCRIPT_DIR/release/deploy/full-preflight.mjs" snapshot-compare \
    --expected "$output_file" --actual "$output_file"
  echo "production semantic snapshot captured"
}

write_deploy_preflight_context() {
  local output_file="$1"
  local artifact_file="${ARTIFACT_PATH:-$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/unavailable-artifact}"
  local manifest_file="${ARTIFACT_MANIFEST_PATH:-$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/unavailable-manifest}"
  local graph_file="${FULL_DEPLOY_GRAPH_TMP:-$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/unavailable-graph}"
  local bundle_manifest="${DEPLOY_TOOL_BUNDLE_TMP:-$DEPLOY_PREFLIGHT_EVIDENCE_ROOT/unavailable-bundle}/deploy-tool-bundle-manifest.json"
  node - "$output_file" "$RELEASE_METADATA_FILE" "$artifact_file" "$manifest_file" \
    "$graph_file" "$bundle_manifest" "$DEPLOY_PREFLIGHT_SNAPSHOT_FILE" \
    "${RELEASE_SOURCE_SHA:-}" "${RELEASE_SOURCE_TREE:-}" "$RELEASE_CONTENT_DIGEST" \
    "${ARTIFACT_SHA:-}" "${RELEASE_MIGRATION_SET_SHA:-}" "$SERVER" "$REMOTE_DIR" \
    "$DEPLOY_EXECUTION_MODE" "$WORKSPACE_RUNTIME_PM2_MODE" <<'NODE'
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const [output, metadataFile, artifactFile, manifestFile, deployGraphFile, deployToolBundleManifest,
  snapshotFile, sourceSha, sourceTree, contentDigest, artifactSha, migrationSetDigest, server, remoteRoot,
  executionMode, runtimeMode] = process.argv.slice(2);
const hash = (value) => createHash('sha256').update(value).digest('hex');
writeFileSync(output, JSON.stringify({
  metadataFile: resolve(metadataFile), artifactFile: resolve(artifactFile), manifestFile: resolve(manifestFile),
  deployGraphFile: resolve(deployGraphFile), deployToolBundleManifest: resolve(deployToolBundleManifest),
  snapshotFile: resolve(snapshotFile), sourceSha, sourceTree, contentDigest, artifactSha, migrationSetDigest,
  serverIdentityDigest: hash(server), remoteRootDigest: hash(remoteRoot), executionMode, runtimeMode,
}, null, 2) + '\n', { mode: 0o600 });
NODE
  chmod 600 "$output_file"
}

record_deploy_preflight_receipts() {
  local strict="$1"
  local record_json
  write_deploy_preflight_context "$DEPLOY_PREFLIGHT_CONTEXT_FILE" || return 1
  node "$SCRIPT_DIR/release/deploy/full-preflight.mjs" bindings \
    --context "$DEPLOY_PREFLIGHT_CONTEXT_FILE" --output "$DEPLOY_PREFLIGHT_BINDINGS_FILE" \
    --strict "$strict" --rehash 0 || return 1
  record_json="$(node "$SCRIPT_DIR/release/deploy/full-preflight.mjs" record \
    --root "$DEPLOY_PREFLIGHT_EVIDENCE_ROOT" --attempt "$DEPLOY_PREFLIGHT_ATTEMPT_ID" \
    --bindings "$DEPLOY_PREFLIGHT_BINDINGS_FILE" --checks "$DEPLOY_PREFLIGHT_CHECKS_FILE")" || return 1
  DEPLOY_PREFLIGHT_ATTEMPT_FILE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).attemptFile)' "$record_json")" || return 1
  DEPLOY_PREFLIGHT_READY_FILE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).readyFile ?? "")' "$record_json")" || return 1
}
