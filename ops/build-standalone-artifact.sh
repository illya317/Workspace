#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

ALLOW_NON_LINUX_BUILD="${ALLOW_NON_LINUX_BUILD:-0}"
ALLOW_CNB_RELEASE_INJECTION="${ALLOW_CNB_RELEASE_INJECTION:-0}"
STANDALONE_SKIP_NEXT_BUILD="${STANDALONE_SKIP_NEXT_BUILD:-0}"
ARTIFACT_PATH="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
MANIFEST_PATH="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
SOURCE_SHA="${RELEASE_SOURCE_SHA:-$(git rev-parse HEAD)}"
SOURCE_TREE="${RELEASE_SOURCE_TREE:-$(git rev-parse "${SOURCE_SHA}^{tree}")}"
CONTENT_DIGEST="${RELEASE_CONTENT_DIGEST:-}"
RELEASE_TIMING_ENABLED=0

if [ -n "${RELEASE_TIMING_FILE:-}" ]; then
  # shellcheck source=ops/lib/release-timing.sh
  source ./ops/lib/release-timing.sh
  release_timing_configure \
    "$RELEASE_TIMING_FILE" \
    "${RELEASE_TIMING_RELEASE_ID:-$SOURCE_SHA}" \
    artifact
  RELEASE_TIMING_ENABLED=1
fi

cleanup_artifact_timing() {
  local artifact_exit_code=$?
  if [ "$RELEASE_TIMING_ENABLED" = "1" ]; then
    release_timing_active_finalize_on_exit "$artifact_exit_code" || true
  fi
  return "$artifact_exit_code"
}
trap cleanup_artifact_timing EXIT

run_artifact_stage() {
  local stage="$1"
  shift
  if [ "$RELEASE_TIMING_ENABLED" != "1" ]; then
    "$@"
    return
  fi

  if ! release_timing_active_begin "$stage"; then
    echo "[警告] artifact/${stage} 计时启动失败；构建仍按原命令执行" >&2
    "$@"
    return
  fi
  "$@"
  # The active finalizer intentionally takes no arguments.
  # shellcheck disable=SC2119
  release_timing_active_passed
}

if ! printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "[错误] RELEASE_SOURCE_SHA 必须是完整小写 Git SHA"
  exit 1
fi
if ! printf '%s' "$SOURCE_TREE" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "[错误] RELEASE_SOURCE_TREE 必须是完整小写 Git tree SHA"
  exit 1
fi
if ! printf '%s' "$CONTENT_DIGEST" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "[错误] RELEASE_CONTENT_DIGEST 必须是候选内容 SHA-256"
  exit 1
fi
if [ "$(git rev-parse "${SOURCE_SHA}^{tree}")" != "$SOURCE_TREE" ]; then
  echo "[错误] RELEASE_SOURCE_TREE 与 RELEASE_SOURCE_SHA 不匹配"
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]; then
  injection_files="$(git diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort)"
  if [ "$ALLOW_CNB_RELEASE_INJECTION" != "1" ] \
    || [ "$(git rev-parse HEAD^)" != "$SOURCE_SHA" ] \
    || [ "$injection_files" != $'.cnb-release.json\n.cnb.yml' ]; then
    echo "[错误] standalone 构建必须位于 source SHA 或其精确 CNB release injection"
    exit 1
  fi
fi
if [ "$(uname -s)" != "Linux" ] && [ "$ALLOW_NON_LINUX_BUILD" != "1" ]; then
  echo "[错误] standalone 产物必须在 Linux 构建；仅本地诊断可显式设置 ALLOW_NON_LINUX_BUILD=1"
  exit 1
fi
if [ -e npm-shrinkwrap.json ]; then
  echo "[错误] 本仓库只允许 package-lock.json；npm-shrinkwrap.json 会改变 npm ci 的实际输入"
  exit 1
fi

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

ensure_build_deps() {
  if [ ! -d node_modules ]; then
    echo "==> 当前构建环境缺少 node_modules，安装依赖..."
    npm ci --no-audit --fund=false --loglevel=error
  fi
}

