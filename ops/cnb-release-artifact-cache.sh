#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

COMMAND="${1:-}"
UNIT_ID="${DEPLOY_UNIT_ID:-}"
SOURCE_TREE="${RELEASE_SOURCE_TREE:-$(git rev-parse 'HEAD^{tree}')}"
CONTENT_DIGEST="${RELEASE_CONTENT_DIGEST:?RELEASE_CONTENT_DIGEST is required}"
CACHE_ROOT="${CNB_RELEASE_ARTIFACT_CACHE_ROOT:-.cache/release-artifacts}"
HIT_MARKER="${CNB_RELEASE_ARTIFACT_HIT_MARKER:-.cache/release-artifact-cache-hit}"
RECEIPT_FILE="${CNB_RELEASE_ARTIFACT_RECEIPT_FILE:-$PWD/.cache/release-check/release-artifact.json}"

[[ "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ ]] || { echo "[错误] artifact cache source tree 无效" >&2; exit 2; }
[[ "$CONTENT_DIGEST" =~ ^[0-9a-f]{64}$ ]] || { echo "[错误] artifact cache content digest 无效" >&2; exit 2; }
if [ -n "$UNIT_ID" ] && [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "[错误] artifact cache unit id 无效" >&2
  exit 2
fi
case "$CACHE_ROOT" in
  /*|.cache/*) ;;
  *) echo "[错误] artifact cache root 必须是绝对路径或位于 .cache" >&2; exit 2 ;;
esac

TARGET_ID="${UNIT_ID:-monolith}"
CACHE_DIR="$CACHE_ROOT/$TARGET_ID/$CONTENT_DIGEST"

verify_monolith() {
  local artifact=$1 manifest=$2
  node - "$artifact" "$manifest" "$SOURCE_TREE" "$CONTENT_DIGEST" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, statSync } = require('node:fs');
const [artifactFile, manifestFile, sourceTree, contentDigest] = process.argv.slice(2);
const artifact = readFileSync(artifactFile);
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const digest = createHash('sha256').update(artifact).digest('hex');
if (manifest.schemaVersion !== 2
  || manifest.source?.treeSha !== sourceTree
  || manifest.source?.contentDigest !== contentDigest
  || manifest.build?.buildId !== contentDigest
  || manifest.artifact?.sha256 !== digest
  || manifest.artifact?.sizeBytes !== statSync(artifactFile).size) process.exit(1);
NODE
}

restore_cache() {
  rm -f "$HIT_MARKER"
  local cached_receipt="$CACHE_DIR/release-artifact.json"
  [ -f "$cached_receipt" ] || { echo "==> CNB artifact cache miss: $TARGET_ID ${SOURCE_TREE:0:12}"; return 1; }
  if [ -z "$UNIT_ID" ]; then
    local artifact="$CACHE_DIR/workspace-standalone.tgz"
    local manifest="$CACHE_DIR/workspace-standalone.manifest.json"
    local graph="$CACHE_DIR/deploy-graph.json"
    if [ ! -f "$artifact" ] || [ ! -f "$manifest" ] || [ ! -f "$graph" ] || ! verify_monolith "$artifact" "$manifest" \
      || ! node ops/gateway-generation.mjs graph-assert --graph "$graph" \
        --digest "$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.inputs.deployGraphSha256)' "$manifest")" >/dev/null; then
      echo "==> CNB artifact cache miss: monolith ${SOURCE_TREE:0:12}"
      return 1
    fi
    local output_artifact="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
    local output_manifest="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
    local output_graph="${STANDALONE_DEPLOY_GRAPH_PATH:-.cache/release-check/deploy-graph.json}"
    mkdir -p "$(dirname "$output_artifact")" "$(dirname "$output_manifest")" "$(dirname "$output_graph")" "$(dirname "$HIT_MARKER")"
    cp "$artifact" "$output_artifact"
    cp "$manifest" "$output_manifest"
    cp "$graph" "$output_graph"
    verify_monolith "$output_artifact" "$output_manifest"
  else
    local artifact="$CACHE_DIR/$UNIT_ID-standalone.tgz"
    local manifest="$CACHE_DIR/$UNIT_ID-standalone.manifest.json"
    local contract="$CACHE_DIR/deploy-unit-contract.json"
    local graph="$CACHE_DIR/deploy-graph.json"
    if [ ! -f "$artifact" ] || [ ! -f "$manifest" ] || [ ! -f "$contract" ] || [ ! -f "$graph" ]; then
      echo "==> CNB artifact cache miss: $UNIT_ID ${SOURCE_TREE:0:12}"
      return 1
    fi
    if ! node ops/deploy-unit-release.mjs artifact-assert --artifact "$artifact" --manifest "$manifest" --contract "$contract" >/dev/null \
      || ! node ops/gateway-generation.mjs graph-assert --graph "$graph" \
        --digest "$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.unit.graphSha256)' "$manifest")" >/dev/null \
      || ! SOURCE_TREE="$SOURCE_TREE" UNIT_ID="$UNIT_ID" MANIFEST="$manifest" node - <<'NODE'
const manifest = JSON.parse(require('node:fs').readFileSync(process.env.MANIFEST, 'utf8'));
if (manifest.unit?.id !== process.env.UNIT_ID
  || manifest.source?.treeSha !== process.env.SOURCE_TREE) process.exit(1);
NODE
    then
      echo "==> CNB artifact cache invalid: $UNIT_ID ${SOURCE_TREE:0:12}"
      return 1
    fi
    local output_root="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
    mkdir -p "$output_root" "$(dirname "$HIT_MARKER")"
    cp "$artifact" "$output_root/$UNIT_ID-standalone.tgz"
    cp "$manifest" "$output_root/$UNIT_ID-standalone.manifest.json"
    cp "$contract" "$output_root/deploy-unit-contract.json"
    cp "$graph" "$output_root/deploy-graph.json"
  fi
  mkdir -p "$(dirname "$RECEIPT_FILE")"
  cp "$cached_receipt" "$RECEIPT_FILE"
  node ops/release-gate-receipt.mjs artifact-verify \
    --content "$CONTENT_DIGEST" --tree "$SOURCE_TREE" \
    --target "$TARGET_ID" --file "$RECEIPT_FILE" >/dev/null
  printf '%s\n' "$TARGET_ID:$CONTENT_DIGEST:$SOURCE_TREE" > "$HIT_MARKER"
  chmod 600 "$HIT_MARKER"
  touch "$CACHE_DIR"
  echo "==> CNB artifact cache hit: $TARGET_ID ${SOURCE_TREE:0:12}"
}

store_cache() {
  local temporary="$CACHE_ROOT/$TARGET_ID/.tmp-$CONTENT_DIGEST-$$"
  mkdir -p "$(dirname "$temporary")"
  rm -rf "$temporary"
  mkdir -m 700 "$temporary"
  node ops/release-gate-receipt.mjs artifact-verify \
    --content "$CONTENT_DIGEST" --tree "$SOURCE_TREE" \
    --target "$TARGET_ID" --file "$RECEIPT_FILE" >/dev/null
  cp "$RECEIPT_FILE" "$temporary/release-artifact.json"
  if [ -z "$UNIT_ID" ]; then
    local artifact="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
    local manifest="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
    local graph="${STANDALONE_DEPLOY_GRAPH_PATH:-.next/workspace-deploy-graph.json}"
    verify_monolith "$artifact" "$manifest"
    node ops/gateway-generation.mjs graph-assert --graph "$graph" \
      --digest "$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.inputs.deployGraphSha256)' "$manifest")" >/dev/null
    cp "$artifact" "$temporary/workspace-standalone.tgz"
    cp "$manifest" "$temporary/workspace-standalone.manifest.json"
    cp "$graph" "$temporary/deploy-graph.json"
  else
    local output_root="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
    node ops/deploy-unit-release.mjs artifact-assert \
      --artifact "$output_root/$UNIT_ID-standalone.tgz" \
      --manifest "$output_root/$UNIT_ID-standalone.manifest.json" \
      --contract "$output_root/deploy-unit-contract.json" >/dev/null
    cp "$output_root/$UNIT_ID-standalone.tgz" "$temporary/"
    cp "$output_root/$UNIT_ID-standalone.manifest.json" "$temporary/"
    cp "$output_root/deploy-unit-contract.json" "$temporary/"
    cp "$output_root/deploy-graph.json" "$temporary/"
  fi
  chmod 600 "$temporary"/*
  if [ -d "$CACHE_DIR" ]; then
    rm -rf "$temporary"
    if restore_cache >/dev/null; then
      echo "==> CNB artifact cache already stored: $TARGET_ID ${SOURCE_TREE:0:12}"
      return
    fi
    echo "[错误] 已存在的 immutable artifact cache 无法通过复验: $CACHE_DIR" >&2
    return 1
  fi
  local install_status=0
  node - "$temporary" "$CACHE_DIR" <<'NODE' || install_status=$?
const { renameSync } = require('node:fs');
const [source, target] = process.argv.slice(2);
try {
  renameSync(source, target);
} catch (error) {
  if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') process.exit(17);
  throw error;
}
NODE
  if [ "$install_status" -ne 0 ]; then
    if [ "$install_status" -ne 17 ]; then return "$install_status"; fi
    rm -rf "$temporary"
    if restore_cache >/dev/null; then
      echo "==> CNB artifact cache concurrently stored: $TARGET_ID ${SOURCE_TREE:0:12}"
      return
    fi
    echo "[错误] 并发写入的 immutable artifact cache 无法通过复验: $CACHE_DIR" >&2
    return 1
  fi
  echo "==> CNB artifact cache stored: $TARGET_ID ${SOURCE_TREE:0:12}"
}

case "$COMMAND" in
  restore) restore_cache ;;
  store) store_cache ;;
  *) echo "用法: $0 restore|store" >&2; exit 2 ;;
esac
