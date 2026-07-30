#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-}"
[ -z "$COMMAND" ] || shift
CONFIG_ROOT="/home/ubuntu/workspace/.workspace"
REMOTE_ROOT="/home/ubuntu/workspace"
RUNTIME_ENV_INPUT=""
CONTROL_ENV_INPUT=""
FINANCE_BOT_HOOK=""
EXPECTED_VERSION=""
EXECUTE=0
POSTGRES_MAJOR="16"
backup_dir=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-root) shift; CONFIG_ROOT="${1:-}" ;;
    --remote-root) shift; REMOTE_ROOT="${1:-}" ;;
    --runtime-env) shift; RUNTIME_ENV_INPUT="${1:-}" ;;
    --control-env) shift; CONTROL_ENV_INPUT="${1:-}" ;;
    --finance-bot-hook) shift; FINANCE_BOT_HOOK="${1:-}" ;;
    --expected-version) shift; EXPECTED_VERSION="${1:-}" ;;
    --postgres-major) shift; POSTGRES_MAJOR="${1:-}" ;;
    --execute) EXECUTE=1 ;;
    *) echo "[错误] 未知参数: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$COMMAND" in prepare|apply|verify|rollback|status) ;;
  *) echo "用法: $0 prepare|apply|verify|rollback|status [--runtime-env FILE --control-env FILE --finance-bot-hook FILE --expected-version SHA] [--execute]" >&2; exit 2 ;;
