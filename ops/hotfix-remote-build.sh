#!/bin/bash
set -euo pipefail

: "${REMOTE_DIR:?REMOTE_DIR is required}"
: "${REMOTE_WORKSPACE_CONFIG_DIR:?REMOTE_WORKSPACE_CONFIG_DIR is required}"
: "${REMOTE_AGENT_SOURCE_DIR:?REMOTE_AGENT_SOURCE_DIR is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"
: "${SOURCE_TREE:?SOURCE_TREE is required}"
: "${BASE_SHA:?BASE_SHA is required}"
: "${BUNDLE_PATH:?BUNDLE_PATH is required}"

REMOTE_HOTFIX_BUILD_ROOT="${REMOTE_HOTFIX_BUILD_ROOT:-$REMOTE_DIR/.hotfix-builds}"
REMOTE_HOTFIX_CACHE_ROOT="${REMOTE_HOTFIX_CACHE_ROOT:-$REMOTE_DIR/.hotfix-cache}"
HOTFIX_NODE_IMAGE="${HOTFIX_NODE_IMAGE:-node:24-bookworm}"
HOTFIX_BUILD_CPUS="${HOTFIX_BUILD_CPUS:-3}"
HOTFIX_BUILD_MEMORY="${HOTFIX_BUILD_MEMORY:-10g}"

if [ "$REMOTE_HOTFIX_BUILD_ROOT" != "$REMOTE_DIR/.hotfix-builds" ] \
  || [ "$REMOTE_HOTFIX_CACHE_ROOT" != "$REMOTE_DIR/.hotfix-cache" ]; then
  echo "[错误] hotfix build/cache 目录不在固定受管位置"
  exit 1
fi

for value in "$SOURCE_SHA" "$SOURCE_TREE" "$BASE_SHA"; do
  printf '%s' "$value" | grep -Eq '^[0-9a-f]{40}$' || {
    echo "[错误] hotfix build Git identity 无效"
    exit 1
  }
done
for value in "$HOTFIX_BUILD_CPUS" "$HOTFIX_BUILD_MEMORY"; do
  case "$value" in
    ''|*[!a-zA-Z0-9.]*) echo "[错误] hotfix build resource limit 无效: $value"; exit 1 ;;
  esac
