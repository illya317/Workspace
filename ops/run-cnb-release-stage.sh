#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$#" -lt 3 ] || [ "$2" != "--" ]; then
  echo "用法: run-cnb-release-stage.sh <stage> -- <command> [args...]"
  exit 2
fi

stage="$1"
shift 2

injection_files="$(git diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort)"
if [ "$injection_files" != $'.cnb-release.json\n.cnb.yml' ]; then
  echo "[错误] CNB release stage 必须运行在精确的 release injection commit"
  exit 1
fi

metadata_values="$(node - <<'NODE'
const metadata = JSON.parse(require('node:fs').readFileSync('.cnb-release.json', 'utf8'));
const source = metadata.source;
const controller = metadata.controllerReady?.controller;
if (metadata.schemaVersion !== 3 || metadata.controllerReady?.readySource !== source?.commitSha) {
  throw new Error('release metadata identity contract is invalid');
}
if (!/^[0-9a-f]{40}$/.test(controller?.sourceSha ?? '')
  || !/^[0-9a-f]{40}$/.test(controller?.treeId ?? '')
  || !/^[0-9a-f]{64}$/.test(controller?.controlDigest ?? '')
  || !/^[0-9a-f]{64}$/.test(metadata.controllerReady?.receiptDigest ?? '')) {
  throw new Error('release metadata Controller Ready identity is invalid');
}
process.stdout.write(`${source.commitSha}\n${source.treeSha}\n${source.contentDigest}\n${controller.sourceSha}\n${controller.treeId}\n${controller.controlDigest}\n${metadata.controllerReady.receiptDigest}\n`);
NODE
)"
metadata_source_sha="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
metadata_source_tree="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
metadata_content_digest="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
RELEASE_CONTROLLER_SOURCE_SHA="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
RELEASE_CONTROLLER_TREE_ID="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
RELEASE_CONTROLLER_CONTROL_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '6p')"
RELEASE_CONTROLLER_RECEIPT_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '7p')"
[ "$(git rev-parse HEAD^)" = "$RELEASE_CONTROLLER_SOURCE_SHA" ] \
  && [ "$(git rev-parse 'HEAD^^{tree}')" = "$RELEASE_CONTROLLER_TREE_ID" ] \
  || { echo "[错误] injection parent 不是 Controller Ready source/tree" >&2; exit 1; }
for pair in "${RELEASE_SOURCE_SHA:-}:$metadata_source_sha" "${RELEASE_SOURCE_TREE:-}:$metadata_source_tree" "${RELEASE_CONTENT_DIGEST:-}:$metadata_content_digest"; do
  [ -z "${pair%%:*}" ] || [ "${pair%%:*}" = "${pair#*:}" ] \
    || { echo "[错误] release 环境与 Application Ready metadata 不一致" >&2; exit 1; }
done
RELEASE_SOURCE_SHA="$metadata_source_sha"
RELEASE_SOURCE_TREE="$metadata_source_tree"
RELEASE_CONTENT_DIGEST="$metadata_content_digest"
candidate_identity="$(node ops/release/candidate/identity.mjs capture --repository "$PWD" --revision "$RELEASE_SOURCE_SHA")"
[ "$(node -e 'const v=JSON.parse(process.argv[1]);process.stdout.write(`${v.treeId}\n${v.contentDigest}`)' "$candidate_identity")" = "$RELEASE_SOURCE_TREE"$'\n'"$RELEASE_CONTENT_DIGEST" ] \
  || { echo "[错误] Application Ready source/tree/content 无法复现" >&2; exit 1; }
export RELEASE_SOURCE_SHA RELEASE_SOURCE_TREE RELEASE_CONTENT_DIGEST
export RELEASE_CONTROLLER_SOURCE_SHA RELEASE_CONTROLLER_TREE_ID RELEASE_CONTROLLER_CONTROL_DIGEST RELEASE_CONTROLLER_RECEIPT_DIGEST
: "${RELEASE_ACTION:?RELEASE_ACTION is required from rendered release metadata}"
: "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required from rendered release metadata}"
export RELEASE_TIMING_FILE="${RELEASE_TIMING_FILE:-$PWD/.cache/release-timing/${RELEASE_SOURCE_SHA}.ndjson}"
export RELEASE_TIMING_RELEASE_ID="${RELEASE_TIMING_RELEASE_ID:-$RELEASE_SOURCE_SHA}"

# shellcheck source=ops/lib/release-timing.sh
source ./ops/lib/release-timing.sh
release_timing_configure "$RELEASE_TIMING_FILE" "$RELEASE_TIMING_RELEASE_ID" cnb
release_timing_run "$stage" "$@"