esac
case "$CONFIG_ROOT:$REMOTE_ROOT" in /*:/*) ;; *) echo "[错误] runtime 路径必须是绝对路径" >&2; exit 2 ;; esac
STATE_ROOT="$CONFIG_ROOT/postgresql-security"
RECEIPT_FILE="$STATE_ROOT/receipt.json"
BACKUP_ROOT="$STATE_ROOT/backups"
RUNTIME_ENV_TARGET="$CONFIG_ROOT/runtime.env"
CONTROL_ENV_TARGET="$CONFIG_ROOT/control-plane.env"
FINANCE_ENV_TARGET="/etc/workspace/finance-bot.env"
HEALTH_URL="http://127.0.0.1:3000/workspace/api/internal/health"
VERSION_URL="http://127.0.0.1:3000/workspace/api/settings/version"
HBA_FILE="/etc/postgresql/$POSTGRES_MAJOR/main/pg_hba.conf"
RUNTIME_RUNNER="/usr/local/sbin/workspace-runtime-pm2"
LEGACY_RUNNER="/usr/local/sbin/workspace-legacy-pm2"
RUNTIME_SERVICE="/etc/systemd/system/workspace-runtime-pm2.service"
RUNTIME_USER="workspace-runtime"

require_root() {
  [ "$(id -u)" -eq 0 ] || { echo "[错误] $COMMAND 必须由 root 执行" >&2; exit 77; }
}
require_commands() {
  local command
  for command in node psql pg_dump pg_restore pg_dumpall sha256sum getfacl setfacl systemctl runuser install pg_ctlcluster curl useradd getent mktemp readlink ln mv; do
    command -v "$command" >/dev/null || { echo "[错误] 缺少命令: $command" >&2; exit 1; }
  done
}
validate_expected_version() {
  [[ "$EXPECTED_VERSION" =~ ^[0-9a-f]{40}$ ]] || {
    echo "[错误] --expected-version 必须是版本端点返回的完整 40 位小写 SHA" >&2
    exit 2
  }
}
assert_secret_input() {
  local file=$1 label=$2 owner mode
  [ -f "$file" ] || { echo "[错误] $label 不存在" >&2; exit 1; }
  owner="$(stat -c %u "$file")"
  mode="$(stat -c %a "$file")"
  [ "$owner" = 0 ] || { echo "[错误] $label 必须由 root 持有" >&2; exit 1; }
  case "$mode" in 400|600) ;; *) echo "[错误] $label 必须是 root-only 0400/0600" >&2; exit 1 ;; esac
}
env_value() {
  ENV_FILE="$1" ENV_KEY="$2" node - <<'NODE'
const fs = require("node:fs");
const lines = fs.readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/);
const key = process.env.ENV_KEY;
const matches = lines.filter((entry) => new RegExp("^\\s*(?:export\\s+)?" + key + "\\s*=").test(entry));
if (matches.length !== 1) process.exit(3);
const line = matches[0];
let value = line.slice(line.indexOf("=") + 1).trim();
if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
if (value.includes("\n") || value.includes("\r")) process.exit(4);
process.stdout.write(value);
NODE
}
database_password() {
  DATABASE_URL_VALUE="$1" EXPECTED_USER="$2" REQUIRE_OWNER_ROLE="$3" node - <<'NODE'
const raw = process.env.DATABASE_URL_VALUE;
let url;
try { url = new URL(raw); } catch { process.exit(2); }
if (!["postgres:","postgresql:"].includes(url.protocol)
    || decodeURIComponent(url.username) !== process.env.EXPECTED_USER
    || decodeURIComponent(url.pathname) !== "/workspace"
    || !["127.0.0.1","localhost","::1","[::1]"].includes(url.hostname)
    || url.searchParams.get("sslmode") !== "verify-full"
    || url.searchParams.get("sslrootcert") !== "/etc/workspace/postgresql/ca.pem") process.exit(3);
if (process.env.REQUIRE_OWNER_ROLE === "1" && !/(?:^|\s)-c\s*role=workspace_owner(?:\s|$)/.test(url.searchParams.get("options") || "")) process.exit(4);
if (process.env.REQUIRE_OWNER_ROLE === "0" && /(?:^|\s)-c\s*role=/i.test(url.searchParams.get("options") || "")) process.exit(4);
const password = decodeURIComponent(url.password);
if (!password || /[\u0000-\u001f\u007f]/.test(password)) process.exit(5);
process.stdout.write(password);
NODE
}
load_and_validate_urls() {
  local runtime_url direct_url backup_url monitor_url
  runtime_url="$(env_value "$RUNTIME_ENV_INPUT" DATABASE_URL)" || { echo "[错误] runtime env 缺少 DATABASE_URL" >&2; exit 1; }
  if grep -Eq '^[[:space:]]*(export[[:space:]]+)?(DIRECT_URL|SHADOW_DATABASE_URL|WORKSPACE_BACKUP_DATABASE_URL|WORKSPACE_MONITOR_DATABASE_URL|PGPASSWORD|PGPASSFILE|PGSERVICE|PGSERVICEFILE|PGOPTIONS|PGUSER|PGHOST|PGDATABASE)=' "$RUNTIME_ENV_INPUT"; then
    echo "[错误] runtime env 禁止 control-plane URL 或替代 PostgreSQL 身份变量" >&2; exit 1
  fi
  direct_url="$(env_value "$CONTROL_ENV_INPUT" DIRECT_URL)" || { echo "[错误] control env 缺少 DIRECT_URL" >&2; exit 1; }
  backup_url="$(env_value "$CONTROL_ENV_INPUT" WORKSPACE_BACKUP_DATABASE_URL)" || { echo "[错误] control env 缺少 WORKSPACE_BACKUP_DATABASE_URL" >&2; exit 1; }
  monitor_url="$(env_value "$CONTROL_ENV_INPUT" WORKSPACE_MONITOR_DATABASE_URL)" || { echo "[错误] control env 缺少 WORKSPACE_MONITOR_DATABASE_URL" >&2; exit 1; }
  WORKSPACE_RUNTIME_DATABASE_PASSWORD="$(database_password "$runtime_url" workspace_runtime 0)" || { echo "[错误] runtime DATABASE_URL 契约无效" >&2; exit 1; }
  WORKSPACE_MIGRATOR_DATABASE_PASSWORD="$(database_password "$direct_url" workspace_migrator 1)" || { echo "[错误] DIRECT_URL 必须使用 workspace_migrator、TLS 并 SET ROLE workspace_owner" >&2; exit 1; }
  WORKSPACE_BACKUP_DATABASE_PASSWORD="$(database_password "$backup_url" workspace_backup 0)" || { echo "[错误] backup URL 契约无效" >&2; exit 1; }
  WORKSPACE_MONITOR_DATABASE_PASSWORD="$(database_password "$monitor_url" workspace_monitor 0)" || { echo "[错误] monitor URL 契约无效" >&2; exit 1; }
  export WORKSPACE_RUNTIME_DATABASE_PASSWORD WORKSPACE_MIGRATOR_DATABASE_PASSWORD
  export WORKSPACE_BACKUP_DATABASE_PASSWORD WORKSPACE_MONITOR_DATABASE_PASSWORD
  MONITOR_URL="$monitor_url"
}
verify_workspace_http() {
  local attempts="${1:-1}" health_payload version_payload attempt
  for ((attempt=1; attempt<=attempts; attempt+=1)); do
    if health_payload="$(curl --fail-with-body --silent --show-error --max-time 5 "$HEALTH_URL" 2>/dev/null)" \
      && version_payload="$(curl --fail-with-body --silent --show-error --max-time 5 "$VERSION_URL" 2>/dev/null)" \
      && HEALTH_PAYLOAD="$health_payload" VERSION_PAYLOAD="$version_payload" EXPECTED_VERSION="$EXPECTED_VERSION" node - <<'NODE'
const health = JSON.parse(process.env.HEALTH_PAYLOAD);
const version = JSON.parse(process.env.VERSION_PAYLOAD);
if (health.status !== "ok" || health.unitId !== "workspace-monolith") process.exit(1);
if (version.unitId !== "workspace-monolith" || version.version !== process.env.EXPECTED_VERSION) process.exit(2);
NODE
    then
      return 0
    fi
    [ "$attempt" -eq "$attempts" ] || sleep 1
  done
  echo "[错误] 本机 /workspace health/version 未通过，expected=$EXPECTED_VERSION" >&2
  return 1
}
receipt_status() {
  [ -f "$RECEIPT_FILE" ] || { printf 'missing'; return; }
  RECEIPT_FILE="$RECEIPT_FILE" node -e 'const r=require(process.env.RECEIPT_FILE);process.stdout.write(String(r.status||"invalid"))'
}
write_receipt() {
  local status=$1 backup_dir=$2 runtime_sha control_sha hba_sha plan_sha links_sha tooling_sha finance_hook_sha
  runtime_sha="$(sha256sum "$RUNTIME_ENV_INPUT" | awk '{print $1}')"
  control_sha="$(sha256sum "$CONTROL_ENV_INPUT" | awk '{print $1}')"
  hba_sha="$(sha256sum "$backup_dir/pg_hba.final" | awk '{print $1}')"
  plan_sha="$(sha256sum "$backup_dir/pm2-plan.json" | awk '{print $1}')"
  links_sha="$(sha256sum "$backup_dir/runtime-env-links.before" | awk '{print $1}')"
  tooling_sha="$(sha256sum "$backup_dir/tooling.sha256" | awk '{print $1}')"
  finance_hook_sha=""
  [ -z "$FINANCE_BOT_HOOK" ] || finance_hook_sha="$(sha256sum "$FINANCE_BOT_HOOK" | awk '{print $1}')"
  mkdir -p "$STATE_ROOT"
  STATUS="$status" RECEIPT_FILE="$RECEIPT_FILE" BACKUP_DIR="$backup_dir" \
    RUNTIME_INPUT="$RUNTIME_ENV_INPUT" CONTROL_INPUT="$CONTROL_ENV_INPUT" \
    RUNTIME_SHA="$runtime_sha" CONTROL_SHA="$control_sha" HBA_SHA="$hba_sha" PLAN_SHA="$plan_sha" LINKS_SHA="$links_sha" \
    TOOLING_SHA="$tooling_sha" FINANCE_HOOK="$FINANCE_BOT_HOOK" FINANCE_HOOK_SHA="$finance_hook_sha" \
    EXPECTED_VERSION="$EXPECTED_VERSION" node - <<'NODE'
const fs=require("node:fs");
const value={schemaVersion:1,kind:"workspace-production-postgresql-security",status:process.env.STATUS,
  updatedAt:new Date().toISOString(),backupDir:process.env.BACKUP_DIR,
  inputs:{runtimeEnv:{path:process.env.RUNTIME_INPUT,sha256:process.env.RUNTIME_SHA},
    controlEnv:{path:process.env.CONTROL_INPUT,sha256:process.env.CONTROL_SHA},
    expectedVersion:process.env.EXPECTED_VERSION,
    financeHook:{path:process.env.FINANCE_HOOK,sha256:process.env.FINANCE_HOOK_SHA},
    hbaSha256:process.env.HBA_SHA,pm2PlanSha256:process.env.PLAN_SHA,
    runtimeEnvLinksSha256:process.env.LINKS_SHA,toolingSha256:process.env.TOOLING_SHA}};
const tmp=process.env.RECEIPT_FILE+".tmp-"+process.pid;
fs.writeFileSync(tmp,JSON.stringify(value,null,2)+"\n",{mode:0o600});fs.renameSync(tmp,process.env.RECEIPT_FILE);
NODE
}
assert_receipt() {
  local expected=$1
  RECEIPT_FILE="$RECEIPT_FILE" EXPECTED="$expected" node - <<'NODE'
const fs=require("node:fs"); const crypto=require("node:crypto"); const r=JSON.parse(fs.readFileSync(process.env.RECEIPT_FILE,"utf8"));
if(r.schemaVersion!==1||r.kind!=="workspace-production-postgresql-security"||r.status!==process.env.EXPECTED)process.exit(1);
const hash=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for(const key of ["runtimeEnv","controlEnv"]){if(hash(r.inputs[key].path)!==r.inputs[key].sha256)process.exit(2);}
if(hash(r.backupDir+"/pg_hba.final")!==r.inputs.hbaSha256)process.exit(3);
if(hash(r.backupDir+"/pm2-plan.json")!==r.inputs.pm2PlanSha256)process.exit(4);
if(hash(r.backupDir+"/runtime-env-links.before")!==r.inputs.runtimeEnvLinksSha256)process.exit(5);
if(hash(r.backupDir+"/tooling.sha256")!==r.inputs.toolingSha256)process.exit(6);
if(r.inputs.financeHook.path && hash(r.inputs.financeHook.path)!==r.inputs.financeHook.sha256)process.exit(7);
process.stdout.write(r.backupDir);
NODE
}
finance_bot_contract() {
  local phase=$1
  if ! systemctl cat finance-bot.service >/dev/null 2>&1; then return; fi
  [ -n "$FINANCE_BOT_HOOK" ] && [ -x "$FINANCE_BOT_HOOK" ] || {
    echo "[错误] finance-bot.service 存在；必须提供可执行 --finance-bot-hook，禁止继续读取共享 .workspace/.env" >&2
    exit 1
  }
  WORKSPACE_PG_SECURITY_BACKUP_DIR="$backup_dir" WORKSPACE_CONFIG_ROOT="$CONFIG_ROOT" \
    "$FINANCE_BOT_HOOK" "$phase" "$FINANCE_ENV_TARGET"
  if [ "$phase" = verify ]; then
    [ "$(systemctl show finance-bot.service -p User --value)" = "ubuntu" ] || { echo "[错误] finance-bot 必须保留受信控制面用户 ubuntu" >&2; exit 1; }
    systemctl cat finance-bot.service | grep -F "$FINANCE_ENV_TARGET" >/dev/null || { echo "[错误] finance-bot 未绑定专用 EnvironmentFile" >&2; exit 1; }
    if systemctl cat finance-bot.service | grep -F "$CONFIG_ROOT/.env" >/dev/null; then echo "[错误] finance-bot 仍读取共享 .env" >&2; exit 1; fi
    systemctl is-active --quiet finance-bot.service || { echo "[错误] finance-bot 未运行" >&2; exit 1; }
  fi
}
managed_process_names() {
  PLAN_FILE="$1" node -e 'for(const p of require(process.env.PLAN_FILE).processes)console.log(p.name)'
}
runtime_env_link_paths() {
  PLAN_FILE="$1" REMOTE_ROOT="$REMOTE_ROOT" node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));
const workspace = Array.isArray(plan.processes) ? plan.processes.filter((entry) => entry?.name === "workspace") : [];
if (plan.kind !== "workspace-production-pm2-migration" || workspace.length !== 1) process.exit(1);
const links = [
  path.join(process.env.REMOTE_ROOT, "current", ".env"),
  path.join(workspace[0].cwd, ".env"),
];
if (new Set(links).size !== 2 || links.some((entry) => !path.isAbsolute(entry) || /[\u0000-\u001f\u007f]/.test(entry))) process.exit(2);
process.stdout.write(links.join("\n") + "\n");
NODE
}
snapshot_runtime_env_links() {
  local plan=$1 output=$2 link raw_target resolved expected count=0
  expected="$(readlink -f -- "$CONFIG_ROOT/.env")" || { echo "[错误] 共享 .env 不存在" >&2; return 1; }
  install -m 0600 /dev/null "$output"
  while IFS= read -r link; do
    [ -L "$link" ] || { echo "[错误] runtime .env 不是符号链接: $link" >&2; return 1; }
    raw_target="$(readlink -- "$link")" || return 1
    case "$link$raw_target" in *$'\t'*|*$'\r'*|*$'\n'*) echo "[错误] runtime .env 链接含控制字符" >&2; return 1 ;; esac
    resolved="$(readlink -f -- "$link")" || return 1
    [ "$resolved" = "$expected" ] || {
      echo "[错误] runtime .env 未指向共享 $CONFIG_ROOT/.env: $link" >&2
      return 1
    }
    printf '%s\t%s\n' "$link" "$raw_target" >> "$output"
    count=$((count + 1))
  done < <(runtime_env_link_paths "$plan")
  [ "$count" -eq 2 ] || { echo "[错误] 必须快照恰好两个 runtime .env 链接" >&2; return 1; }
}
assert_runtime_env_links_unchanged() {
  local snapshot=$1 link old_target extra count=0
  while IFS=$'\t' read -r link old_target extra; do
    [ -n "$link" ] && [ -n "$old_target" ] && [ -z "$extra" ] || {
      echo "[错误] runtime .env 链接快照格式无效" >&2; return 1;
    }
    [ -L "$link" ] && [ "$(readlink -- "$link")" = "$old_target" ] || {
      echo "[错误] runtime .env 链接自 prepare 后已变化: $link" >&2
      return 1
    }
    count=$((count + 1))
  done < "$snapshot"
  [ "$count" -eq 2 ] || { echo "[错误] runtime .env 链接快照数量无效" >&2; return 1; }
}
replace_runtime_env_link() {
  local link=$1 target=$2 temporary="$1.postgresql-security.$$"
  rm -f -- "$temporary"
  if ! ln -s -- "$target" "$temporary"; then return 1; fi
  if ! mv -Tf -- "$temporary" "$link"; then
    rm -f -- "$temporary"
    return 1
  fi
}
verify_runtime_env_links() {
  local snapshot=$1 link old_target extra expected resolved count=0
  expected="$(readlink -f -- "$RUNTIME_ENV_TARGET")" || { echo "[错误] runtime env 不存在" >&2; return 1; }
  while IFS=$'\t' read -r link old_target extra; do
    [ -n "$link" ] && [ -n "$old_target" ] && [ -z "$extra" ] || {
      echo "[错误] runtime .env 链接快照格式无效" >&2; return 1;
    }
    [ -L "$link" ] || { echo "[错误] runtime .env 不再是符号链接: $link" >&2; return 1; }
    resolved="$(readlink -f -- "$link")" || return 1
    [ "$resolved" = "$expected" ] || { echo "[错误] runtime .env 未指向专用 runtime env: $link" >&2; return 1; }
    count=$((count + 1))
  done < "$snapshot"
  [ "$count" -eq 2 ] || { echo "[错误] runtime .env 链接快照数量无效" >&2; return 1; }
}
switch_runtime_env_links() {
  local snapshot=$1 link old_target extra
  assert_runtime_env_links_unchanged "$snapshot"
  while IFS=$'\t' read -r link old_target extra; do
    replace_runtime_env_link "$link" "$RUNTIME_ENV_TARGET"
  done < "$snapshot"
  verify_runtime_env_links "$snapshot"
}
restore_runtime_env_links() {
  local snapshot=$1 link old_target extra
  while IFS=$'\t' read -r link old_target extra; do
    replace_runtime_env_link "$link" "$old_target"
  done < "$snapshot"
  assert_runtime_env_links_unchanged "$snapshot"
}
legacy_pm2() {
  runuser -u ubuntu -- env HOME=/home/ubuntu PM2_HOME=/home/ubuntu/.pm2 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/pm2 "$@"
}
verify_legacy_pm2_empty() {
  legacy_pm2 jlist | node -e '
let input="";
process.stdin.on("data",chunk=>input+=chunk).on("end",()=>{
  const names=JSON.parse(input).map(entry=>String(entry?.name||"")).filter(name=>name.startsWith("workspace"));
  if(names.length){console.error("[错误] legacy PM2 仍有 Workspace 进程: "+names.sort().join(", "));process.exit(1);}
});'
}
runtime_rw_targets() {
  local relative target
  for relative in library data/docs-editor/templates data/qc-batches.json \
    data/qc-template-feedback.json data/qc.json assets/agent/avatar assets/user/avatar \
    template/hr/position-description-view-templates.json cache/production/qc tmp \
    agent/sessions agent/wecom-bot-state.json runtime/kimi-agent/work runtime/kimi-agent/turns runtime/kimi-agent/home; do
    target="$CONFIG_ROOT/$relative"
    [ ! -e "$target" ] || printf '%s\n' "$target"
  done
}
runtime_ro_targets() {
  local relative target
  for relative in config/pharma-qc config/tenant config/hr data/reference runtime/kimi-agent runtime/kimi-agent-bootstrap; do
    target="$CONFIG_ROOT/$relative"
    [ ! -e "$target" ] || printf '%s\n' "$target"
  done
}
runtime_traverse_only_targets() {
  local target="$CONFIG_ROOT/data"
  [ ! -e "$target" ] || printf '%s\n' "$target"
}
protected_data_directories() {
  local target="$CONFIG_ROOT/data/backups"
  [ ! -e "$target" ] || printf '%s\n' "$target"
}
protected_data_files() {
  [ ! -d "$CONFIG_ROOT/data" ] || find "$CONFIG_ROOT/data" -maxdepth 1 -type f \
    \( -name '*.db' -o -name '*.db.*' -o -name '*.sqlite' -o -name '*.sqlite.*' -o -name '*.bak' -o -name '*.backup*' \) -print
}
backup_runtime_acls() {
  local output=$1 target
  getfacl -p "$CONFIG_ROOT" > "$output"
  while IFS= read -r target; do getfacl -p "$target" >> "$output"; done < <(runtime_traverse_only_targets)
  while IFS= read -r target; do getfacl -Rp "$target" >> "$output"; done < <(runtime_ro_targets)
  while IFS= read -r target; do getfacl -Rp "$target" >> "$output"; done < <(runtime_rw_targets)
  while IFS= read -r target; do getfacl -Rp "$target" >> "$output"; done < <(protected_data_directories)
  while IFS= read -r target; do getfacl -p "$target" >> "$output"; done < <(protected_data_files)
}
backup_optional_file() {
  local source=$1 label=$2 destination=$3
  if [ -e "$source" ] && [ ! -f "$source" ]; then
    echo "[错误] 备份目标不是普通文件: $source" >&2
    exit 1
  fi
  if [ -f "$source" ]; then
    install -m 0600 "$source" "$destination/$label"
    install -m 0600 /dev/null "$destination/$label.present"
  fi
}
restore_optional_file() {
  local destination=$1 label=$2 source=$3 owner=$4 group=$5 mode=$6
  if [ -f "$destination/$label.present" ]; then
    install -o "$owner" -g "$group" -m "$mode" "$destination/$label" "$source"
  else
    rm -f "$source"
  fi
}
install_runtime_permissions() {
  id "$RUNTIME_USER" >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/workspace-runtime --create-home --shell /usr/sbin/nologin "$RUNTIME_USER"
  getent group "$RUNTIME_USER" >/dev/null || { echo "[错误] runtime 用户缺少同名 primary group" >&2; exit 1; }
  install -d -o "$RUNTIME_USER" -g "$RUNTIME_USER" -m 0700 /var/lib/workspace-runtime /var/lib/workspace-runtime/.pm2
  runuser -u "$RUNTIME_USER" -- test -x /home/ubuntu
  runuser -u "$RUNTIME_USER" -- test -x "$REMOTE_ROOT"
  setfacl -m "u:$RUNTIME_USER:--x" "$CONFIG_ROOT"
  local target
  while IFS= read -r target; do setfacl -m "u:$RUNTIME_USER:--x" "$target"; done < <(runtime_traverse_only_targets)
  while IFS= read -r target; do
    setfacl -Rm "u:$RUNTIME_USER:rX" "$target"
    [ ! -d "$target" ] || setfacl -Rdm "u:$RUNTIME_USER:rX" "$target"
  done < <(runtime_ro_targets)
  while IFS= read -r target; do
    setfacl -Rm "u:$RUNTIME_USER:rwX" "$target"
    [ ! -d "$target" ] || setfacl -Rdm "u:$RUNTIME_USER:rwX" "$target"
  done < <(runtime_rw_targets)
  while IFS= read -r target; do
    setfacl -x "u:$RUNTIME_USER" "$target" 2>/dev/null || true
    chmod 0600 "$target"
  done < <(protected_data_files)
  while IFS= read -r target; do
    setfacl -Rm "u:$RUNTIME_USER:---" "$target"
  done < <(protected_data_directories)
}
verify_runtime_permissions() {
  local target forbidden
  runuser -u "$RUNTIME_USER" -- test -r "$RUNTIME_ENV_TARGET"
  while IFS= read -r target; do
    runuser -u "$RUNTIME_USER" -- test -x "$target"
    if runuser -u "$RUNTIME_USER" -- test -r "$target"; then echo "[错误] runtime 用户可列举 traverse-only 路径: $target" >&2; exit 1; fi
  done < <(runtime_traverse_only_targets)
  while IFS= read -r target; do
    runuser -u "$RUNTIME_USER" -- test -r "$target"
    runuser -u "$RUNTIME_USER" -- test -w "$target"
    [ ! -d "$target" ] || runuser -u "$RUNTIME_USER" -- test -x "$target"
  done < <(runtime_rw_targets)
  while IFS= read -r target; do
    runuser -u "$RUNTIME_USER" -- test -r "$target"
    runuser -u "$RUNTIME_USER" -- test -x "$target"
  done < <(runtime_ro_targets)
  while IFS= read -r target; do
    if runuser -u "$RUNTIME_USER" -- test -r "$target"; then
      echo "[错误] runtime 用户可读取历史 SQLite/backup: $target" >&2
      exit 1
    fi
  done < <(protected_data_files)
  while IFS= read -r target; do
    if runuser -u "$RUNTIME_USER" -- test -r "$target" || runuser -u "$RUNTIME_USER" -- test -x "$target"; then
      echo "[错误] runtime 用户可访问历史 data/backups: $target" >&2
      exit 1
    fi
  done < <(protected_data_directories)
  target="$CONFIG_ROOT/cache/production/qc/.postgresql-security-probe.$$"
  runuser -u "$RUNTIME_USER" -- env PROBE_FILE="$target" /bin/sh -c 'umask 077; : > "$PROBE_FILE"; rm -f "$PROBE_FILE"'
  while IFS= read -r forbidden; do
    if runuser -u "$RUNTIME_USER" -- test -r "$forbidden"; then
      echo "[错误] runtime 用户可读取共享 env: $forbidden" >&2
      exit 1
    fi
  done < <(find "$CONFIG_ROOT" -maxdepth 1 -type f -name '.env*' -print)
  for forbidden in "$CONTROL_ENV_TARGET" "$FINANCE_ENV_TARGET" "$STATE_ROOT" "$CONFIG_ROOT/.deployment" \
    "$CONFIG_ROOT/deployment-history" "$CONFIG_ROOT/data-release-manifests" "$CONFIG_ROOT/data-release-sources" \
    "$CONFIG_ROOT/internal-unit-identities" "$REMOTE_ROOT/.workspace.backups"; do
    [ ! -e "$forbidden" ] || ! runuser -u "$RUNTIME_USER" -- test -r "$forbidden" || {
      echo "[错误] runtime 用户可读取控制面路径: $forbidden" >&2; exit 1;
    }
  done
}
install_hba() {
  local mode=$1 directory=$2 source previous hba_errors=""
  source="$directory/pg_hba.$mode"
  [ -f "$source" ] || { echo "[错误] 缺少 HBA candidate: $source" >&2; exit 1; }
  previous="$(mktemp /tmp/workspace-pg-hba.XXXXXX)"
  install -m 0600 "$HBA_FILE" "$previous"
  install -o postgres -g postgres -m 0640 "$source" "$HBA_FILE"
  if ! pg_ctlcluster "$POSTGRES_MAJOR" main reload \
    || ! hba_errors="$(runuser -u postgres -- psql -X -d postgres -Atc "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL")" \
    || [ "$hba_errors" != 0 ]; then
    install -o postgres -g postgres -m 0640 "$previous" "$HBA_FILE"
    pg_ctlcluster "$POSTGRES_MAJOR" main reload || true
    rm -f "$previous"
    echo "[错误] pg_hba.conf 解析失败，已恢复前一版本" >&2
    exit 1
  fi
  rm -f "$previous"
}
rehome_rollback_databases() {
  local database legacy_ownership
  while IFS= read -r database; do
    [ -n "$database" ] || continue
    [[ "$database" =~ ^workspace_rollback_[a-zA-Z0-9_]+$ ]] || { echo "[错误] rollback database 名称越界" >&2; exit 1; }
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d postgres -c "ALTER DATABASE \"$database\" WITH ALLOW_CONNECTIONS true" >/dev/null
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$database" -c "REASSIGN OWNED BY workspace_app TO workspace_rollback_owner" >/dev/null
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d postgres -c "ALTER DATABASE \"$database\" OWNER TO workspace_rollback_owner" >/dev/null
    legacy_ownership="$(runuser -u postgres -- psql -X -d postgres -Atc \
      "SELECT count(*) FROM pg_shdepend sd JOIN pg_database d ON d.oid=sd.dbid JOIN pg_roles r ON r.oid=sd.refobjid WHERE d.datname='$database' AND r.rolname='workspace_app' AND sd.deptype='o'")"
    [ "$legacy_ownership" = 0 ] || { echo "[错误] rollback database 仍有 workspace_app 对象: $database" >&2; exit 1; }
    runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d postgres -c \
      "REVOKE ALL ON DATABASE \"$database\" FROM PUBLIC,workspace_runtime,workspace_migrator,workspace_backup,workspace_monitor; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$database' AND pid<>pg_backend_pid(); ALTER DATABASE \"$database\" WITH ALLOW_CONNECTIONS false" >/dev/null
  done < <(runuser -u postgres -- psql -X -d postgres -Atc "SELECT datname FROM pg_database WHERE datname ~ '^workspace_rollback_[a-zA-Z0-9_]+$' ORDER BY datname")
}

if [ "$COMMAND" = status ]; then
  require_root
  printf '%s\n' "$(receipt_status)"
  exit 0
fi
require_root
require_commands

if [ "$COMMAND" = prepare ]; then
  [ "$EXECUTE" = 0 ] || { echo "[错误] prepare 不接受 --execute" >&2; exit 2; }
  [ -n "$RUNTIME_ENV_INPUT" ] && [ -n "$CONTROL_ENV_INPUT" ] && [ -n "$FINANCE_BOT_HOOK" ] || {
    echo "[错误] prepare 需要 --runtime-env、--control-env 与显式 --finance-bot-hook" >&2; exit 2;
  }
  case "$RUNTIME_ENV_INPUT:$CONTROL_ENV_INPUT:$FINANCE_BOT_HOOK" in /*:/*:/*) ;; *) echo "[错误] prepare 输入必须使用绝对路径" >&2; exit 2 ;; esac
  validate_expected_version
  assert_secret_input "$RUNTIME_ENV_INPUT" "runtime env input"
  assert_secret_input "$CONTROL_ENV_INPUT" "control env input"
  load_and_validate_urls
  verify_workspace_http 1
  [ "$(runuser -u postgres -- psql -X -d postgres -Atc 'SHOW ssl')" = on ] || { echo "[错误] PostgreSQL 未启用 TLS" >&2; exit 1; }
  case "$(receipt_status)" in missing|rolled-back) ;; *) echo "[错误] 已存在未完成的 PostgreSQL security receipt" >&2; exit 1 ;; esac
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  backup_dir="$BACKUP_ROOT/$stamp"
  install -d -m 0700 "$backup_dir"
  finance_bot_contract prepare
  install -m 0600 "$HBA_FILE" "$backup_dir/pg_hba.before"
  "$SCRIPT_DIR/production-hba.sh" transition > "$backup_dir/pg_hba.transition"
  "$SCRIPT_DIR/production-hba.sh" final > "$backup_dir/pg_hba.final"
  runuser -u postgres -- pg_dump --format=custom --no-owner --no-privileges workspace > "$backup_dir/workspace.dump"
  pg_restore --list "$backup_dir/workspace.dump" >/dev/null
  runuser -u postgres -- pg_dumpall --globals-only --no-role-passwords > "$backup_dir/globals.sql"
  legacy_pm2 jlist > "$backup_dir/pm2-before.json"
  node "$SCRIPT_DIR/production-pm2-plan.mjs" create --input "$backup_dir/pm2-before.json" --output "$backup_dir/pm2-plan.json" --remote-root "$REMOTE_ROOT"
  snapshot_runtime_env_links "$backup_dir/pm2-plan.json" "$backup_dir/runtime-env-links.before"
  backup_runtime_acls "$backup_dir/workspace-acl.before"
  backup_optional_file "$CONFIG_ROOT/.env" legacy.env.before "$backup_dir"
  backup_optional_file "$RUNTIME_ENV_TARGET" runtime.env.before "$backup_dir"
  backup_optional_file "$CONTROL_ENV_TARGET" control-plane.env.before "$backup_dir"
  backup_optional_file "$FINANCE_ENV_TARGET" finance-bot.env.before "$backup_dir"
  backup_optional_file "$RUNTIME_RUNNER" runtime-runner.before "$backup_dir"
  backup_optional_file "$LEGACY_RUNNER" legacy-runner.before "$backup_dir"
  backup_optional_file "$RUNTIME_SERVICE" runtime-service.before "$backup_dir"
  [ ! -f /home/ubuntu/.pm2/dump.pm2 ] || install -m 0600 /home/ubuntu/.pm2/dump.pm2 "$backup_dir/pm2-dump.before"
  systemctl is-enabled workspace-runtime-pm2.service > "$backup_dir/runtime-service-enabled.before" 2>/dev/null || printf 'not-found\n' > "$backup_dir/runtime-service-enabled.before"
  systemctl cat finance-bot.service > "$backup_dir/finance-bot.before" 2>/dev/null || true
  (cd "$SCRIPT_DIR" && sha256sum production-*) > "$backup_dir/tooling.sha256"
  write_receipt prepared "$backup_dir"
  echo "prepared: $RECEIPT_FILE"
  exit 0
fi

[ -f "$RECEIPT_FILE" ] || { echo "[错误] 缺少 prepare receipt" >&2; exit 1; }
case "$COMMAND" in
  apply) expected=prepared ;;
  verify) expected="$(receipt_status)"; case "$expected" in applied|verified) ;; *) echo "[错误] verify 需要 applied/verified receipt" >&2; exit 1 ;; esac ;;
  rollback) expected="$(receipt_status)"; case "$expected" in applying|applied|verified) ;; *) echo "[错误] rollback 需要 applying/applied/verified receipt" >&2; exit 1 ;; esac ;;
esac
backup_dir="$(assert_receipt "$expected")" || { echo "[错误] receipt 或输入 digest 不匹配" >&2; exit 1; }
(cd "$SCRIPT_DIR" && sha256sum --quiet --check "$backup_dir/tooling.sha256") || { echo "[错误] security tooling digest 不匹配" >&2; exit 1; }
RUNTIME_ENV_INPUT="$(RECEIPT_FILE="$RECEIPT_FILE" node -e 'process.stdout.write(require(process.env.RECEIPT_FILE).inputs.runtimeEnv.path)')"
CONTROL_ENV_INPUT="$(RECEIPT_FILE="$RECEIPT_FILE" node -e 'process.stdout.write(require(process.env.RECEIPT_FILE).inputs.controlEnv.path)')"
FINANCE_BOT_HOOK="$(RECEIPT_FILE="$RECEIPT_FILE" node -e 'process.stdout.write(require(process.env.RECEIPT_FILE).inputs.financeHook.path)')"
EXPECTED_VERSION="$(RECEIPT_FILE="$RECEIPT_FILE" node -e 'process.stdout.write(require(process.env.RECEIPT_FILE).inputs.expectedVersion)')"
validate_expected_version
load_and_validate_urls

if [ "$COMMAND" = apply ]; then
  [ "$EXECUTE" = 1 ] || { echo "[错误] apply 必须显式传 --execute" >&2; exit 2; }
  verify_workspace_http 1
  finance_bot_contract prepare
  write_receipt applying "$backup_dir"
  systemctl stop finance-bot.service 2>/dev/null || true
  install_hba transition "$backup_dir"
  while IFS= read -r name; do legacy_pm2 delete "$name" >/dev/null; done < <(managed_process_names "$backup_dir/pm2-plan.json")
  legacy_pm2 save >/dev/null
  verify_legacy_pm2_empty
  install_runtime_permissions
  install -o root -g "$RUNTIME_USER" -m 0640 "$RUNTIME_ENV_INPUT" "$RUNTIME_ENV_TARGET"
  switch_runtime_env_links "$backup_dir/runtime-env-links.before"
  install -o root -g root -m 0600 "$CONTROL_ENV_INPUT" "$CONTROL_ENV_TARGET"
  install -d -o root -g root -m 0755 /etc/workspace
  printf 'WORKSPACE_DATABASE_URL=%s\n' "$MONITOR_URL" > "$FINANCE_ENV_TARGET"
  chown root:root "$FINANCE_ENV_TARGET"
  chmod 0600 "$FINANCE_ENV_TARGET"
  install -o root -g root -m 0755 "$SCRIPT_DIR/production-runtime-pm2.sh" "$RUNTIME_RUNNER"
  install -o root -g root -m 0755 "$SCRIPT_DIR/production-legacy-pm2.sh" "$LEGACY_RUNNER"
  install -o root -g root -m 0644 "$SCRIPT_DIR/production-workspace-runtime.service" "$RUNTIME_SERVICE"
  systemctl daemon-reload
  systemctl enable workspace-runtime-pm2.service >/dev/null
  runuser -u postgres -- env WORKSPACE_RUNTIME_DATABASE_PASSWORD="$WORKSPACE_RUNTIME_DATABASE_PASSWORD" \
    WORKSPACE_MIGRATOR_DATABASE_PASSWORD="$WORKSPACE_MIGRATOR_DATABASE_PASSWORD" \
    WORKSPACE_BACKUP_DATABASE_PASSWORD="$WORKSPACE_BACKUP_DATABASE_PASSWORD" \
    WORKSPACE_MONITOR_DATABASE_PASSWORD="$WORKSPACE_MONITOR_DATABASE_PASSWORD" \
    psql -X -d postgres -f "$SCRIPT_DIR/production-roles.sql" >/dev/null
  rehome_rollback_databases
  finance_bot_contract apply
  node "$SCRIPT_DIR/production-pm2-plan.mjs" apply --plan "$backup_dir/pm2-plan.json" --runner "$RUNTIME_RUNNER"
  "$RUNTIME_RUNNER" save >/dev/null
  systemctl start workspace-runtime-pm2.service
  node "$SCRIPT_DIR/production-pm2-plan.mjs" verify --plan "$backup_dir/pm2-plan.json" --runner "$RUNTIME_RUNNER"
  verify_legacy_pm2_empty
  verify_runtime_env_links "$backup_dir/runtime-env-links.before"
  verify_runtime_permissions
  finance_bot_contract verify
  verify_workspace_http 45
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d postgres -c \
    "ALTER ROLE workspace_app NOLOGIN; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='workspace_app' AND pid<>pg_backend_pid()" >/dev/null
  runuser -u postgres -- psql -X -d postgres -f "$SCRIPT_DIR/production-verify.sql" >/dev/null
  install_hba final "$backup_dir"
  verify_workspace_http 15
  write_receipt applied "$backup_dir"
  echo "applied: $RECEIPT_FILE"
elif [ "$COMMAND" = verify ]; then
  verify_workspace_http 3
  runuser -u postgres -- psql -X -d postgres -f "$SCRIPT_DIR/production-verify.sql" >/dev/null
  node "$SCRIPT_DIR/production-pm2-plan.mjs" verify --plan "$backup_dir/pm2-plan.json" --runner "$RUNTIME_RUNNER"
  verify_legacy_pm2_empty
  verify_runtime_env_links "$backup_dir/runtime-env-links.before"
  verify_runtime_permissions
  finance_bot_contract verify
  [ "$(sha256sum "$HBA_FILE" | awk '{print $1}')" = "$(sha256sum "$backup_dir/pg_hba.final" | awk '{print $1}')" ] || { echo "[错误] HBA 不等于 final candidate" >&2; exit 1; }
  write_receipt verified "$backup_dir"
  echo "verified: $RECEIPT_FILE"
else
  [ "$EXECUTE" = 1 ] || { echo "[错误] rollback 必须显式传 --execute" >&2; exit 2; }
  systemctl stop finance-bot.service 2>/dev/null || true
  if [ -x "$RUNTIME_RUNNER" ]; then
    while IFS= read -r name; do "$RUNTIME_RUNNER" delete "$name" >/dev/null 2>&1 || true; done < <(managed_process_names "$backup_dir/pm2-plan.json")
    "$RUNTIME_RUNNER" save >/dev/null 2>&1 || true
  fi
  systemctl disable --now workspace-runtime-pm2.service >/dev/null 2>&1 || true
  install_hba transition "$backup_dir"
  runuser -u postgres -- psql -X -d postgres -f "$SCRIPT_DIR/production-rollback.sql" >/dev/null
  restore_runtime_env_links "$backup_dir/runtime-env-links.before"
  rollback_runner="$LEGACY_RUNNER"
  [ -x "$rollback_runner" ] || rollback_runner="$SCRIPT_DIR/production-legacy-pm2.sh"
  while IFS= read -r name; do legacy_pm2 delete "$name" >/dev/null 2>&1 || true; done < <(managed_process_names "$backup_dir/pm2-plan.json")
  node "$SCRIPT_DIR/production-pm2-plan.mjs" apply --plan "$backup_dir/pm2-plan.json" --runner "$rollback_runner"
  legacy_pm2 save >/dev/null
  [ ! -f "$backup_dir/pm2-dump.before" ] || install -o ubuntu -g ubuntu -m 0600 "$backup_dir/pm2-dump.before" /home/ubuntu/.pm2/dump.pm2
  setfacl --restore="$backup_dir/workspace-acl.before"
  finance_bot_contract rollback
  restore_optional_file "$backup_dir" runtime.env.before "$RUNTIME_ENV_TARGET" root "$RUNTIME_USER" 0640
  restore_optional_file "$backup_dir" control-plane.env.before "$CONTROL_ENV_TARGET" root root 0600
  restore_optional_file "$backup_dir" finance-bot.env.before "$FINANCE_ENV_TARGET" root root 0600
  restore_optional_file "$backup_dir" runtime-runner.before "$RUNTIME_RUNNER" root root 0755
  restore_optional_file "$backup_dir" legacy-runner.before "$LEGACY_RUNNER" root root 0755
  restore_optional_file "$backup_dir" runtime-service.before "$RUNTIME_SERVICE" root root 0644
  systemctl daemon-reload
  case "$(sed -n '1p' "$backup_dir/runtime-service-enabled.before")" in
    enabled) systemctl enable workspace-runtime-pm2.service >/dev/null ;;
    *) systemctl disable workspace-runtime-pm2.service >/dev/null 2>&1 || true ;;
  esac
  install_hba before "$backup_dir"
  systemctl start finance-bot.service 2>/dev/null || true
  verify_workspace_http 45
  write_receipt rolled-back "$backup_dir"
  echo "rolled-back: $RECEIPT_FILE"
fi
