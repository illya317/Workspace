#!/usr/bin/env bash
set -euo pipefail

: "${SERVER:?SERVER is required}"
: "${REMOTE_DIR:?REMOTE_DIR is required}"
if [ -n "${KEY:-}" ]; then
  ssh_key="$KEY"
elif [ -n "${KEY_CONTENT:-}" ]; then
  ssh_key="$(mktemp)"
  printf '%s\n' "$KEY_CONTENT" > "$ssh_key"
  chmod 600 "$ssh_key"
  trap 'rm -f "$ssh_key"' EXIT
else
  echo "[错误] 缺少 KEY/KEY_CONTENT" >&2
  exit 1
fi
ssh_options=(-i "$ssh_key" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
receipt="$(ssh "${ssh_options[@]}" "$SERVER" "cat '$REMOTE_DIR/.workspace/deployed-image.json'")"
previous_digest="$(RECEIPT="$receipt" python3 -c 'import json,os; print(json.loads(os.environ["RECEIPT"])["previous"]["imageDigest"] or "")')"
[[ "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "[错误] 没有上一已知正常 digest" >&2; exit 1; }
manifest_local="$(mktemp)"
trap 'rm -f "$manifest_local"; [ -n "${KEY_CONTENT:-}" ] && rm -f "$ssh_key"' EXIT
ssh "${ssh_options[@]}" "$SERVER" "cat '$REMOTE_DIR/.workspace/image-releases/${previous_digest#sha256:}.json'" > "$manifest_local"
values="$(python3 - "$manifest_local" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]))
print(v['source']['commitSha']); print(v['source']['treeSha']); print(v['image']['ref'])
PY
)"
SOURCE_SHA="$(printf '%s\n' "$values" | sed -n '1p')"
SOURCE_TREE="$(printf '%s\n' "$values" | sed -n '2p')"
APPROVED_IMAGE_REF="$(printf '%s\n' "$values" | sed -n '3p')"
default_rollback_ref="${CNB_DOCKER_REGISTRY:-}/${CNB_REPO_SLUG_LOWERCASE:-}"
if [ "$default_rollback_ref" = / ]; then
  default_rollback_ref=""
else
  default_rollback_ref="${default_rollback_ref}:sha-${SOURCE_SHA}"
fi
DEPLOY_IMAGE_REF="${ROLLBACK_IMAGE_REF:-${default_rollback_ref:-$APPROVED_IMAGE_REF}}"
export SOURCE_SHA SOURCE_TREE APPROVED_IMAGE_REF DEPLOY_IMAGE_REF
export IMAGE_DIGEST="$previous_digest"
export RELEASE_MANIFEST_FILE="$manifest_local"
docker pull "${DEPLOY_IMAGE_REF}@${IMAGE_DIGEST}"
exec bash "$(dirname "$0")/deploy-image.sh" production
