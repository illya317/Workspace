#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-verify}"
RELEASE_MANIFEST_FILE="${RELEASE_MANIFEST_FILE:-release.json}"
DEPLOY_IMAGE_REF="${DEPLOY_IMAGE_REF:-${IMAGE_REF:-}}"
SOURCE_SHA="${SOURCE_SHA:-}"
SOURCE_TREE="${SOURCE_TREE:-}"
IMAGE_DIGEST="${IMAGE_DIGEST:-}"
APPROVED_IMAGE_REF="${APPROVED_IMAGE_REF:-$DEPLOY_IMAGE_REF}"

fail() { echo "[错误] $*" >&2; exit 1; }
require() { [ -n "${!1:-}" ] || fail "缺少 $1"; }

for key in RELEASE_MANIFEST_FILE DEPLOY_IMAGE_REF SOURCE_SHA SOURCE_TREE IMAGE_DIGEST; do require "$key"; done
[ -f "$RELEASE_MANIFEST_FILE" ] || fail "release.json 不存在: $RELEASE_MANIFEST_FILE"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA 必须是完整小写 SHA"
[[ "$SOURCE_TREE" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_TREE 必须是完整小写 tree"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "IMAGE_DIGEST 必须是 sha256 digest"
[[ "$DEPLOY_IMAGE_REF" != *"@"* ]] || fail "DEPLOY_IMAGE_REF 不得自行携带 digest"
IMAGE="${DEPLOY_IMAGE_REF}@${IMAGE_DIGEST}"

verify_release_json() {
  python3 - "$RELEASE_MANIFEST_FILE" "$SOURCE_SHA" "$SOURCE_TREE" "$APPROVED_IMAGE_REF" "$IMAGE_DIGEST" <<'PY'
import hashlib, json, re, sys
path, source_sha, source_tree, image_ref, image_digest = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    value = json.load(handle)
release_digest = value.pop("releaseDigest", "")
actual = hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
checks = [
    value.get("schemaVersion") == 1,
    value.get("kind") == "workspace-oci-release",
    value.get("source", {}).get("commitSha") == source_sha,
    value.get("source", {}).get("treeSha") == source_tree,
    value.get("image", {}).get("ref") == image_ref,
    value.get("image", {}).get("digest") == image_digest,
    value.get("image", {}).get("platform") == "linux/amd64",
    value.get("build", {}).get("provider") == "cnb",
    value.get("build", {}).get("requiredCheck") == "CNB / required",
    value.get("build", {}).get("requiredConclusion") == "success",
    re.fullmatch(r"[0-9a-f]{64}", value.get("source", {}).get("contentDigest", "")) is not None,
    re.fullmatch(r"[0-9a-f]{64}", value.get("artifact", {}).get("sha256", "")) is not None,
    release_digest == actual,
]
if not all(checks):
    raise SystemExit("release.json identity validation failed")
print("release.json identity verified")
PY
}

verify_local_image() {
  docker image inspect "$IMAGE" >/dev/null
  local architecture
  architecture="$(docker image inspect "$IMAGE" --format '{{.Architecture}}')"
  [ "$architecture" = amd64 ] || fail "镜像架构不是 linux/amd64: $architecture"
}

verify_release_json
if [ "$MODE" = verify ]; then
  verify_local_image
  exit 0
fi

if [ "$MODE" = rehearsal ]; then
  verify_local_image
  rehearsal_id="${SOURCE_SHA:0:12}-$$"
  network="workspace-release-${rehearsal_id}"
  database="workspace-release-db-${rehearsal_id}"
  application="workspace-release-app-${rehearsal_id}"
  rollback="workspace-release-rollback-${rehearsal_id}"
  config_volume="workspace-release-config-${rehearsal_id}"
  cleanup() {
    docker rm -f "$application" "$rollback" "$database" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    docker volume rm -f "$config_volume" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  docker network create "$network" >/dev/null
  docker run -d --name "$database" --network "$network" \
    -e POSTGRES_USER=workspace -e POSTGRES_PASSWORD=workspace -e POSTGRES_DB=workspace_rehearsal postgres:15 >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$database" pg_isready -U workspace -d workspace_rehearsal >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$database" pg_isready -U workspace -d workspace_rehearsal >/dev/null
  docker volume create "$config_volume" >/dev/null
  tar -C scripts/check/fixtures/tenant-workspace -cf - . \
    | docker run --rm -i -v "$config_volume:/workspace-config" alpine:3.20 \
      tar -C /workspace-config -xf -
  database_url='postgresql://workspace:workspace@workspace-release-db-'"${rehearsal_id}"':5432/workspace_rehearsal'
  docker run --rm --network "$network" --entrypoint node \
    -e DATABASE_URL="$database_url" -e DIRECT_URL="$database_url" \
    "$IMAGE" node_modules/prisma/build/index.js migrate deploy --schema=./prisma
  run_rehearsal_app() {
    local name="$1" port="$2"
    docker run -d --name "$name" --network "$network" -p "127.0.0.1:${port}:3000" \
      -v "$config_volume:/workspace-config:ro" \
      -e DATABASE_URL="$database_url" -e NEXTAUTH_SECRET=rehearsal-only \
      -e NEXTAUTH_URL="http://127.0.0.1:${port}/workspace" \
      -e WORKSPACE_CONFIG_DIR=/workspace-config -e RELEASE_IMAGE_DIGEST="$IMAGE_DIGEST" "$IMAGE" >/dev/null
    local health_ok=0
    for _ in $(seq 1 30); do
      curl -fsS "http://127.0.0.1:${port}/workspace/api/internal/health" >/dev/null 2>&1 \
        && health_ok=1 && break
      sleep 1
    done
    [ "$health_ok" = 1 ] || { docker logs "$name" --tail 100 >&2; fail "演练健康检查失败"; }
    response="$(curl -fsS "http://127.0.0.1:${port}/workspace/api/settings/version")"
    VERSION_RESPONSE="$response" EXPECTED_DIGEST="$IMAGE_DIGEST" python3 - <<'PY'
import json, os
value=json.loads(os.environ["VERSION_RESPONSE"])
if value.get("imageDigest") != os.environ["EXPECTED_DIGEST"]:
    raise SystemExit("online image digest mismatch")
PY
  }
  run_rehearsal_app "$application" 33101
  docker rm -f "$application" >/dev/null
  run_rehearsal_app "$rollback" 33102
  echo "rehearsal deploy and rollback passed: $IMAGE_DIGEST"
  exit 0
fi

[ "$MODE" = production ] || fail "模式只能是 verify、rehearsal 或 production"
missing_inputs=()
[ "${PRODUCTION_IMAGE_DEPLOY_ENABLED:-}" = 1 ] \
  || missing_inputs+=("PRODUCTION_IMAGE_DEPLOY_ENABLED=1")
for key in SERVER REMOTE_DIR HEALTHCHECK_URL; do
  [ -n "${!key:-}" ] || missing_inputs+=("$key")
done
if [ -z "${KEY:-}" ] && [ -z "${KEY_CONTENT:-}" ]; then
  missing_inputs+=("KEY or KEY_CONTENT")
fi
if [ "${#missing_inputs[@]}" -gt 0 ]; then
  printf '[错误] 缺少生产部署输入:' >&2
  printf ' %s' "${missing_inputs[@]}" >&2
  printf '\n' >&2
  exit 1
fi
REMOTE_RUNTIME_ENV_FILE="${REMOTE_RUNTIME_ENV_FILE:-$REMOTE_DIR/.workspace/runtime.env}"
REMOTE_CONTROL_ENV_FILE="${REMOTE_CONTROL_ENV_FILE:-$REMOTE_DIR/.workspace/control-plane.env}"
REMOTE_LEGACY_ENV_FILE="${REMOTE_LEGACY_ENV_FILE:-$REMOTE_DIR/.workspace/.env}"
if [ -n "${KEY:-}" ]; then
  SSH_KEY="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  SSH_KEY="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$SSH_KEY"
  chmod 600 "$SSH_KEY"
else
  fail "缺少 KEY/KEY_CONTENT"
fi
case "$REMOTE_DIR $REMOTE_RUNTIME_ENV_FILE $REMOTE_CONTROL_ENV_FILE" in
  *[!A-Za-z0-9_./\ -]*) fail "远端路径包含不安全字符" ;;
esac
ssh_options=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
cleanup_key() { [ "${KEY:-}" = "$SSH_KEY" ] || rm -f "$SSH_KEY"; }
trap cleanup_key EXIT

remote_registry="${DEPLOY_IMAGE_REF%%/*}"
if [ -n "${CNB_TOKEN:-}" ]; then
  printf '%s' "$CNB_TOKEN" | ssh "${ssh_options[@]}" "$SERVER" \
    "mkdir -p '$REMOTE_DIR/.workspace/docker-auth' && docker --config '$REMOTE_DIR/.workspace/docker-auth' login '$remote_registry' -u cnb --password-stdin >/dev/null"
fi
ssh "${ssh_options[@]}" "$SERVER" "mkdir -p '$REMOTE_DIR/.workspace/image-releases'"
scp "${ssh_options[@]}" "$RELEASE_MANIFEST_FILE" "$SERVER:$REMOTE_DIR/.workspace/image-releases/${IMAGE_DIGEST#sha256:}.json" >/dev/null

ssh "${ssh_options[@]}" "$SERVER" \
  "SOURCE_SHA='$SOURCE_SHA' SOURCE_TREE='$SOURCE_TREE' IMAGE='$IMAGE' IMAGE_DIGEST='$IMAGE_DIGEST' REMOTE_DIR='$REMOTE_DIR' REMOTE_RUNTIME_ENV_FILE='$REMOTE_RUNTIME_ENV_FILE' REMOTE_CONTROL_ENV_FILE='$REMOTE_CONTROL_ENV_FILE' REMOTE_LEGACY_ENV_FILE='$REMOTE_LEGACY_ENV_FILE' HEALTHCHECK_URL='$HEALTHCHECK_URL' LEGACY_PM2_NAME='${LEGACY_PM2_NAME:-workspace}' bash -s" <<'REMOTE'
set -euo pipefail
exec 9>"$REMOTE_DIR/.workspace/image-deploy.lock"
flock -n 9 || { echo '[错误] 另一镜像部署正在运行' >&2; exit 1; }

if [ ! -s "$REMOTE_RUNTIME_ENV_FILE" ] || [ ! -s "$REMOTE_CONTROL_ENV_FILE" ]; then
  [ -s "$REMOTE_LEGACY_ENV_FILE" ] || { echo '[错误] 缺少生产 env 文件' >&2; exit 1; }
  umask 077
  runtime_tmp="${REMOTE_RUNTIME_ENV_FILE}.tmp.$$"
  control_tmp="${REMOTE_CONTROL_ENV_FILE}.tmp.$$"
  awk -F= '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
    {
      key=$1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key !~ /^(DIRECT_URL|SHADOW_DATABASE_URL|WORKSPACE_BACKUP_DATABASE_URL|WORKSPACE_MONITOR_DATABASE_URL)$/) print
    }
  ' "$REMOTE_LEGACY_ENV_FILE" > "$runtime_tmp"
  awk -F= '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      key=$1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key ~ /^(DATABASE_URL|DIRECT_URL|WORKSPACE_BACKUP_DATABASE_URL|WORKSPACE_MONITOR_DATABASE_URL|PG[A-Z0-9_]*)$/) print
    }
  ' "$REMOTE_LEGACY_ENV_FILE" > "$control_tmp"
  grep -q '^DATABASE_URL=' "$runtime_tmp" || { echo '[错误] runtime.env 缺少 DATABASE_URL' >&2; exit 1; }
  grep -q '^DIRECT_URL=' "$control_tmp" || { echo '[错误] control-plane.env 缺少 DIRECT_URL' >&2; exit 1; }
  mv "$runtime_tmp" "$REMOTE_RUNTIME_ENV_FILE"
  mv "$control_tmp" "$REMOTE_CONTROL_ENV_FILE"
  chmod 600 "$REMOTE_RUNTIME_ENV_FILE" "$REMOTE_CONTROL_ENV_FILE"
