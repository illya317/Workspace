#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
fail() { echo "[错误] $*" >&2; exit 1; }
require() { [ -n "${!1:-}" ] || fail "缺少 $1"; }

for key in SOURCE_SHA SOURCE_TREE IMAGE_REF IMAGE_DIGEST RELEASE_MANIFEST_URL GITHUB_RUN_ID; do require "$key"; done
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA 必须是完整小写 SHA"
[[ "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_TREE 必须是完整小写 tree"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "IMAGE_DIGEST 必须是 sha256 digest"
case "$RELEASE_MANIFEST_URL" in docker://*) ;; *) fail "RELEASE_MANIFEST_URL 必须是 digest-pinned OCI 地址" ;; esac

cache_dir=".cache/cnb-image-release"
release_file="$cache_dir/release.json"
cnb_image_ref="${CNB_DOCKER_REGISTRY}/${CNB_REPO_SLUG_LOWERCASE}:sha-${SOURCE_SHA}"
mkdir -p "$cache_dir"

login_ghcr() {
  if [ -n "${GHCR_READ_USERNAME:-}" ] && [ -n "${GHCR_READ_TOKEN:-}" ]; then
    printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_READ_USERNAME" --password-stdin >/dev/null
  fi
}

prepare() {
  login_ghcr
  manifest_image="${RELEASE_MANIFEST_URL#docker://}"
  docker pull "$manifest_image"
  manifest_container="$(docker create --entrypoint /release.json "$manifest_image")"
  trap 'docker rm -f "$manifest_container" >/dev/null 2>&1 || true' RETURN
  docker cp "$manifest_container:/release.json" "$release_file"
  docker rm -f "$manifest_container" >/dev/null
  trap - RETURN
  docker pull "${IMAGE_REF}@${IMAGE_DIGEST}"
  RELEASE_MANIFEST_FILE="$release_file" DEPLOY_IMAGE_REF="$IMAGE_REF" APPROVED_IMAGE_REF="$IMAGE_REF" \
    bash ./ops/deploy-image.sh verify
  printf '%s' "$CNB_TOKEN" | docker login "$CNB_DOCKER_REGISTRY" -u "${CNB_TOKEN_USER_NAME:-cnb}" --password-stdin >/dev/null
  docker tag "${IMAGE_REF}@${IMAGE_DIGEST}" "$cnb_image_ref"
  push_output="$(docker push "$cnb_image_ref")"
  pushed_digest="$(printf '%s\n' "$push_output" | sed -n 's/^.*digest: \(sha256:[0-9a-f]\{64\}\).*$/\1/p' | tail -n 1)"
  [ "$pushed_digest" = "$IMAGE_DIGEST" ] || fail "CNB Registry digest 与 GHCR 不一致"
  docker pull "${cnb_image_ref%@*}@${IMAGE_DIGEST}"
  printf '%s\n' "$cnb_image_ref" > "$cache_dir/cnb-image-ref"
  echo "CNB Registry mirror verified: $IMAGE_DIGEST"
}

case "$ACTION" in
  prepare) prepare ;;
  rehearsal)
    [ -s "$release_file" ] || fail "缺少 prepare 阶段 release.json"
    DEPLOY_IMAGE_REF="$cnb_image_ref" APPROVED_IMAGE_REF="$IMAGE_REF" RELEASE_MANIFEST_FILE="$release_file" \
      bash ./ops/deploy-image.sh rehearsal
    ;;
  production)
    [ "${CNB_EVENT:-}" = api_trigger_deploy ] || fail "生产仅接受 api_trigger_deploy"
    [ -s "$release_file" ] || fail "缺少 prepare 阶段 release.json"
    DEPLOY_IMAGE_REF="$cnb_image_ref" APPROVED_IMAGE_REF="$IMAGE_REF" RELEASE_MANIFEST_FILE="$release_file" \
      bash ./ops/deploy-image.sh production
    ;;
  *) fail "用法: cnb-image-release.sh prepare|rehearsal|production" ;;
esac