copy_runtime_package() {
  local pkg="$1"
  if [ ! -e "node_modules/$pkg" ]; then
    echo "[错误] 构建产物缺少运行时依赖: node_modules/$pkg"
    exit 1
  fi
  rm -rf ".next/standalone/node_modules/$pkg"
  mkdir -p ".next/standalone/node_modules/$(dirname "$pkg")"
  cp -R "node_modules/$pkg" ".next/standalone/node_modules/$pkg"
}

copy_runtime_package_tree() {
  node - "$@" <<'NODE' | while IFS= read -r pkg; do
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const roots = process.argv.slice(2);
const seen = new Set();

function packageDir(name) {
  if (name.startsWith("@")) return path.join(root, "node_modules", ...name.split("/"));
  return path.join(root, "node_modules", name);
}

function walk(name, optional = false) {
  if (seen.has(name)) return;
  const packageJson = path.join(packageDir(name), "package.json");
  if (!fs.existsSync(packageJson)) {
    if (optional) return;
    throw new Error(`Missing runtime dependency: ${name}`);
  }
  seen.add(name);
  const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  for (const dependency of Object.keys(pkg.dependencies || {})) walk(dependency);
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) walk(dependency, true);
}

for (const name of roots) walk(name);
for (const name of [...seen].sort()) console.log(name);
NODE
    copy_runtime_package "$pkg"
  done
}

copy_prisma_deploy_files() {
  echo "==> 打包 Prisma schema、migrations 和 CLI..."
  test -f prisma.config.ts
  test -f prisma/schema.prisma
  test -f prisma/migrations/migration_lock.toml
  test -f scripts/check/check-prisma-deploy-status.js
  test -f scripts/ci/check-migration-policy.mjs

  rm -rf .next/standalone/prisma .next/standalone/prisma.config.ts
  mkdir -p .next/standalone/prisma
  cp prisma/schema.prisma .next/standalone/prisma/schema.prisma
  cp -R prisma/models .next/standalone/prisma/models
  cp -R prisma/migrations .next/standalone/prisma/migrations
  cp prisma.config.ts .next/standalone/prisma.config.ts
  mkdir -p .next/standalone/scripts/check
  cp scripts/check/check-prisma-deploy-status.js .next/standalone/scripts/check/check-prisma-deploy-status.js
  mkdir -p .next/standalone/scripts/ci
  cp scripts/ci/check-migration-policy.mjs .next/standalone/scripts/ci/check-migration-policy.mjs
  mkdir -p .next/standalone/scripts/migrate
  cp scripts/migrate/sqlite-to-postgresql.mjs .next/standalone/scripts/migrate/sqlite-to-postgresql.mjs

  rm -rf .next/standalone/node_modules/prisma .next/standalone/node_modules/@prisma
  mkdir -p .next/standalone/node_modules
  cp -R node_modules/prisma .next/standalone/node_modules/prisma
  cp -R node_modules/@prisma .next/standalone/node_modules/@prisma
  node - <<'NODE' | while IFS= read -r pkg; do
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const seen = new Set();
function packageDir(name) {
  if (name.startsWith("@")) return path.join(root, "node_modules", ...name.split("/"));
  return path.join(root, "node_modules", name);
}
function walk(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const packageJson = path.join(packageDir(name), "package.json");
  if (!fs.existsSync(packageJson)) throw new Error(`Missing Prisma CLI dependency: ${name}`);
  const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8"));
  for (const dependency of Object.keys(pkg.dependencies || {})) walk(dependency);
}
walk("prisma");
for (const name of [...seen].filter((value) => value !== "prisma" && !value.startsWith("@prisma/")).sort()) {
  console.log(name);
}
NODE
    copy_runtime_package "$pkg"
  done

  test -f .next/standalone/prisma/schema.prisma
  test -f .next/standalone/prisma/migrations/migration_lock.toml
  test -f .next/standalone/prisma.config.ts
  test -f .next/standalone/scripts/check/check-prisma-deploy-status.js
  test -f .next/standalone/scripts/ci/check-migration-policy.mjs
  test -f .next/standalone/scripts/migrate/sqlite-to-postgresql.mjs
  test -f .next/standalone/node_modules/prisma/build/index.js
  test -f .next/standalone/node_modules/effect/package.json
}