fi

docker --config "$REMOTE_DIR/.workspace/docker-auth" pull "$IMAGE"
[ "$(docker image inspect "$IMAGE" --format '{{.Architecture}}')" = amd64 ]
set -a
. "$REMOTE_CONTROL_ENV_FILE"
set +a
backup_dir="$REMOTE_DIR/.workspace.backups"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$backup_dir/workspace-postgresql-$stamp.dump"
pg_dump --format=custom --no-owner --no-privileges --file="$backup" "${WORKSPACE_BACKUP_DATABASE_URL:-$DIRECT_URL}"
pg_restore --list "$backup" >/dev/null
sha256sum "$backup" > "$backup.sha256"
docker run --rm --network host --env-file "$REMOTE_CONTROL_ENV_FILE" --entrypoint node \
  -v "$REMOTE_DIR/.workspace:$REMOTE_DIR/.workspace" "$IMAGE" \
  node_modules/prisma/build/index.js migrate deploy --schema=./prisma
candidate="workspace-candidate-${SOURCE_SHA:0:12}"
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d --name "$candidate" --network host --env-file "$REMOTE_RUNTIME_ENV_FILE" \
  -e PORT=3101 -e HOSTNAME=127.0.0.1 -e RELEASE_IMAGE_DIGEST="$IMAGE_DIGEST" \
  -v "$REMOTE_DIR/.workspace:$REMOTE_DIR/.workspace" "$IMAGE" >/dev/null