done
case "$BUNDLE_PATH" in
  "$REMOTE_HOTFIX_BUILD_ROOT"/*.bundle) ;;
  *) echo "[错误] hotfix bundle 不在受管目录"; exit 1 ;;
esac

command -v docker >/dev/null
command -v git >/dev/null
command -v flock >/dev/null
test -d "$REMOTE_AGENT_SOURCE_DIR/.git"
test -f "$BUNDLE_PATH"
git -C "$REMOTE_AGENT_SOURCE_DIR" cat-file -e "${BASE_SHA}^{commit}"
git -C "$REMOTE_AGENT_SOURCE_DIR" bundle verify "$BUNDLE_PATH"

build_root="$REMOTE_HOTFIX_BUILD_ROOT/$SOURCE_SHA"
worktree="$build_root/source"
npm_cache="$REMOTE_HOTFIX_CACHE_ROOT/npm"
dependency_cache_root="$REMOTE_HOTFIX_CACHE_ROOT/node-modules"
result_file="$build_root/build-result.env"
artifact_path="$build_root/workspace-standalone.tgz"
manifest_path="$build_root/workspace-standalone.manifest.json"
hotfix_ref="refs/workspace-hotfix/$SOURCE_SHA"

mkdir -p "$build_root" "$npm_cache" "$dependency_cache_root"
exec 9> "$build_root/.build.lock"
if ! flock -n 9; then
  echo "[错误] 同一 source 的 SSH hotfix 已在构建"
  exit 1
fi
cleanup() {
  git -C "$REMOTE_AGENT_SOURCE_DIR" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$worktree"
  if [ -n "${dependency_cache_tmp:-}" ]; then
    rm -rf "$dependency_cache_tmp"
  fi
  rm -f "$BUNDLE_PATH"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git -C "$REMOTE_AGENT_SOURCE_DIR" worktree remove --force "$worktree" >/dev/null 2>&1 || true
rm -rf "$worktree"
git -C "$REMOTE_AGENT_SOURCE_DIR" fetch "$BUNDLE_PATH" "HEAD:$hotfix_ref"
if [ "$(git -C "$REMOTE_AGENT_SOURCE_DIR" rev-parse "$hotfix_ref")" != "$SOURCE_SHA" ]; then
  echo "[错误] 上传 bundle 未解析到目标 hotfix SHA"
  exit 1
fi
if [ "$(git -C "$REMOTE_AGENT_SOURCE_DIR" rev-parse "${SOURCE_SHA}^{tree}")" != "$SOURCE_TREE" ]; then
  echo "[错误] 上传 bundle 的 source tree 不匹配"
  exit 1
fi
git -C "$REMOTE_AGENT_SOURCE_DIR" merge-base --is-ancestor "$BASE_SHA" "$SOURCE_SHA"

validate_cached_artifact() {
  [ -f "$result_file" ] && [ -f "$artifact_path" ] && [ -f "$manifest_path" ] || return 1

  local cached_artifact_path
  local cached_manifest_path
  local cached_build_image
  local cached_build_image_request
  local cached_dependency_key
  cached_artifact_path="$(sed -n 's/^ARTIFACT_PATH=//p' "$result_file")"
  cached_manifest_path="$(sed -n 's/^MANIFEST_PATH=//p' "$result_file")"
  cached_build_image="$(sed -n 's/^BUILD_IMAGE=//p' "$result_file")"
  cached_build_image_request="$(sed -n 's/^BUILD_IMAGE_REQUEST=//p' "$result_file")"
  cached_dependency_key="$(sed -n 's/^DEPENDENCY_CACHE_KEY=//p' "$result_file")"

  [ "$cached_artifact_path" = "$artifact_path" ] \
    && [ "$cached_manifest_path" = "$manifest_path" ] \
    && [ "$cached_build_image_request" = "$HOTFIX_NODE_IMAGE" ] \
    && printf '%s' "$cached_build_image" | grep -Eq '@sha256:[0-9a-f]{64}$' \
    && printf '%s' "$cached_dependency_key" | grep -Eq '^[0-9a-f]{64}$' \
    || return 1
  case "$cached_build_image_request" in
    *@sha256:*) [ "$cached_build_image" = "$cached_build_image_request" ] || return 1 ;;
  esac

  node - "$manifest_path" "$artifact_path" "$SOURCE_SHA" "$SOURCE_TREE" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");

const [manifestPath, artifactPath, sourceSha, sourceTree] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const artifact = fs.readFileSync(artifactPath);
const artifactSha = crypto.createHash("sha256").update(artifact).digest("hex");
if (manifest.schemaVersion !== 1
  || manifest.source?.commitSha !== sourceSha
  || manifest.source?.treeSha !== sourceTree
  || manifest.build?.buildId !== sourceSha
  || manifest.build?.platform !== "linux"
  || !/^v24\./.test(manifest.build?.nodeVersion ?? "")
  || manifest.artifact?.fileName !== "workspace-standalone.tgz"
  || manifest.artifact?.sizeBytes !== artifact.length
  || manifest.artifact?.sha256 !== artifactSha) {
  throw new Error("cached hotfix artifact identity is invalid");
}
NODE
}

if validate_cached_artifact; then
  echo "==> source ${SOURCE_SHA:0:12} 已有完整校验产物，跳过重复 install/build"
  cleanup
  trap - EXIT
  exit 0
fi

rm -f "$result_file" "$artifact_path" "$manifest_path"

echo "==> 解析并固定 Node 24 Linux build image..."
if ! docker image inspect "$HOTFIX_NODE_IMAGE" >/dev/null 2>&1; then
  docker pull "$HOTFIX_NODE_IMAGE"
fi
if [[ "$HOTFIX_NODE_IMAGE" == *@sha256:* ]]; then
  resolved_image="$HOTFIX_NODE_IMAGE"
else
  resolved_image="$(docker image inspect --format '{{join .RepoDigests "\n"}}' "$HOTFIX_NODE_IMAGE" | sed -n '1p')"
  if ! printf '%s' "$resolved_image" | grep -Eq '@sha256:[0-9a-f]{64}$'; then
    docker pull "$HOTFIX_NODE_IMAGE"
    resolved_image="$(docker image inspect --format '{{join .RepoDigests "\n"}}' "$HOTFIX_NODE_IMAGE" | sed -n '1p')"
  fi
fi
case "$resolved_image" in
  *@sha256:????????????????????????????????????????????????????????????????) ;;
  *) echo "[错误] 无法把 HOTFIX_NODE_IMAGE 固定到 registry digest"; exit 1 ;;
esac
resolved_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$resolved_image")"
case "$resolved_platform" in
  linux/*) ;;
  *) echo "[错误] hotfix build image 不是 Linux image: $resolved_platform"; exit 1 ;;
esac

git -C "$REMOTE_AGENT_SOURCE_DIR" worktree add --detach "$worktree" "$SOURCE_SHA"

dependency_cache_key="$({
  printf 'build-image=%s\n' "$resolved_image"
  printf 'build-platform=%s\n' "$resolved_platform"
  for dependency_input in package.json package-lock.json .node-version; do
    printf '%s=' "$dependency_input"
    sha256sum "$worktree/$dependency_input" | awk '{print $1}'
  done
  if [ -f "$worktree/.npmrc" ]; then
    printf '.npmrc='
    sha256sum "$worktree/.npmrc" | awk '{print $1}'
  else
    printf '.npmrc=absent\n'
  fi
} | sha256sum | awk '{print $1}')"
dependency_cache="$dependency_cache_root/$dependency_cache_key"
dependency_lock="$dependency_cache_root/$dependency_cache_key.lock"

host_uid="$(id -u)"
host_gid="$(id -g)"
exec 8> "$dependency_lock"
flock 8
if [ ! -f "$dependency_cache/.complete" ] \
  || [ "$(cat "$dependency_cache/.complete")" != "$dependency_cache_key" ] \
  || [ ! -d "$dependency_cache/node_modules" ]; then
  echo "==> 依赖缓存未命中，运行一次真实 npm ci..."
  rm -rf "$dependency_cache"
  dependency_cache_tmp="$dependency_cache_root/.${dependency_cache_key}.tmp.$$"
  rm -rf "$dependency_cache_tmp"
  mkdir -p "$dependency_cache_tmp"
  docker run --rm \
    --cpus "$HOTFIX_BUILD_CPUS" \
    --memory "$HOTFIX_BUILD_MEMORY" \
    --pids-limit 512 \
    --security-opt no-new-privileges:true \
    --user "$host_uid:$host_gid" \
    -e CI=true \
    -e HOME=/tmp/workspace-hotfix-home \
    -e NPM_CONFIG_CACHE="$npm_cache" \
    -v "$REMOTE_AGENT_SOURCE_DIR:$REMOTE_AGENT_SOURCE_DIR:ro" \
    -v "$worktree:$worktree" \
    -v "$npm_cache:$npm_cache" \
    -w "$worktree" \
    "$resolved_image" \
    bash -lc '
      set -euo pipefail
      test "$(node -p "process.versions.node.split(\".\")[0]")" = "24"
      command -v git >/dev/null
      command -v make >/dev/null
      command -v g++ >/dev/null
      npm ci --no-audit --fund=false --loglevel=error
    '
  test -d "$worktree/node_modules"
  mv "$worktree/node_modules" "$dependency_cache_tmp/node_modules"
  printf '%s\n' "$dependency_cache_key" > "$dependency_cache_tmp/.complete"
  mv "$dependency_cache_tmp" "$dependency_cache"
else
  echo "==> 依赖缓存命中: ${dependency_cache_key:0:12}"
fi
flock -u 8

echo "==> 在服务器隔离容器构建 source ${SOURCE_SHA:0:12}..."
docker run --rm \
    --cpus "$HOTFIX_BUILD_CPUS" \
    --memory "$HOTFIX_BUILD_MEMORY" \
    --pids-limit 512 \
    --security-opt no-new-privileges:true \
    --user "$host_uid:$host_gid" \
    -e CI=true \
    -e HOME=/tmp/workspace-hotfix-home \
    -e NPM_CONFIG_CACHE="$npm_cache" \
    -e NEXTAUTH_SECRET=hotfix-build-only-secret-2026 \
    -e DATABASE_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_build \
    -e DIRECT_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_build \
    -e SHADOW_DATABASE_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_shadow \
    -e RELEASE_SOURCE_SHA="$SOURCE_SHA" \
    -e RELEASE_SOURCE_TREE="$SOURCE_TREE" \
    -v "$REMOTE_AGENT_SOURCE_DIR:$REMOTE_AGENT_SOURCE_DIR:ro" \
    -v "$worktree:$worktree" \
    -v "$npm_cache:$npm_cache" \
    -v "$dependency_cache/node_modules:$worktree/node_modules:ro" \
    -w "$worktree" \
    "$resolved_image" \
    bash -lc '
      set -euo pipefail
      test "$(node -p "process.versions.node.split(\".\")[0]")" = "24"
      command -v git >/dev/null
      command -v make >/dev/null
      command -v g++ >/dev/null
      bash ./ops/build-standalone-artifact.sh
    '

cp "$worktree/.next/workspace-standalone.tgz" "$artifact_path"
cp "$worktree/.next/workspace-standalone.manifest.json" "$manifest_path"
artifact_sha="$(sha256sum "$artifact_path" | awk '{print $1}')"
manifest_artifact_sha="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(m.artifact.sha256)' "$manifest_path")"
test "$artifact_sha" = "$manifest_artifact_sha"

{
  printf 'ARTIFACT_PATH=%s\n' "$artifact_path"
  printf 'MANIFEST_PATH=%s\n' "$manifest_path"
  printf 'BUILD_IMAGE=%s\n' "$resolved_image"
  printf 'BUILD_IMAGE_REQUEST=%s\n' "$HOTFIX_NODE_IMAGE"
  printf 'DEPENDENCY_CACHE_KEY=%s\n' "$dependency_cache_key"
} > "$result_file"
chmod 600 "$result_file"
cleanup
trap - EXIT
find "$REMOTE_HOTFIX_BUILD_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "==> SSH hotfix standalone 已生成: $artifact_path"