copy_resource_seed_files() {
  echo "==> 打包 RBAC resource manifest..."
  node --import tsx scripts/write-resource-manifest.ts .next/standalone/resource-defs.json
  cp scripts/seed-resources-runtime.mjs .next/standalone/seed-resources-runtime.mjs
  mkdir -p .next/standalone/scripts
  cp scripts/provision-agent-workforce.mjs .next/standalone/scripts/provision-agent-workforce.mjs
  mkdir -p .next/standalone/scripts/lib
  cp scripts/lib/agent-workforce-specs.mjs .next/standalone/scripts/lib/agent-workforce-specs.mjs
  mkdir -p .next/standalone/scripts/check
  cp scripts/check/check-permission-action-grants.mjs .next/standalone/scripts/check/check-permission-action-grants.mjs
  test -f .next/standalone/resource-defs.json
  test -f .next/standalone/seed-resources-runtime.mjs
  test -f .next/standalone/scripts/provision-agent-workforce.mjs
  test -f .next/standalone/scripts/lib/agent-workforce-specs.mjs
  test -f .next/standalone/scripts/check/check-permission-action-grants.mjs
}

copy_external_party_import_files() {
  echo "==> 打包一次性外部往来主数据导入器..."
  mkdir -p .next/standalone/scripts/import .next/standalone/scripts/lib
  cp scripts/import/import-external-party-master.mjs .next/standalone/scripts/import/import-external-party-master.mjs
  cp scripts/import/external-party-master-source.mjs .next/standalone/scripts/import/external-party-master-source.mjs
  cp scripts/lib/database-url.js .next/standalone/scripts/lib/database-url.js
  test -f .next/standalone/scripts/import/import-external-party-master.mjs
  test -f .next/standalone/scripts/import/external-party-master-source.mjs
  test -f .next/standalone/scripts/lib/database-url.js
}

copy_data_release_files() {
  echo "==> 打包私有数据发布执行器与生产回执门禁..."
  test -f ops/data-release.mjs
  test -f ops/apply-data-release.mjs
  test -f ops/replace-production-database.sh
  test -f ops/prisma-genesis-cutover.mjs
  rm -rf .next/standalone/ops/data-releases
  mkdir -p .next/standalone/ops
  cp ops/data-release.mjs .next/standalone/ops/data-release.mjs
  cp ops/apply-data-release.mjs .next/standalone/ops/apply-data-release.mjs
  cp ops/data-release-handlers.mjs .next/standalone/ops/data-release-handlers.mjs
  cp ops/data-release-transfer.mjs .next/standalone/ops/data-release-transfer.mjs
  cp ops/replace-production-database.sh .next/standalone/ops/replace-production-database.sh
  chmod 755 .next/standalone/ops/replace-production-database.sh
  cp ops/prisma-genesis-cutover.mjs .next/standalone/ops/prisma-genesis-cutover.mjs
  cp tsconfig.json tsconfig.base.json .next/standalone/
  if [ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]; then
    test -f .cnb-release.json
    cp .cnb-release.json .next/standalone/.cnb-release.json
  fi
  cp -R packages .next/standalone/
  cp -R generated .next/standalone/
  cp -R scripts/import .next/standalone/scripts/
  cp -R scripts/lib .next/standalone/scripts/
  cp -R scripts/repair .next/standalone/scripts/
  test -f .next/standalone/ops/data-release.mjs
  test -f .next/standalone/ops/apply-data-release.mjs
  test -f .next/standalone/ops/data-release-handlers.mjs
  test -f .next/standalone/ops/data-release-transfer.mjs
  test -x .next/standalone/ops/replace-production-database.sh
  test -f .next/standalone/ops/prisma-genesis-cutover.mjs
  test -f .next/standalone/tsconfig.json
  test -f .next/standalone/tsconfig.base.json
  test -f .next/standalone/scripts/repair/repair-finance-consolidation-voucher.mjs
  test -f .next/standalone/scripts/repair/repair-hr-lifecycle-compatibility.mjs
  test -f .next/standalone/scripts/repair/repair-hr-organization-baseline-compatibility.mjs
  test -f .next/standalone/scripts/repair/repair-hr-employment-agreement-baseline.mjs
  if [ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]; then
    cmp .cnb-release.json .next/standalone/.cnb-release.json
  fi
}

