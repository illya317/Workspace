#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
CACHE_STATE_DIR=".release/cnb-type-cache"
CACHE_CONTAINER=""

fail() { echo "[错误] $*" >&2; exit 1; }
require() { [ -n "${!1:-}" ] || fail "缺少 $1"; }

cleanup() {
  if [ -n "$CACHE_CONTAINER" ]; then
    docker rm -f "$CACHE_CONTAINER" >/dev/null 2>&1 || true
  fi
  rm -rf "$CACHE_STATE_DIR"
}
trap cleanup EXIT

verify_main_push() {
  for key in CNB_COMMIT CNB_DOCKER_REGISTRY CNB_REPO_SLUG_LOWERCASE; do require "$key"; done
  [ "${CNB_EVENT:-}" = push ] || fail "TypeScript 跨 runner 缓存只接受 push 流水线"
  [ "${CNB_BRANCH:-}" = main ] || fail "TypeScript 跨 runner 缓存只接受 main"
  [[ "$CNB_COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "CNB_COMMIT 必须是完整小写 SHA"
  CACHE_REF="${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:typecache-main"
}

has_local_incremental_cache() {
  [ -d .cache/types ] && [ -d .cache/tsbuild ] \
    && find .cache/types -type f -print -quit | grep -q . \
    && find .cache/tsbuild -type f -name '*.tsbuildinfo' -print -quit | grep -q .
}

restore_cache() {
  verify_main_push
  if has_local_incremental_cache; then
    echo "CNB TypeScript node-local cache present; cross-runner restore skipped"
    return 0
  fi
  if ! docker pull "$CACHE_REF"; then
    echo "CNB TypeScript cross-runner cache miss: $CACHE_REF"
    return 0
  fi

  CACHE_CONTAINER="$(docker create "$CACHE_REF")"
  rm -rf .cache/types .cache/tsbuild
  mkdir -p .cache/types .cache/tsbuild
  docker cp "$CACHE_CONTAINER:/workspace/.cache/types/." .cache/types/
  docker cp "$CACHE_CONTAINER:/workspace/.cache/tsbuild/." .cache/tsbuild/
  has_local_incremental_cache || fail "Registry TypeScript 缓存内容不完整"
  echo "CNB TypeScript cross-runner cache restored: $CACHE_REF"
}

publish_cache() {
  verify_main_push
  has_local_incremental_cache || fail "没有可发布的 TypeScript 增量缓存"

  context="$CACHE_STATE_DIR/context"
  mkdir -p "$context/types" "$context/tsbuild"
  cp -a .cache/types/. "$context/types/"
  cp -a .cache/tsbuild/. "$context/tsbuild/"
  docker buildx build \
    --platform linux/amd64 \
    --file ops/cnb-type-cache.Dockerfile \
    --tag "$CACHE_REF" \
    --build-arg "SOURCE_SHA=$CNB_COMMIT" \
    --provenance=false \
    --push "$context"
  echo "CNB TypeScript cross-runner cache published: $CACHE_REF"
}

case "$ACTION" in
  restore) restore_cache ;;
  publish) publish_cache ;;
  *) fail "用法: cnb-type-cache.sh restore|publish" ;;
esac
