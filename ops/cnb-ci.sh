#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
fail() { echo "[错误] $*" >&2; exit 1; }

setup() {
  test -x node_modules/.bin/next || fail "CNB 缓存环境缺少 Next.js 依赖"
  test -x node_modules/.bin/playwright || fail "CNB 缓存环境缺少 Playwright 依赖"
  [ "${PLAYWRIGHT_BROWSERS_PATH:-}" = /ms-playwright ] || fail "Playwright 浏览器路径未绑定缓存环境镜像"
  test -d /ms-playwright || fail "CNB 缓存环境缺少 Chromium"
  service postgresql start >/dev/null
  runuser -u postgres -- psql --set ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workspace') THEN
    CREATE ROLE workspace LOGIN SUPERUSER PASSWORD 'workspace';
  ELSE
    ALTER ROLE workspace WITH LOGIN SUPERUSER PASSWORD 'workspace';
  END IF;
END $$;
SQL
  for database in workspace_ci workspace_ci_shadow; do
    if ! runuser -u postgres -- psql --tuples-only --no-align \
      --command "SELECT 1 FROM pg_database WHERE datname='${database}'" | grep -qx 1; then
      runuser -u postgres -- createdb --owner workspace "$database"
    fi
  done
  pg_isready -h 127.0.0.1 -U workspace -d workspace_ci >/dev/null
}

checks() {
  source_sha="$(git rev-parse HEAD)"
  source_tree="$(git rev-parse 'HEAD^{tree}')"
  identity="$(node ops/release/candidate/identity.mjs capture --repository "$PWD" --revision HEAD)"
  content_digest="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.contentDigest)' "$identity")"
  NEXT_PUBLIC_BUILD_VERSION="$content_digest" BUILD_VERSION="$content_digest" \
    RELEASE_SOURCE_SHA="$source_sha" RELEASE_SOURCE_TREE="$source_tree" RELEASE_CONTENT_DIGEST="$content_digest" \
    npm run check:ci
}

postgresql() {
  npm run check:data
  npx prisma migrate deploy --schema=./prisma
  npm run db:seed:resources
  npm run test:integration:postgresql
}

build() {
  source_sha="$(git rev-parse HEAD)"
  source_tree="$(git rev-parse 'HEAD^{tree}')"
  identity="$(node ops/release/candidate/identity.mjs capture --repository "$PWD" --revision HEAD)"
  content_digest="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.contentDigest)' "$identity")"
  [[ "$source_sha" =~ ^[0-9a-f]{40}$ && "$source_tree" =~ ^[0-9a-f]{40}$ && "$content_digest" =~ ^[0-9a-f]{64}$ ]] \
    || fail "CNB source identity 非法"
  if [ -n "${CNB_COMMIT:-}" ] && [ "$CNB_COMMIT" != "$source_sha" ]; then
    fail "CNB checkout 与 CNB_COMMIT 不一致"
  fi
  STANDALONE_SKIP_NEXT_BUILD=1 RELEASE_SOURCE_SHA="$source_sha" RELEASE_SOURCE_TREE="$source_tree" \
    RELEASE_CONTENT_DIGEST="$content_digest" bash ./ops/build-standalone-artifact.sh
}

e2e() {
  PLAYWRIGHT_STANDALONE_ARCHIVE=.next/workspace-standalone.tgz \
    PLAYWRIGHT_STANDALONE_MANIFEST=.next/workspace-standalone.manifest.json \
    npm run test:e2e:smoke
  npm run playwright:processes:check
}

required() {
  failures=()
  blocked=()
  postgresql_ok=1
  artifact_ok=1

  if ! checks; then
    failures+=("source/type/node/build")
  fi
  if ! postgresql; then
    postgresql_ok=0
    failures+=("postgresql")
  fi
  if [ -s .next/BUILD_ID ]; then
    if ! build; then
      artifact_ok=0
      failures+=("standalone-package")
    fi
  else
    artifact_ok=0
    blocked+=("standalone-package: unique Next build missing")
  fi
  if [ "$artifact_ok" = 1 ] && [ "$postgresql_ok" = 1 ]; then
    if ! e2e; then failures+=("exact-build-e2e"); fi
  else
    blocked+=("exact-build-e2e: standalone or PostgreSQL prerequisite failed")
  fi

  echo "==> CNB required summary"
  if [ "${#failures[@]}" -gt 0 ]; then printf 'failed: %s\n' "${failures[@]}"; fi
  if [ "${#blocked[@]}" -gt 0 ]; then printf 'blocked: %s\n' "${blocked[@]}"; fi
  [ "${#failures[@]}" -eq 0 ] && [ "${#blocked[@]}" -eq 0 ]
}

case "$ACTION" in
  setup) setup ;;
  required) required ;;
  *) fail "用法: cnb-ci.sh setup|required" ;;
esac
