#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$SCRIPT_DIR/.env}"
# shellcheck source=/dev/null
source "$OPS_ENV_FILE" || exit 1

usage() {
  echo "usage: ops/publish.sh data apply --id RELEASE_ID --source-sha FULL_GIT_SHA" >&2
}

COMMAND="${1:-}"
[ -n "$COMMAND" ] && shift
RELEASE_ID=""
SOURCE_SHA=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) shift; RELEASE_ID="${1:-}" ;;
    --source-sha) shift; SOURCE_SHA="${1:-}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[错误] 未知参数: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

[ "$COMMAND" = apply ] || { usage; exit 2; }
printf '%s' "$RELEASE_ID" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*-v[0-9]+$' \
  || { echo "[错误] --id 格式无效" >&2; exit 2; }
printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-f]{40}$' \
  || { echo "[错误] --source-sha 必须是完整 Git SHA" >&2; exit 2; }
: "${SERVER:?SERVER not set in $OPS_ENV_FILE}"
: "${REMOTE_DIR:?REMOTE_DIR not set in $OPS_ENV_FILE}"
REMOTE_WORKSPACE_CONFIG_DIR="${REMOTE_WORKSPACE_CONFIG_DIR:-$REMOTE_DIR/.workspace}"
[ "$REMOTE_WORKSPACE_CONFIG_DIR" = "$REMOTE_DIR/.workspace" ] \
  || { echo "[错误] REMOTE_WORKSPACE_CONFIG_DIR 必须是 $REMOTE_DIR/.workspace" >&2; exit 2; }

if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
  SSH_KEY="$KEY"
else
  echo "[错误] 数据 apply 只接受 KEY 文件，不把 KEY_CONTENT 展开到进程参数" >&2
  exit 1
fi
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
attempt_id="data-apply-$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_ID}"
log_root="$REPOSITORY_ROOT/.cache/data-release-attempts"
mkdir -p "$log_root"
chmod 700 "$log_root"
log_file="$log_root/$attempt_id.log"

ssh "${SSH_OPTIONS[@]}" "$SERVER" bash -s -- \
  "$REMOTE_DIR" "$REMOTE_WORKSPACE_CONFIG_DIR" "$RELEASE_ID" "$SOURCE_SHA" <<'REMOTE' 2>&1 | tee "$log_file"
set -o pipefail
remote_dir="$1"
config_dir="$2"
release_id="$3"
source_sha="$4"
runtime_user="ubuntu"
runtime_env="$config_dir/runtime.env"
upload_receipt="$config_dir/data-release-uploads/$release_id/current.json"
deployed_record="$config_dir/deployed-release.json"
errors=()
add_error() { errors+=("$1"); }

current_root="$(readlink -f "$remote_dir/current" 2>/dev/null || true)"
[ -n "$current_root" ] && [ -d "$current_root" ] || add_error "current release 不可解析"
[ -f "$upload_receipt" ] || add_error "数据 upload receipt 缺失"
[ -f "$deployed_record" ] || add_error "deployed-release.json 缺失"
[ -s "$runtime_env" ] || add_error "runtime.env 缺失"
[ "$(systemctl is-active workspace-runtime-pm2.service 2>/dev/null)" = active ] || add_error "生产 PM2 service 非 active"

payload_digest=""
if [ -f "$upload_receipt" ]; then
  payload_digest="$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(r.kind!=="workspace-data-release-upload"||r.releaseId!==process.argv[2]||!/^[0-9a-f]{64}$/.test(r.payloadDigest))process.exit(1); process.stdout.write(r.payloadDigest)' "$upload_receipt" "$release_id" 2>/dev/null || true)"
  [ -n "$payload_digest" ] || add_error "数据 upload receipt 无效"
fi
bundle_root="$config_dir/data-release-uploads/$release_id/$payload_digest"
if [ -n "$payload_digest" ] && [ -d "$bundle_root" ]; then
  node "$bundle_root/data-release-transfer.mjs" verify-staged --bundle-root "$bundle_root" --id "$release_id" --payload-digest "$payload_digest" >/dev/null 2>&1 \
    || add_error "固定 payload 逐文件 digest 复验失败"
  [ -z "$(find "$bundle_root" ! -user "$runtime_user" -print -quit 2>/dev/null)" ] || add_error "私有 bundle owner 不是 $runtime_user"
  [ -z "$(find "$bundle_root" -type d ! -perm 0700 -print -quit 2>/dev/null)" ] || add_error "私有 bundle 目录不是 0700"
  [ -z "$(find "$bundle_root" -type f ! -perm 0600 -print -quit 2>/dev/null)" ] || add_error "私有 bundle 文件不是 0600"
else
  add_error "固定 payload 目录缺失"
fi

if [ -n "$current_root" ]; then
  [ -f "$current_root/ops/apply-data-release.mjs" ] || add_error "当前 artifact 缺少 apply-data-release.mjs"
  [ -f "$current_root/ops/data-release-handlers.mjs" ] || add_error "当前 artifact 缺少 handler registry"
fi
if [ -f "$deployed_record" ]; then
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(r?.source?.commitSha!==process.argv[2])process.exit(1)' "$deployed_record" "$source_sha" 2>/dev/null \
    || add_error "source SHA 与当前生产候选不一致"
fi

