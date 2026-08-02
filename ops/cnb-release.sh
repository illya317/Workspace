#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
STATE_DIR="${CNB_RELEASE_STATE_DIR:-.release/cnb}"
RELEASE_FILE="$STATE_DIR/release.json"

fail() { echo "[错误] $*" >&2; exit 1; }
require() { [ -n "${!1:-}" ] || fail "缺少 $1"; }
write_state() { printf '%s\n' "$2" > "$STATE_DIR/$1"; }
read_state() { [ -s "$STATE_DIR/$1" ] || fail "缺少 CNB release state: $1"; sed -n '1p' "$STATE_DIR/$1"; }

load_release_state() {
  SOURCE_SHA="$(read_state source-sha)"
  SOURCE_TREE="$(read_state source-tree)"
  IMAGE_REF="$(read_state image-ref)"
  IMAGE_DIGEST="$(read_state image-digest)"
  [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "state SOURCE_SHA 非法"
  [[ "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ ]] || fail "state SOURCE_TREE 非法"
  [[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "state IMAGE_DIGEST 非法"
  [ -s "$RELEASE_FILE" ] || fail "缺少 release.json"
  export SOURCE_SHA SOURCE_TREE IMAGE_REF IMAGE_DIGEST RELEASE_MANIFEST_FILE="$RELEASE_FILE"
  export DEPLOY_IMAGE_REF="$IMAGE_REF" APPROVED_IMAGE_REF="$IMAGE_REF"
}

build_and_publish() {
  for key in CNB_COMMIT CNB_BUILD_ID CNB_DOCKER_REGISTRY CNB_REPO_SLUG_LOWERCASE; do require "$key"; done
  [ "${CNB_EVENT:-}" = push ] || fail "只有 push 流水线可以发布镜像"
  [ "${CNB_BRANCH:-}" = main ] || fail "只有 main 可以发布镜像"
  [[ "$CNB_COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "CNB_COMMIT 必须是完整小写 SHA"

  source_sha="$(git rev-parse HEAD)"
  source_tree="$(git rev-parse 'HEAD^{tree}')"
  [ "$source_sha" = "$CNB_COMMIT" ] || fail "CNB checkout 与 CNB_COMMIT 不一致"
  identity="$(node ops/release/candidate/identity.mjs capture --repository "$PWD" --revision HEAD)"
  content_digest="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.contentDigest)' "$identity")"
  [[ "$content_digest" =~ ^[0-9a-f]{64}$ ]] || fail "候选内容 digest 非法"

  artifact=".next/workspace-standalone.tgz"
  artifact_manifest=".next/workspace-standalone.manifest.json"
  [ -s "$artifact" ] && [ -s "$artifact_manifest" ] || fail "缺少已通过 CNB CI 的 standalone 产物"

  image_ref="${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}"
  image_tag="${image_ref}:sha-${source_sha}"
  cache_ref="${image_ref}:buildcache-main"
  context="$STATE_DIR/image-context"
  metadata="$STATE_DIR/image-metadata.json"
  rm -rf "$STATE_DIR"
  mkdir -p "$context/runtime" "$context/release"
  tar -xzf "$artifact" -C "$context/runtime"
  cp "$artifact" "$artifact_manifest" "$context/release/"

  docker buildx build \
    --platform linux/amd64 \
    --file ops/image.Dockerfile \
    --tag "$image_tag" \
    --cache-from "type=registry,ref=${cache_ref}" \
    --cache-to "type=registry,ref=${cache_ref},mode=max" \
    --label "org.opencontainers.image.revision=$source_sha" \
    --label "org.opencontainers.image.source=${CNB_REPO_URL_HTTPS:-cnb://${CNB_REPO_SLUG_LOWERCASE}}" \
    --metadata-file "$metadata" \
    --provenance=false \
    --push "$context"
  image_digest="$(node -e 'const v=require(process.argv[1]); process.stdout.write(v["containerimage.digest"]||"")' "$(realpath "$metadata")")"
  [[ "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "CNB Registry 未返回不可变镜像 digest"

  mkdir -p "$STATE_DIR"
  node ops/image-release-manifest.mjs create \
    --artifact "$artifact" \
    --artifact-manifest "$artifact_manifest" \
    --image-ref "$image_ref" \
    --image-digest "$image_digest" \
    --cnb-build-id "$CNB_BUILD_ID" \
    --cnb-event "$CNB_EVENT" \
    --output "$RELEASE_FILE"
  node ops/image-release-manifest.mjs verify \
    --file "$RELEASE_FILE" --source-sha "$source_sha" --source-tree "$source_tree" \
    --image-ref "$image_ref" --image-digest "$image_digest" >/dev/null
  write_state source-sha "$source_sha"
  write_state source-tree "$source_tree"
  write_state image-ref "$image_ref"
  write_state image-digest "$image_digest"
  echo "CNB image published once: ${image_ref}@${image_digest}"
}

case "$ACTION" in
  build)
    build_and_publish
    ;;
  verify)
    load_release_state
    docker pull "${IMAGE_REF}@${IMAGE_DIGEST}"
    bash ./ops/deploy-image.sh verify
    ;;
  rehearsal)
    load_release_state
    docker pull "${IMAGE_REF}@${IMAGE_DIGEST}"
    bash ./ops/deploy-image.sh rehearsal
    ;;
  production)
    load_release_state
    [ "${CNB_EVENT:-}" = push ] || fail "生产只接受 CNB main push"
    [ "${CNB_BRANCH:-}" = main ] || fail "生产只接受 CNB main push"
    [ "${CNB_COMMIT:-}" = "$SOURCE_SHA" ] || fail "部署 SHA 与 CNB_COMMIT 不一致"
    bash ./ops/deploy-image.sh production
    ;;
  *) fail "用法: cnb-release.sh build|verify|rehearsal|production" ;;
esac