if [ "$STANDALONE_SKIP_NEXT_BUILD" = "1" ]; then
  echo "==> 复用当前 job 已完成的 Next standalone 构建..."
  if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/BUILD_ID)" != "$CONTENT_DIGEST" ]; then
    echo "[错误] STANDALONE_SKIP_NEXT_BUILD 只能复用 BUILD_ID 等于候选内容摘要的构建"
    exit 1
  fi
  ensure_build_deps
  test -d .next/standalone
  test -d .next/static
  npm run output-tracing:check
else
  echo "==> 构建 Next standalone 产物..."
  ensure_build_deps
  if [ "${STANDALONE_EXTERNAL_TYPECHECK:-0}" = "1" ]; then
    run_artifact_stage next.build \
      env NEXT_PUBLIC_BUILD_VERSION="$CONTENT_DIGEST" BUILD_VERSION="$CONTENT_DIGEST" \
      bash -c 'npm run db:generate:inner && npm run build:next:after-typecheck'
  else
    run_artifact_stage next.build \
      env NEXT_PUBLIC_BUILD_VERSION="$CONTENT_DIGEST" BUILD_VERSION="$CONTENT_DIGEST" \
      npm run build
  fi
fi

if [ ! -f .cache/source-code-analysis/snapshot.json ]; then
  npm run source-code-analysis:snapshot
fi
test -s .cache/source-code-analysis/snapshot.json || {
  echo "[错误] 源码分析 snapshot 未生成，禁止组装 standalone artifact" >&2
  exit 1
}

if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/BUILD_ID)" != "$CONTENT_DIGEST" ]; then
  echo "[错误] .next/BUILD_ID 与候选内容摘要不一致；禁止打包错误构建"
  exit 1
fi

standalone_servers="$(find .next/standalone -path '*/node_modules/*' -prune -o -type f -name server.js -print)"
standalone_server_count="$(printf '%s\n' "$standalone_servers" | awk 'NF { count += 1 } END { print count + 0 }')"
if [ "$standalone_server_count" != "1" ]; then
  echo "[错误] Next standalone 产物必须恰好包含一个非 node_modules server.js，实际: $standalone_server_count"
  find .next/standalone -maxdepth 4 -type f | sort | head -80 || true
  exit 1
fi
standalone_server="$standalone_servers"
standalone_app_dir="$(dirname "$standalone_server")"
printf '%s\n' "${standalone_server#.next/standalone/}" > .next/standalone/.server-entry

rm -rf "$standalone_app_dir/.next/static"
mkdir -p "$standalone_app_dir/.next"
cp -r .next/static "$standalone_app_dir/.next/static"
rm -rf "$standalone_app_dir/public"
cp -R public "$standalone_app_dir/public"
mkdir -p "$standalone_app_dir/.workspace/source-code-analysis"
cp .cache/source-code-analysis/snapshot.json "$standalone_app_dir/.workspace/source-code-analysis/snapshot.json"
test -s "$standalone_app_dir/.workspace/source-code-analysis/snapshot.json" || {
  echo "[错误] standalone artifact 缺少源码分析 snapshot" >&2
  exit 1
}
# Runtime branding and avatar links point outside the repository. They must never enter the
# portable standalone artifact; production relinks them from REMOTE_WORKSPACE_CONFIG_DIR after extract.
for runtime_asset in \
  "$standalone_app_dir/public/company" \
  "$standalone_app_dir/public/assets/agent/avatar" \
  "$standalone_app_dir/public/assets/user/avatar"; do
  if [ -L "$runtime_asset" ]; then rm -f "$runtime_asset"; fi
