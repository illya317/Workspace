#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PARENT="$(dirname "$PROJECT_ROOT")"
cd "$PROJECT_ROOT"
# shellcheck source=ops/release/artifact/next-compiler-cache-shell.sh
source ./ops/release/artifact/next-compiler-cache-shell.sh

UNIT_ID="${1:-}"
if [ -z "$UNIT_ID" ] || [[ ! "$UNIT_ID" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "用法: $0 <deploy-unit-id>" >&2
  exit 2
fi

ALLOW_NON_LINUX_UNIT_BUILD="${ALLOW_NON_LINUX_UNIT_BUILD:-0}"
ALLOW_CNB_RELEASE_INJECTION="${ALLOW_CNB_RELEASE_INJECTION:-0}"
SOURCE_SHA="${DEPLOY_UNIT_SOURCE_SHA:-${RELEASE_SOURCE_SHA:-}}"
SOURCE_TREE="${DEPLOY_UNIT_SOURCE_TREE:-${RELEASE_SOURCE_TREE:-}}"
if [ -z "$SOURCE_SHA" ]; then
  SOURCE_SHA="$(git rev-parse HEAD)"
fi
if [ -z "$SOURCE_TREE" ]; then
  SOURCE_TREE="$(git rev-parse "${SOURCE_SHA}^{tree}")"
fi
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || [[ ! "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[错误] deploy unit 构建需要完整 source SHA/tree" >&2
  exit 1
fi
if [ "$(git rev-parse "${SOURCE_SHA}^{tree}")" != "$SOURCE_TREE" ]; then
  echo "[错误] deploy unit source SHA/tree 不匹配" >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]; then
  INJECTION_FILES="$(git diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort)"
  if [ "$ALLOW_CNB_RELEASE_INJECTION" != "1" ] \
    || [ "$(git rev-parse HEAD^)" != "$SOURCE_SHA" ] \
    || [ "$INJECTION_FILES" != $'.cnb-release.json\n.cnb.yml' ]; then
    echo "[错误] deploy unit 构建必须位于 source SHA 或其精确 CNB release injection" >&2
    exit 1
  fi
fi
if [ "$(uname -s)" != "Linux" ] && [ "$ALLOW_NON_LINUX_UNIT_BUILD" != "1" ]; then
  echo "[错误] production deploy unit artifact 必须在 Linux 构建" >&2
  exit 1
fi
if [ -e npm-shrinkwrap.json ]; then
  echo "[错误] 本仓库只允许 package-lock.json" >&2
  exit 1
fi
if ! git diff --quiet --ignore-submodules -- \
  || ! git diff --cached --quiet --ignore-submodules -- \
  || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "[错误] deploy unit artifact 必须从干净且已提交的 source tree 构建" >&2
  exit 1
fi

DEPLOYMENT_ID="${DEPLOY_UNIT_DEPLOYMENT_ID:-$UNIT_ID-${SOURCE_SHA:0:12}}"
OUTPUT_ROOT="${DEPLOY_UNIT_OUTPUT_ROOT:-.cache/deploy-units/$UNIT_ID}"
OUTPUT_ROOT="$(node ops/release/artifact/next-compiler-cache.mjs resolve-output-root \
  --repository-root "$PROJECT_ROOT" \
  --output-root "$OUTPUT_ROOT")"
CONTRACT_FILE="$OUTPUT_ROOT/deploy-unit-contract.json"
DEPLOY_GRAPH_FILE="$OUTPUT_ROOT/deploy-graph.json"
NAVIGATION_MANIFEST_FILE="$OUTPUT_ROOT/deploy-navigation-manifest.json"
ARTIFACT_FILE="${DEPLOY_UNIT_ARTIFACT_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.tgz}"
MANIFEST_FILE="${DEPLOY_UNIT_MANIFEST_PATH:-$OUTPUT_ROOT/$UNIT_ID-standalone.manifest.json}"
RESOURCE_MANIFEST_FILE="$OUTPUT_ROOT/resource-defs.json"
CONTROL_PLANE_REQUIREMENTS_FILE="$OUTPUT_ROOT/control-plane-requirements.json"
SBOM_FILE="$OUTPUT_ROOT/$UNIT_ID.cdx.json"
ATTESTATION_FILE="$OUTPUT_ROOT/$UNIT_ID.provenance.json"

mkdir -p "$OUTPUT_ROOT"
node --conditions=react-server --import tsx scripts/deploy/render-deploy-unit-contract.ts \
  --unit "$UNIT_ID" \
  --output "$CONTRACT_FILE"
node --conditions=react-server --import tsx scripts/deploy/check-deploy-graph.ts --json > "$DEPLOY_GRAPH_FILE"
node --conditions=react-server --import tsx scripts/deploy/render-deploy-navigation-manifest.ts \
  --output "$NAVIGATION_MANIFEST_FILE"
node --import tsx scripts/write-resource-manifest.ts "$RESOURCE_MANIFEST_FILE"
node ops/control-plane-requirements.mjs write \
  --repository-root "$PROJECT_ROOT" \
  --resource-manifest "$RESOURCE_MANIFEST_FILE" \
  --source-sha "$SOURCE_SHA" \
  --source-tree "$SOURCE_TREE" \
  --output "$CONTROL_PLANE_REQUIREMENTS_FILE"

read_contract_field() {
  # shellcheck disable=SC2016
  node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
let current = value;
for (const segment of process.argv[2].split(".")) current = current?.[segment];
if (typeof current !== "string") throw new Error(`contract field ${process.argv[2]} is not a string`);
process.stdout.write(current);
' "$CONTRACT_FILE" "$1"
}

node - "$CONTRACT_FILE" <<'NODE'
const fs = require("node:fs");
const contract = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (contract.maturity !== "candidate" && contract.maturity !== "active") {
  throw new Error(`${contract.id} is ${contract.maturity} and cannot be built independently`);
}
if (contract.coordination !== "available") throw new Error(`${contract.id} is frozen until final handoff`);
if (contract.readiness?.contributorBlockers?.length) throw new Error(`${contract.id} still has cross-unit contributor blockers`);
if (!/^apps\/[a-z][a-z0-9-]*$/.test(contract.build?.appRoot ?? "")) throw new Error(`${contract.id} app root is unsafe`);
NODE

APP_ROOT="$(read_contract_field build.appRoot)"
ENGINE="$(read_contract_field runtime.engine)"
BASE_PATH="$(read_contract_field build.basePath)"
ASSET_PREFIX="$(node -e 'const c=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(c.build.assetPrefix ?? "")' "$CONTRACT_FILE")"
NAVIGATION_MANIFEST="$(tr -d '\n' < "$NAVIGATION_MANIFEST_FILE")"

if [ "$ENGINE" != "next-standalone" ]; then
  echo "[错误] $UNIT_ID 使用 $ENGINE；请走对应 headless runtime builder" >&2
  exit 1
fi
[ -d "$APP_ROOT" ] || { echo "[错误] deploy unit app root 不存在: $APP_ROOT" >&2; exit 1; }
[ -f "$APP_ROOT/next.config.ts" ] || [ -f "$APP_ROOT/next.config.mjs" ] || {
  echo "[错误] deploy unit 缺少独立 Next config: $APP_ROOT" >&2
  exit 1
}

if [ "${DEPLOY_UNIT_SKIP_TYPECHECK:-0}" != "1" ]; then
  while IFS= read -r scope; do
    npm run typecheck:scope -- "$scope"
  done < <(node -e '
const c=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));
for (const scope of c.compiler.typecheckScopes) console.log(scope);
' "$CONTRACT_FILE")
fi

node ops/release/candidate/source-snapshot.mjs ensure
test -s .cache/source-code-analysis/snapshot.json || {
  echo "[错误] 源码分析 snapshot 未生成，禁止组装 deploy-unit artifact" >&2
  exit 1
}

BUILD_DIRECTORY="$APP_ROOT/.next"
rm -rf "$BUILD_DIRECTORY"
next_compiler_cache_unit prepare "$PROJECT_ROOT" "$UNIT_ID" "$APP_ROOT" \
  "$OUTPUT_ROOT" "$CONTRACT_FILE" "$NAVIGATION_MANIFEST_FILE"
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" \
NEXT_PUBLIC_ASSET_PREFIX="$ASSET_PREFIX" \
NEXT_PUBLIC_DEPLOY_UNIT_ID="$UNIT_ID" \
NEXT_PUBLIC_DEPLOY_UNIT_NAVIGATION="$NAVIGATION_MANIFEST" \
NEXT_DEPLOYMENT_ID="$DEPLOYMENT_ID" \
NEXT_PUBLIC_BUILD_VERSION="$DEPLOYMENT_ID" \
BUILD_VERSION="$DEPLOYMENT_ID" \
  ./node_modules/.bin/next build "$APP_ROOT"
NEXT_BUILD_ID_FILE="$BUILD_DIRECTORY/BUILD_ID"
if [ ! -f "$NEXT_BUILD_ID_FILE" ] || [ -L "$NEXT_BUILD_ID_FILE" ]; then
  echo "[错误] $UNIT_ID Next build 缺少真实 .next/BUILD_ID" >&2
  exit 1
fi
NEXT_BUILD_ID="$(< "$NEXT_BUILD_ID_FILE")"
if [[ ! "$NEXT_BUILD_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
  echo "[错误] $UNIT_ID Next BUILD_ID 非法" >&2
  exit 1
fi
next_compiler_cache_unit store "$PROJECT_ROOT" "$UNIT_ID" "$APP_ROOT" \
  "$OUTPUT_ROOT" "$CONTRACT_FILE" "$NAVIGATION_MANIFEST_FILE"

STANDALONE_ROOT="$BUILD_DIRECTORY/standalone"
[ -d "$STANDALONE_ROOT" ] || { echo "[错误] $UNIT_ID 未生成 standalone 目录" >&2; exit 1; }
SERVER_ENTRIES="$(find "$STANDALONE_ROOT" -path '*/node_modules/*' -prune -o -type f -name server.js -print)"
SERVER_ENTRY_COUNT="$(printf '%s\n' "$SERVER_ENTRIES" | awk 'NF { count += 1 } END { print count + 0 }')"
if [ "$SERVER_ENTRY_COUNT" -ne 1 ]; then
  echo "[错误] $UNIT_ID standalone 必须恰好包含一个 server.js，实际 $SERVER_ENTRY_COUNT" >&2
  exit 1
fi
SERVER_ENTRY="$SERVER_ENTRIES"
APP_DIRECTORY="$(dirname "$SERVER_ENTRY")"
SERVER_ENTRY_RELATIVE="${SERVER_ENTRY#"$STANDALONE_ROOT/"}"

rewrite_release_dependency_link() {
  [ "${PROJECT_ROOT##*/}" = "release" ] || return 0
  [ -L "$PROJECT_ROOT/node_modules" ] || return 0

  local trusted_node_modules="$PROJECT_PARENT/source/node_modules"
  local source_link_target
  source_link_target="$(readlink "$PROJECT_ROOT/node_modules")"
  if [ "$source_link_target" != "$trusted_node_modules" ]; then
    echo "[错误] release node_modules 必须精确指向受信 sibling: $trusted_node_modules" >&2
    return 1
  fi
  if [ ! -d "$trusted_node_modules" ] || [ -L "$trusted_node_modules" ]; then
    echo "[错误] 受信 sibling node_modules 必须是真实目录: $trusted_node_modules" >&2
    return 1
  fi

  local packaged_source_node_modules="$STANDALONE_ROOT/source/node_modules"
  local packaged_release_node_modules="$STANDALONE_ROOT/release/node_modules"
  if [ ! -d "$packaged_source_node_modules" ] || [ -L "$packaged_source_node_modules" ]; then
    echo "[错误] standalone 缺少真实 source/node_modules" >&2
    return 1
  fi
  if [ ! -L "$packaged_release_node_modules" ]; then
    echo "[错误] standalone release/node_modules 必须保留为受信链接" >&2
    return 1
  fi
  if [ "$(readlink "$packaged_release_node_modules")" != "$trusted_node_modules" ]; then
    echo "[错误] standalone release/node_modules 包含任意依赖链接" >&2
    return 1
  fi

  local temporary_link="${packaged_release_node_modules}.relative-${BASHPID}"
  [ ! -e "$temporary_link" ] && [ ! -L "$temporary_link" ] || {
    echo "[错误] standalone 依赖链接临时路径已存在" >&2
    return 1
  }
  ln -s "../source/node_modules" "$temporary_link"
  mv -Tf "$temporary_link" "$packaged_release_node_modules"
  if [ "$(readlink "$packaged_release_node_modules")" != "../source/node_modules" ] \
    || [ "$(realpath "$packaged_release_node_modules")" != "$(realpath "$packaged_source_node_modules")" ]; then
    echo "[错误] standalone release/node_modules 相对链接验证失败" >&2
    return 1
  fi
}

rewrite_release_dependency_link

rm -rf "$APP_DIRECTORY/.next/static"
mkdir -p "$APP_DIRECTORY/.next"
cp -R "$BUILD_DIRECTORY/static" "$APP_DIRECTORY/.next/static"
rm -rf "$APP_DIRECTORY/public"
cp -R public "$APP_DIRECTORY/public"
mkdir -p "$APP_DIRECTORY/.workspace/source-code-analysis"
cp .cache/source-code-analysis/snapshot.json "$APP_DIRECTORY/.workspace/source-code-analysis/snapshot.json"
test -s "$APP_DIRECTORY/.workspace/source-code-analysis/snapshot.json" || {
  echo "[错误] deploy-unit artifact 缺少源码分析 snapshot" >&2
  exit 1
}
cp "$CONTRACT_FILE" "$STANDALONE_ROOT/.deploy-unit-contract.json"
cp "$NAVIGATION_MANIFEST_FILE" "$STANDALONE_ROOT/.deploy-navigation-manifest.json"
cp "$CONTROL_PLANE_REQUIREMENTS_FILE" "$STANDALONE_ROOT/.control-plane-requirements.json"
printf '%s\n' "$SERVER_ENTRY_RELATIVE" > "$STANDALONE_ROOT/.server-entry"
if [ "$UNIT_ID" = "assistant" ]; then
  node ops/assistant-runtime.mjs bundle \
    --repository-root "$PROJECT_ROOT" \
    --standalone-root "$STANDALONE_ROOT"
  node -e 'const sharp=require(process.argv[1]); if (!sharp.versions?.sharp) throw new Error("Assistant sharp runtime is incomplete")' \
    "$STANDALONE_ROOT/node_modules/sharp"
  node ops/assistant-runtime.mjs assert --release-root "$STANDALONE_ROOT"
fi
while IFS= read -r -d '' packaged_link; do
  packaged_link_target="$(readlink "$packaged_link")"
  if [[ "$packaged_link_target" = /* ]]; then
    echo "[错误] standalone 禁止 absolute symlink: ${packaged_link#"$STANDALONE_ROOT/"}" >&2
    exit 1
  fi
done < <(find "$STANDALONE_ROOT" -type l -print0)
find "$STANDALONE_ROOT" \( -name '.DS_Store' -o -name '._*' \) -delete

node ops/release/artifact/runtime-tree-permissions.mjs normalize --root "$STANDALONE_ROOT"
mkdir -p "$(dirname "$ARTIFACT_FILE")" "$(dirname "$MANIFEST_FILE")"
tar -C "$STANDALONE_ROOT" -czf "$ARTIFACT_FILE" .
node ops/deploy-unit-release.mjs artifact-write \
  --contract "$CONTRACT_FILE" \
  --artifact "$ARTIFACT_FILE" \
  --manifest "$MANIFEST_FILE" \
  --source-sha "$SOURCE_SHA" \
  --source-tree "$SOURCE_TREE" \
  --build-id "$NEXT_BUILD_ID" \
  --deployment-id "$DEPLOYMENT_ID" \
  --server-entry "$SERVER_ENTRY_RELATIVE" \
  --control-plane-requirements "$CONTROL_PLANE_REQUIREMENTS_FILE"
node ops/deploy-unit-release.mjs artifact-assert \
  --contract "$CONTRACT_FILE" \
  --artifact "$ARTIFACT_FILE" \
  --manifest "$MANIFEST_FILE" >/dev/null
node ops/deploy-unit-provenance.mjs sbom-write \
  --contract "$CONTRACT_FILE" \
  --package-lock package-lock.json \
  --output "$SBOM_FILE"
if [ -n "${DEPLOY_UNIT_SIGNING_KEY_FILE:-}" ]; then
  [ -f "$DEPLOY_UNIT_SIGNING_KEY_FILE" ] || { echo "[错误] deploy unit signing key 不存在" >&2; exit 1; }
  node ops/deploy-unit-provenance.mjs attestation-write \
    --manifest "$MANIFEST_FILE" \
    --sbom "$SBOM_FILE" \
    --private-key "$DEPLOY_UNIT_SIGNING_KEY_FILE" \
    --builder-id "${DEPLOY_UNIT_BUILDER_ID:-cnb:workspace-unit-builder}" \
    --output "$ATTESTATION_FILE"
elif [ "${DEPLOY_UNIT_REQUIRE_SIGNATURE:-0}" = "1" ]; then
  echo "[错误] profile/fleet artifact 必须设置 DEPLOY_UNIT_SIGNING_KEY_FILE" >&2
  exit 1
fi

echo "deploy unit artifact: $ARTIFACT_FILE"
echo "deploy unit manifest: $MANIFEST_FILE"
echo "deploy unit SBOM: $SBOM_FILE"
[ ! -f "$ATTESTATION_FILE" ] || echo "deploy unit provenance: $ATTESTATION_FILE"
echo "deploy graph: $DEPLOY_GRAPH_FILE"
