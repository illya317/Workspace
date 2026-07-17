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
command -v sha256sum >/dev/null
test -d "$REMOTE_AGENT_SOURCE_DIR/.git"
test -f "$BUNDLE_PATH"
git -C "$REMOTE_AGENT_SOURCE_DIR" cat-file -e "${BASE_SHA}^{commit}"
git -C "$REMOTE_AGENT_SOURCE_DIR" bundle verify "$BUNDLE_PATH"

build_root="$REMOTE_HOTFIX_BUILD_ROOT/$SOURCE_SHA"
worktree="$build_root/source"
npm_cache="$REMOTE_HOTFIX_CACHE_ROOT/npm"
dependency_cache_root="$REMOTE_HOTFIX_CACHE_ROOT/dependencies"
next_cache_root="$REMOTE_HOTFIX_CACHE_ROOT/next"
result_file="$build_root/build-result.env"
artifact_path="$build_root/workspace-standalone.tgz"
manifest_path="$build_root/workspace-standalone.manifest.json"
hotfix_ref="refs/workspace-hotfix/$SOURCE_SHA"

mkdir -p "$build_root" "$npm_cache" "$dependency_cache_root" "$next_cache_root"
exec 9> "$build_root/.build.lock"
if ! flock -n 9; then
  echo "[错误] 同一 source 的 SSH hotfix 已在构建"
  exit 1
fi
cleanup() {
  git -C "$REMOTE_AGENT_SOURCE_DIR" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$worktree"
  rm -f "$BUNDLE_PATH"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git -C "$REMOTE_AGENT_SOURCE_DIR" worktree remove --force "$worktree" >/dev/null 2>&1 || true
rm -rf "$worktree"
rm -f "$result_file" "$artifact_path" "$manifest_path"
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
git -C "$REMOTE_AGENT_SOURCE_DIR" worktree add --detach "$worktree" "$SOURCE_SHA"

echo "==> 解析并固定 Node 24 Linux build image..."
docker pull "$HOTFIX_NODE_IMAGE"
if [[ "$HOTFIX_NODE_IMAGE" == *@sha256:* ]]; then
  resolved_image="$HOTFIX_NODE_IMAGE"
else
  resolved_image="$(docker image inspect --format '{{join .RepoDigests "\n"}}' "$HOTFIX_NODE_IMAGE" | sed -n '1p')"
fi
case "$resolved_image" in
  *@sha256:????????????????????????????????????????????????????????????????) ;;
  *) echo "[错误] 无法把 HOTFIX_NODE_IMAGE 固定到 registry digest"; exit 1 ;;
esac

package_json_sha="$(sha256sum "$worktree/package.json" | awk '{print $1}')"
package_lock_sha="$(sha256sum "$worktree/package-lock.json" | awk '{print $1}')"
dependency_key="$(printf '%s\n%s\n%s\n' "$resolved_image" "$package_json_sha" "$package_lock_sha" | sha256sum | awk '{print $1}')"
printf '%s' "$dependency_key" | grep -Eq '^[0-9a-f]{64}$' || {
  echo "[错误] 无法生成 Hotfix 依赖缓存指纹"
  exit 1
}
dependency_cache="$dependency_cache_root/$dependency_key"
next_cache_from="$next_cache_root/$BASE_SHA"
next_cache_to="$next_cache_root/$SOURCE_SHA"
exec 8> "$dependency_cache_root/$dependency_key.lock"
flock 8

host_uid="$(id -u)"
host_gid="$(id -g)"
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
  -e HOTFIX_DEPENDENCY_KEY="$dependency_key" \
  -e HOTFIX_DEPENDENCY_CACHE="$dependency_cache" \
  -e HOTFIX_NEXT_CACHE_FROM="$next_cache_from" \
  -e HOTFIX_NEXT_CACHE_TO="$next_cache_to" \
  -e NEXTAUTH_SECRET=hotfix-build-only-secret-2026 \
  -e DATABASE_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_build \
  -e DIRECT_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_build \
  -e SHADOW_DATABASE_URL=postgresql://workspace:workspace@127.0.0.1:5432/workspace_hotfix_shadow \
  -e RELEASE_SOURCE_SHA="$SOURCE_SHA" \
  -e RELEASE_SOURCE_TREE="$SOURCE_TREE" \
  -v "$REMOTE_AGENT_SOURCE_DIR:$REMOTE_AGENT_SOURCE_DIR:ro" \
  -v "$worktree:$worktree" \
  -v "$REMOTE_HOTFIX_CACHE_ROOT:$REMOTE_HOTFIX_CACHE_ROOT" \
  -w "$worktree" \
  "$resolved_image" \
  bash -lc '
    set -euo pipefail
    test "$(node -p "process.versions.node.split(\".\")[0]")" = "24"
    command -v git >/dev/null
    command -v make >/dev/null
    command -v g++ >/dev/null
    if [ -f "$HOTFIX_DEPENDENCY_CACHE/.complete" ] \
      && [ "$(cat "$HOTFIX_DEPENDENCY_CACHE/.complete")" = "$HOTFIX_DEPENDENCY_KEY" ] \
      && [ -x "$HOTFIX_DEPENDENCY_CACHE/node_modules/.bin/next" ]; then
      echo "==> 复用 package manifest + Node image digest 依赖缓存"
      cp -a "$HOTFIX_DEPENDENCY_CACHE/node_modules" ./node_modules
    else
      npm ci --no-audit --fund=false --loglevel=error
      dependency_tmp="${HOTFIX_DEPENDENCY_CACHE}.tmp.$$"
      rm -rf "$dependency_tmp" "$HOTFIX_DEPENDENCY_CACHE"
      mkdir -p "$dependency_tmp"
      cp -a node_modules "$dependency_tmp/node_modules"
      printf "%s\n" "$HOTFIX_DEPENDENCY_KEY" > "$dependency_tmp/.complete"
      mv "$dependency_tmp" "$HOTFIX_DEPENDENCY_CACHE"
    fi
    if [ -d "$HOTFIX_NEXT_CACHE_FROM" ]; then
      echo "==> 复用上一 runtime source 的 Next build cache"
      mkdir -p .next/cache
      cp -a "$HOTFIX_NEXT_CACHE_FROM/." .next/cache/
    fi
    bash ./ops/build-standalone-artifact.sh
    if [ -d .next/cache ]; then
      next_tmp="${HOTFIX_NEXT_CACHE_TO}.tmp.$$"
      rm -rf "$next_tmp" "$HOTFIX_NEXT_CACHE_TO"
      mkdir -p "$(dirname "$HOTFIX_NEXT_CACHE_TO")"
      cp -a .next/cache "$next_tmp"
      mv "$next_tmp" "$HOTFIX_NEXT_CACHE_TO"
    fi
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
} > "$result_file"
chmod 600 "$result_file"
cleanup
trap - EXIT
find "$REMOTE_HOTFIX_BUILD_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
find "$dependency_cache_root" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
find "$next_cache_root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "==> SSH hotfix standalone 已生成: $artifact_path"