done
unexpected_public_links="$(find "$standalone_app_dir/public" -type l -print)"
if [ -n "$unexpected_public_links" ]; then
  echo "[错误] standalone public 目录包含未登记软链，禁止打入公开 artifact:"
  printf '%s\n' "$unexpected_public_links"
  exit 1
fi
rm -rf "$standalone_app_dir/data"
rm -f "$standalone_app_dir/.env"

# Output tracing can retain partial runtime package shells. Copy complete closures that
# production loads dynamically, then add deployment-only schema/resource/runtime files.
run_artifact_stage runtime.dependencies \
  copy_runtime_package_tree pg @prisma/adapter-pg @prisma/client dotenv server-only sharp tsx xlsx @wecom/aibot-node-sdk @moonshot-ai/kimi-agent-sdk
run_artifact_stage runtime.sharp \
  node -e 'const sharp=require("./.next/standalone/node_modules/sharp"); if (!sharp.versions?.sharp) throw new Error("standalone sharp runtime is incomplete")'
run_artifact_stage runtime.prisma copy_prisma_deploy_files
run_artifact_stage runtime.resources copy_resource_seed_files
run_artifact_stage runtime.importers copy_external_party_import_files
run_artifact_stage runtime.data-releases copy_data_release_files

mkdir -p .next/standalone/scripts/runtime
cp scripts/runtime/wecom-agent-bot.mjs .next/standalone/scripts/runtime/wecom-agent-bot.mjs
cp scripts/runtime/wecom-agent-delivery.mjs .next/standalone/scripts/runtime/wecom-agent-delivery.mjs
cp scripts/runtime/wecom-agent-input.mjs .next/standalone/scripts/runtime/wecom-agent-input.mjs
cp scripts/runtime/wecom-agent-stream.mjs .next/standalone/scripts/runtime/wecom-agent-stream.mjs
cp scripts/runtime/wecom-notification-delivery.mjs .next/standalone/scripts/runtime/wecom-notification-delivery.mjs

rm -rf .next/standalone/generated/prisma
mkdir -p .next/standalone/generated
cp -R generated/prisma .next/standalone/generated/prisma
rm -rf .next/standalone/generated/production
find .next/standalone \( -name '.DS_Store' -o -name '._*' \) -delete

test -f .next/standalone/node_modules/pg/lib/index.js
test -f .next/standalone/node_modules/@prisma/adapter-pg/dist/index.js
test -f .next/standalone/node_modules/@prisma/client/default.js
test -f .next/standalone/node_modules/server-only/empty.js
test -f .next/standalone/node_modules/xlsx/xlsx.js
test -f .next/standalone/node_modules/tsx/package.json
test -f .next/standalone/node_modules/@wecom/aibot-node-sdk/dist/index.cjs.js
test -f .next/standalone/node_modules/@moonshot-ai/kimi-agent-sdk/dist/index.cjs
test -f .next/standalone/scripts/runtime/wecom-agent-bot.mjs
test -f .next/standalone/scripts/runtime/wecom-agent-delivery.mjs
test -f .next/standalone/scripts/runtime/wecom-agent-input.mjs
test -f .next/standalone/scripts/runtime/wecom-agent-stream.mjs
test -f .next/standalone/scripts/runtime/wecom-notification-delivery.mjs
test -f .next/standalone/scripts/import/import-external-party-master.mjs
test -f .next/standalone/generated/prisma/client.ts
test ! -e .next/standalone/generated/production

# A shared release worktree may use one external node_modules symlink for build speed.
# The standalone parent already owns the complete traced/runtime closure, so the app-level
# shortcut is neither needed at runtime nor allowed in the portable artifact.
if [ -L "$standalone_app_dir/node_modules" ]; then
  [ "$(realpath "$standalone_app_dir/node_modules")" = "$(realpath node_modules)" ] || {
    echo "[错误] standalone app node_modules 指向未知位置" >&2
    exit 1
  }
  rm -f "$standalone_app_dir/node_modules"
fi
STANDALONE_ROOT=".next/standalone" DEPENDENCY_ROOT="$(realpath node_modules)" node <<'NODE'
const fs = require("fs");
const path = require("path");

