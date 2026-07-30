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

export RELEASE_SOURCE_SHA="${RELEASE_SOURCE_SHA:-$(git rev-parse HEAD^)}"
export RELEASE_SOURCE_TREE="${RELEASE_SOURCE_TREE:-$(git rev-parse "${RELEASE_SOURCE_SHA}^{tree}")}"
: "${RELEASE_ACTION:?RELEASE_ACTION is required from rendered release metadata}"
: "${RELEASE_VALIDATION_BASE_SHA:?RELEASE_VALIDATION_BASE_SHA is required from rendered release metadata}"
export RELEASE_TIMING_FILE="${RELEASE_TIMING_FILE:-$PWD/.cache/release-timing/${RELEASE_SOURCE_SHA}.ndjson}"
export RELEASE_TIMING_RELEASE_ID="${RELEASE_TIMING_RELEASE_ID:-$RELEASE_SOURCE_SHA}"

# shellcheck source=ops/lib/release-timing.sh
source ./ops/lib/release-timing.sh
release_timing_configure "$RELEASE_TIMING_FILE" "$RELEASE_TIMING_RELEASE_ID" cnb
release_timing_run "$stage" "$@"
