#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
LANE="${2:-}"
RESULT_DIR="${CNB_CI_RESULT_DIR:-.release/ci-results}"
fail() { echo "[错误] $*" >&2; exit 1; }

verify_checkout() {
  [[ "${CNB_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]] || fail "CNB_COMMIT 必须是完整小写 SHA"
  expected_sha="$CNB_COMMIT"
  if [ "${CNB_PULL_REQUEST_LIKE:-false}" = true ]; then
    [[ "${CNB_PULL_REQUEST_MERGE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] \
      || fail "PR 预合并工作区缺少 CNB_PULL_REQUEST_MERGE_SHA"
    expected_sha="$CNB_PULL_REQUEST_MERGE_SHA"
  fi
  actual_sha="$(git rev-parse HEAD)"
  [ "$actual_sha" = "$expected_sha" ] \
    || fail "CNB checkout SHA 不匹配：expected=$expected_sha actual=$actual_sha"
  [ -z "$(git status --porcelain=v1 --untracked-files=all)" ] \
    || fail "CNB 必须从干净 checkout 开始；拒绝复用带脏文件的工作区"
}

setup_database() {
  service postgresql start >/dev/null || return
  runuser -u postgres -- psql --set ON_ERROR_STOP=1 <<'SQL' || return
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
      runuser -u postgres -- createdb --owner workspace "$database" || return
    fi
  done
  pg_isready -h 127.0.0.1 -U workspace -d workspace_ci >/dev/null
}

setup() {
  test -x node_modules/.bin/next || fail "CNB 缓存环境缺少 Next.js 依赖"
  test -x node_modules/.bin/playwright || fail "CNB 缓存环境缺少 Playwright 依赖"
  rm -rf "$RESULT_DIR"
  mkdir -p "$RESULT_DIR"
  setup_status=0
  if [ "${PLAYWRIGHT_BROWSERS_PATH:-}" != /ms-playwright ] || [ ! -d /ms-playwright ]; then
    echo "[错误] CNB 缓存环境缺少 Chromium 或浏览器路径不正确" >&2
    setup_status=1
  fi
  setup_database || setup_status=1
  CHECK_LOCK=0 npm run db:generate:inner || setup_status=1
  printf '%s\n' "$setup_status" > "$RESULT_DIR/setup.status"
  return 0
}

source_identity() {
  SOURCE_SHA="$(git rev-parse HEAD)"
  SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
  identity="$(node ops/release/candidate/identity.mjs capture --repository "$PWD" --revision HEAD)"
  CONTENT_DIGEST="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.contentDigest)' "$identity")"
  [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ && "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ && "$CONTENT_DIGEST" =~ ^[0-9a-f]{64}$ ]] \
    || fail "CNB source identity 非法"
  export SOURCE_SHA SOURCE_TREE CONTENT_DIGEST
  export NEXT_PUBLIC_BUILD_VERSION="$CONTENT_DIGEST" BUILD_VERSION="$CONTENT_DIGEST"
  export RELEASE_SOURCE_SHA="$SOURCE_SHA" RELEASE_SOURCE_TREE="$SOURCE_TREE" RELEASE_CONTENT_DIGEST="$CONTENT_DIGEST"
}

run_static() {
  source_identity
  CHECK_LOCK=0 CHECK_SUITE_COLLECT_FAILURES=1 node scripts/check/run-check-suite.mjs cnb-static
}

run_node_bucket() {
  bucket="${LANE#node-}"
  node scripts/testing/run-node-tests.mjs bucket "$bucket" 4
}

run_typecheck() {
  NODE_OPTIONS=--max-old-space-size=8192 \
    CHECK_LOCK=0 node scripts/check/run-typecheck.js --build --pretty false
}

run_build_and_package() {
  source_identity
  if [ -n "${CNB_COMMIT:-}" ] && [ "$CNB_COMMIT" != "$SOURCE_SHA" ]; then
    fail "CNB checkout 与 CNB_COMMIT 不一致"
  fi
  WORKSPACE_NEXT_TYPECHECK_AUTHORITY=external npm run build:next:inner || return
  STANDALONE_SKIP_NEXT_BUILD=1 bash ./ops/build-standalone-artifact.sh
}

run_database() {
  failures=0
  CHECK_LOCK=0 CHECK_SUITE_COLLECT_FAILURES=1 node scripts/check/run-check-suite.mjs data || failures=1
  npx prisma migrate deploy --schema=./prisma || failures=1
  npm run db:seed:resources || failures=1
  npm run test:integration:postgresql || failures=1
  return "$failures"
}

run_e2e() {
  PLAYWRIGHT_STANDALONE_ARCHIVE=.next/workspace-standalone.tgz \
    PLAYWRIGHT_STANDALONE_MANIFEST=.next/workspace-standalone.manifest.json \
    npm run test:e2e:smoke || return
  npm run playwright:processes:check
}

run_lane() {
  mkdir -p "$RESULT_DIR"
  case "$LANE" in
    static) command=(run_static) ;;
    node-0|node-1|node-2|node-3) command=(run_node_bucket) ;;
    typecheck) command=(run_typecheck) ;;
    build) command=(run_build_and_package) ;;
    database) command=(run_database) ;;
    e2e) command=(run_e2e) ;;
    *) fail "未知 CNB CI lane: $LANE" ;;
  esac
  set +e
  "${command[@]}"
  status=$?
  printf '%s\n' "$status" > "$RESULT_DIR/$LANE.status"
  return "$status"
}

summary() {
  failures=()
  for lane in setup static node-0 node-1 node-2 node-3 typecheck build database e2e; do
    file="$RESULT_DIR/$lane.status"
    if [ ! -s "$file" ] || [ "$(sed -n '1p' "$file")" != 0 ]; then failures+=("$lane"); fi
  done
  if [ "${#failures[@]}" -gt 0 ]; then
    printf 'CNB required failed lanes: %s\n' "${failures[*]}" >&2
    return 1
  fi
  echo "CNB required independent lanes passed"
}

case "$ACTION" in
  checkout) verify_checkout ;;
  setup) setup ;;
  lane) run_lane ;;
  summary) summary ;;
  *) fail "用法: cnb-ci.sh checkout|setup|lane <name>|summary" ;;
esac