candidate_ok=0
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3101/workspace/api/internal/health >/dev/null 2>&1 && candidate_ok=1 && break
  sleep 1
done
[ "$candidate_ok" = 1 ] || { docker logs "$candidate" --tail 100 >&2; exit 1; }
previous_container=""
legacy_pm2_running=0
if docker inspect workspace >/dev/null 2>&1; then
  previous_container="workspace-rollback-$stamp"
  docker stop workspace >/dev/null
  docker rename workspace "$previous_container"
elif command -v pm2 >/dev/null 2>&1 && [ "$(pm2 pid "$LEGACY_PM2_NAME" 2>/dev/null || true)" != 0 ]; then
  pm2 stop "$LEGACY_PM2_NAME" >/dev/null
  legacy_pm2_running=1
fi
docker rm -f "$candidate" >/dev/null
rollback() {
  docker rm -f workspace >/dev/null 2>&1 || true
  if [ -n "$previous_container" ]; then docker rename "$previous_container" workspace; docker start workspace >/dev/null; fi
  if [ "$legacy_pm2_running" = 1 ]; then pm2 restart "$LEGACY_PM2_NAME" >/dev/null 2>&1 || true; fi
}
trap rollback ERR
docker run -d --name workspace --restart unless-stopped --network host --env-file "$REMOTE_RUNTIME_ENV_FILE" \
  -e PORT=3000 -e HOSTNAME=0.0.0.0 -e RELEASE_IMAGE_DIGEST="$IMAGE_DIGEST" \
  -v "$REMOTE_DIR/.workspace:$REMOTE_DIR/.workspace" "$IMAGE" >/dev/null