const standaloneRoot = fs.realpathSync(process.env.STANDALONE_ROOT);
const dependencyRoot = fs.realpathSync(process.env.DEPENDENCY_ROOT);
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try { target = fs.realpathSync(entryPath); }
      catch { throw new Error(`standalone contains broken symlink: ${entryPath}`); }
      if (!inside(standaloneRoot, target) && !inside(dependencyRoot, target)) {
        throw new Error(`standalone symlink escapes governed runtime dependencies: ${entryPath} -> ${target}`);
      }
    } else if (entry.isDirectory()) visit(entryPath);
  }
}
visit(standaloneRoot);
NODE

mkdir -p "$(dirname "$ARTIFACT_PATH")" "$(dirname "$MANIFEST_PATH")"
rm -f "$ARTIFACT_PATH" "$MANIFEST_PATH"
run_artifact_stage artifact.archive env COPYFILE_DISABLE=1 \
  tar --dereference -C .next/standalone -czf "$ARTIFACT_PATH" .
artifact_sha="$(hash_file "$ARTIFACT_PATH")"
package_lock_sha="$(hash_file package-lock.json)"
migration_set_sha="$(node <<'NODE'
const { createHash } = require("crypto");
const { readdirSync, readFileSync } = require("fs");
const { join, relative } = require("path");
const root = process.cwd();
const migrationRoot = join(root, "prisma", "migrations");
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) files.push(path);
  }
}
walk(migrationRoot);
const hash = createHash("sha256");
for (const path of files.sort()) {
  hash.update(relative(root, path).split(require("path").sep).join("/"));
  hash.update("\0");
  hash.update(readFileSync(path));
  hash.update("\0");
}
process.stdout.write(hash.digest("hex"));
NODE
)"

DEPLOY_GRAPH_PATH="${STANDALONE_DEPLOY_GRAPH_PATH:-.next/workspace-deploy-graph.json}"
node --conditions=react-server --import tsx scripts/deploy/check-deploy-graph.ts --json > "$DEPLOY_GRAPH_PATH"
deploy_graph_sha="$(node ops/gateway-generation.mjs graph-digest --graph "$DEPLOY_GRAPH_PATH")"

SOURCE_SHA="$SOURCE_SHA" \
SOURCE_TREE="$SOURCE_TREE" \
CONTENT_DIGEST="$CONTENT_DIGEST" \
PACKAGE_LOCK_SHA="$package_lock_sha" \
MIGRATION_SET_SHA="$migration_set_sha" \
DEPLOY_GRAPH_SHA="$deploy_graph_sha" \
ARTIFACT_PATH="$ARTIFACT_PATH" \
ARTIFACT_SHA="$artifact_sha" \
MANIFEST_PATH="$MANIFEST_PATH" \
node <<'NODE'
const { readFileSync, statSync, writeFileSync } = require("fs");
const { basename } = require("path");

const manifest = {
  schemaVersion: 2,
  source: {
    commitSha: process.env.SOURCE_SHA,
    treeSha: process.env.SOURCE_TREE,
    contentDigest: process.env.CONTENT_DIGEST,
  },
  inputs: {
    packageLockSha256: process.env.PACKAGE_LOCK_SHA,
    migrationSetSha256: process.env.MIGRATION_SET_SHA,
    deployGraphSha256: process.env.DEPLOY_GRAPH_SHA,
  },
  artifact: {
    fileName: basename(process.env.ARTIFACT_PATH),
    sha256: process.env.ARTIFACT_SHA,
    sizeBytes: statSync(process.env.ARTIFACT_PATH).size,
  },
  build: {
    createdAt: new Date().toISOString(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    packageVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
    nextVersion: JSON.parse(readFileSync("node_modules/next/package.json", "utf8")).version,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    command: "ops/build-standalone-artifact.sh",
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    githubEventName: process.env.GITHUB_EVENT_NAME || null,
  },
};
writeFileSync(process.env.MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
NODE

echo "==> standalone 产物: $ARTIFACT_PATH ($artifact_sha)"
echo "==> standalone manifest: $MANIFEST_PATH"