baseline_health="$(curl --max-time 15 -fsS http://127.0.0.1:3000/workspace/api/internal/health 2>/dev/null || true)"
baseline_version="$(curl --max-time 15 -fsS http://127.0.0.1:3000/workspace/api/settings/version 2>/dev/null || true)"
expected_content="$(HEALTH="$baseline_health" VERSION="$baseline_version" node -e 'const h=JSON.parse(process.env.HEALTH||"null"),v=JSON.parse(process.env.VERSION||"null"); if(h?.status!=="ok"||h?.unitId!=="workspace-monolith"||v?.unitId!=="workspace-monolith"||h.version!==v.version)process.exit(1); process.stdout.write(v.version)' 2>/dev/null || true)"
[ -n "$expected_content" ] || add_error "生产 health/version 基线无效"

contract_unit="workspace-data-release-contract-$(date +%s)-$$"
sudo -n systemd-run --quiet --wait --pipe --collect --unit="$contract_unit" \
  --property=Type=oneshot --property=User="$runtime_user" --property=Group="$runtime_user" \
  --property=WorkingDirectory="$current_root" --property=EnvironmentFile="$runtime_env" \
  /usr/bin/node -e 'const os=require("os");if(os.userInfo().username!==process.argv[1]||!/^postgres(ql)?:\/\//.test(process.env.DIRECT_URL||process.env.DATABASE_URL||""))process.exit(1)' "$runtime_user" >/dev/null 2>&1 \
  || add_error "OS owner/runtime.env/DATABASE_URL 执行契约无效"
database_unit="workspace-data-release-database-$(date +%s)-$$"
sudo -n systemd-run --quiet --wait --pipe --collect --unit="$database_unit" \
  --property=Type=oneshot --property=User="$runtime_user" --property=Group="$runtime_user" \
  --property=EnvironmentFile="$runtime_env" \
  /bin/bash -c 'exec /usr/bin/psql --no-psqlrc --dbname="${DIRECT_URL:-$DATABASE_URL}" -Atqc "SELECT 1"' >/dev/null 2>&1 \
  || add_error "生产数据库只读连接失败"

if [ "${#errors[@]}" -gt 0 ]; then
  echo "[错误] 数据 apply 前置检查发现 ${#errors[@]} 项：" >&2
  printf ' - %s\n' "${errors[@]}" >&2
  exit 1
fi

backup_root="$remote_dir/.workspace.backups"
backup_file="$backup_root/data-release-${release_id}-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$backup_root" && chmod 700 "$backup_root" || exit 1
backup_unit="workspace-data-release-backup-$(date +%s)-$$"
sudo -n systemd-run --quiet --wait --pipe --collect --unit="$backup_unit" \
  --property=Type=oneshot --property=User="$runtime_user" --property=Group="$runtime_user" \
  --property=EnvironmentFile="$runtime_env" --setenv="BACKUP_FILE=$backup_file" \
  /bin/bash -c 'umask 077; exec /usr/bin/pg_dump --dbname="${DIRECT_URL:-$DATABASE_URL}" --format=custom --file="$BACKUP_FILE"' \
  || { echo "[错误] apply 前数据库备份失败；未执行数据写入" >&2; exit 1; }
test -s "$backup_file" && pg_restore --list "$backup_file" >/dev/null 2>&1 \
  || { echo "[错误] apply 前数据库备份不可恢复；未执行数据写入" >&2; exit 1; }
echo "==> PRE-APPLY BACKUP: $backup_file sha256=$(sha256sum "$backup_file" | cut -d' ' -f1)"

apply_unit="workspace-data-release-apply-$(date +%s)-$$"
sudo -n systemd-run --quiet --wait --pipe --collect --unit="$apply_unit" \
  --property=Type=oneshot --property=User="$runtime_user" --property=Group="$runtime_user" \
  --property=WorkingDirectory="$current_root" --property=EnvironmentFile="$runtime_env" \
  --setenv="WORKSPACE_DATA_RELEASE_SOURCE_SHA=$source_sha" \
  /usr/bin/node "$current_root/ops/apply-data-release.mjs" apply --target production \
    --id "$release_id" --payload-digest "$payload_digest" --bundle-root "$bundle_root" --repository-root "$current_root" \
  || { echo "[错误] 数据 apply 失败；保留备份和 handler 回执供幂等重放" >&2; exit 1; }

reconciler="$config_dir/runtime/deploy-tools/reconcile-runtime-config-permissions.sh"
[ -f "$reconciler" ] && sudo -n /bin/bash "$reconciler" "$config_dir" workspace-runtime \
  || { echo "[错误] runtime ACL reconciler 失败" >&2; exit 1; }
health="$(curl --max-time 15 -fsS http://127.0.0.1:3000/workspace/api/internal/health)" || exit 1
version="$(curl --max-time 15 -fsS http://127.0.0.1:3000/workspace/api/settings/version)" || exit 1
HEALTH="$health" VERSION="$version" EXPECTED="$expected_content" node -e 'const h=JSON.parse(process.env.HEALTH),v=JSON.parse(process.env.VERSION);if(h.status!=="ok"||h.unitId!=="workspace-monolith"||v.unitId!=="workspace-monolith"||h.version!==process.env.EXPECTED||v.version!==process.env.EXPECTED)process.exit(1)' \
  || { echo "[错误] 数据 apply 后生产 health/version/content 不满足不变量" >&2; exit 1; }
echo "==> DATA RELEASE APPLIED: $release_id payload=$payload_digest content=$expected_content"
REMOTE
status="${PIPESTATUS[0]}"
chmod 600 "$log_file"
echo "==> 数据 apply 日志: $log_file"
exit "$status"