for _ in $(seq 1 30); do curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1 && break; sleep 1; done
version="$(curl -fsS http://127.0.0.1:3000/workspace/api/settings/version)"
VERSION_RESPONSE="$version" EXPECTED_DIGEST="$IMAGE_DIGEST" python3 - <<'PY'
import json, os
value=json.loads(os.environ['VERSION_RESPONSE'])
if value.get('imageDigest') != os.environ['EXPECTED_DIGEST']:
    raise SystemExit('online image digest mismatch')
PY
trap - ERR
receipt="$REMOTE_DIR/.workspace/deployed-image.json"
previous_digest=""
[ -f "$receipt" ] && previous_digest="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("current",{}).get("imageDigest",""))' "$receipt")"
python3 - "$receipt" "$SOURCE_SHA" "$SOURCE_TREE" "$IMAGE" "$IMAGE_DIGEST" "$previous_digest" <<'PY'
import datetime, json, os, sys
path, sha, tree, image, digest, previous = sys.argv[1:]
value={"schemaVersion":1,"kind":"workspace-deployed-image","current":{"sourceSha":sha,"sourceTree":tree,"image":image,"imageDigest":digest},"previous":{"imageDigest":previous or None},"deployedAt":datetime.datetime.now(datetime.timezone.utc).isoformat()}
tmp=path+'.tmp'; open(tmp,'w').write(json.dumps(value,indent=2)+'\n'); os.replace(tmp,path)
PY
docker --config "$REMOTE_DIR/.workspace/docker-auth" logout "${IMAGE%%/*}" >/dev/null 2>&1 || true
rm -rf "$REMOTE_DIR/.workspace/docker-auth"
echo "production image deployed: $IMAGE_DIGEST"
REMOTE
