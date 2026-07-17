#!/bin/bash
set -euo pipefail

require_env() {
  local key
  for key in "$@"; do
    if [ -z "${!key:-}" ]; then
      echo "[错误] remote release 缺少环境变量: $key" >&2
      exit 64
    fi
  done
}

require_env \
  REMOTE_ARTIFACT_PATH \
  REMOTE_MANIFEST_PATH \
  RELEASE_ID \
  ARTIFACT_SHA \
  ARTIFACT_MANIFEST_SHA \
  RELEASE_ARTIFACT_DIGEST \
  RELEASE_SOURCE_SHA \
  RELEASE_SOURCE_TREE \
  RELEASE_MIGRATION_SET_SHA \
  RELEASE_CNB_REPOSITORY \
  RELEASE_CNB_SOURCE_REF \
  CNB_RELEASE_SHA \
  REMOTE_DIR \
  REMOTE_WORKSPACE_CONFIG_DIR \
  REMOTE_BACKUP_DIR \
  REMOTE_AGENT_SOURCE_ROOT_NAME \
  PM2_NAME \
  PM2_WECOM_BOT_NAME \
  HEALTHCHECK_URL

DEPLOYED_SOURCE_SHA="${DEPLOYED_SOURCE_SHA:-}"
DEPLOYED_ARTIFACT_DIGEST="${DEPLOYED_ARTIFACT_DIGEST:-}"
RELEASE_BOOTSTRAP_BASE="${RELEASE_BOOTSTRAP_BASE:-}"
RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT="${RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT:-}"
RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID="${RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID:-}"
RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN="${RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN:-}"
RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION="${RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION:-}"
RELEASE_BOOTSTRAP_LEGACY_BUILD_ID="${RELEASE_BOOTSTRAP_LEGACY_BUILD_ID:-}"
RELEASE_BOOTSTRAP_CNB_REPOSITORY="${RELEASE_BOOTSTRAP_CNB_REPOSITORY:-}"
RELEASE_BOOTSTRAP_MIGRATION_COUNT="${RELEASE_BOOTSTRAP_MIGRATION_COUNT:-}"
RELEASE_BOOTSTRAP_MIGRATION_DIGEST="${RELEASE_BOOTSTRAP_MIGRATION_DIGEST:-}"
REMOTE_RELEASE_SCRIPT="${REMOTE_RELEASE_SCRIPT:-}"

cleanup_remote_release_module() {
  if [ -n "$REMOTE_RELEASE_SCRIPT" ]; then
    rm -f -- "$REMOTE_RELEASE_SCRIPT" || true
  fi
}
trap cleanup_remote_release_module EXIT

main() {
    if command -v sha256sum >/dev/null 2>&1; then
      remote_artifact_sha=$(sha256sum "$REMOTE_ARTIFACT_PATH" | awk '{print $1}')
      remote_manifest_sha=$(sha256sum "$REMOTE_MANIFEST_PATH" | awk '{print $1}')
    else
      remote_artifact_sha=$(shasum -a 256 "$REMOTE_ARTIFACT_PATH" | awk '{print $1}')
      remote_manifest_sha=$(shasum -a 256 "$REMOTE_MANIFEST_PATH" | awk '{print $1}')
    fi
    if [ "$remote_artifact_sha" != "$ARTIFACT_SHA" ]; then
      echo '[错误] 服务器收到的 standalone 产物 SHA-256 不匹配'
      exit 1
    fi
    if [ "$remote_manifest_sha" != "$ARTIFACT_MANIFEST_SHA" ]; then
      echo '[错误] 服务器收到的 standalone manifest SHA-256 不匹配'
      exit 1
    fi
    node - "$REMOTE_MANIFEST_PATH" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$ARTIFACT_SHA" <<'NODE'
const fs = require('fs');
const [manifestPath, sourceSha, sourceTree, artifactSha] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1
  || manifest.source?.commitSha !== sourceSha
  || manifest.source?.treeSha !== sourceTree
  || manifest.build?.buildId !== sourceSha
  || manifest.artifact?.sha256 !== artifactSha) {
  throw new Error('standalone manifest identity does not match trusted release values');
}
NODE
    mkdir -p "$REMOTE_DIR/releases"
    old_release=$(readlink -f "$REMOTE_DIR/current" 2>/dev/null || true)
    find "$REMOTE_DIR" -mindepth 1 -maxdepth 1 ! -name current ! -name releases ! -name .workspace ! -name .workspace.backups ! -name "$REMOTE_AGENT_SOURCE_ROOT_NAME" -exec rm -rf {} +
    release_dir="$REMOTE_DIR/releases/$RELEASE_ID"
    rm -rf "$release_dir"
    mkdir -p "$release_dir"
    tar -xzf "$REMOTE_ARTIFACT_PATH" -C "$release_dir"
    cp "$REMOTE_MANIFEST_PATH" "$release_dir/.release-manifest.json"
    rm -f "$REMOTE_ARTIFACT_PATH" "$REMOTE_MANIFEST_PATH"

    server_entry=$(cat "$release_dir/.server-entry" 2>/dev/null || printf 'server.js')
    app_dir=$(dirname "$release_dir/$server_entry")
    test -f "$release_dir/$server_entry"

    ln -sfn '../../.workspace/.env' "$release_dir/.env"
    ln -sfn "$(realpath --relative-to="$app_dir" "$REMOTE_WORKSPACE_CONFIG_DIR/.env")" "$app_dir/.env"
    rm -rf "$release_dir/data" "$app_dir/data"

    if [ -d "$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company" ]; then
      rm -rf "$app_dir/public/company"
      mkdir -p "$app_dir/public"
      ln -sfn "$(realpath --relative-to="$app_dir/public" "$REMOTE_WORKSPACE_CONFIG_DIR/assets/brand/company")" "$app_dir/public/company"
    fi

    if [ -d "$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar" ]; then
      mkdir -p "$app_dir/public/assets/agent"
      rm -rf "$app_dir/public/assets/agent/avatar"
      ln -sfn "$(realpath --relative-to="$app_dir/public/assets/agent" "$REMOTE_WORKSPACE_CONFIG_DIR/assets/agent/avatar")" "$app_dir/public/assets/agent/avatar"
    fi

    if [ -d "$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar" ]; then
      mkdir -p "$app_dir/public/assets/user"
      rm -rf "$app_dir/public/assets/user/avatar"
      ln -sfn "$(realpath --relative-to="$app_dir/public/assets/user" "$REMOTE_WORKSPACE_CONFIG_DIR/assets/user/avatar")" "$app_dir/public/assets/user/avatar"
    fi

    grep -q '^WORKSPACE_CONFIG_DIR=' "$release_dir/.env"
    grep -q '^DATABASE_URL=' "$release_dir/.env"
    grep -q '^DIRECT_URL=' "$release_dir/.env"
    test -f "$release_dir/prisma/schema.prisma"
    test -f "$release_dir/prisma/migrations/migration_lock.toml"
    test -f "$release_dir/scripts/check/check-prisma-deploy-status.js"
    test -f "$release_dir/scripts/ci/check-migration-policy.mjs"
    test -f "$release_dir/scripts/migrate/sqlite-to-postgresql.mjs"
    test -f "$release_dir/node_modules/prisma/build/index.js"
    test -f "$release_dir/resource-defs.json"
    test -f "$release_dir/seed-resources-runtime.mjs"
    test -f "$release_dir/scripts/provision-agent-workforce.mjs"
    test -f "$release_dir/scripts/lib/agent-workforce-specs.mjs"
    test -f "$release_dir/scripts/check/check-permission-action-grants.mjs"
    test -f "$release_dir/.release-manifest.json"

    cd "$release_dir"
    set -a
    . "$release_dir/.env"
    set +a
    export NODE_ENV=production
    cutover_source="${SQLITE_CUTOVER_SOURCE:-}"
    cutover_rollback_env="${SQLITE_CUTOVER_ROLLBACK_ENV:-}"
    cutover_public_switched=0
    cutover_public_wal_lsn=''
    cutover_candidate_name="$PM2_NAME-candidate"
    current_swap_tmp=''
    public_process_stopped=0
    release_committed=0
    maintenance_migrations=''
    maintenance_migration_started=0
    maintenance_marker_path="$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy"
    maintenance_marker_source="$RELEASE_SOURCE_SHA"
    maintenance_backup=''
    maintenance_backup_sha=''
    maintenance_marker_present=0
    if [ -f "$maintenance_marker_path" ]; then
      maintenance_marker_present=1
      maintenance_migration_started=1
      public_process_stopped=1
    fi
    pm2_pid_or_unavailable() {
      local process_name=$1
      local process_list
      process_list=$(pm2 jlist 2>/dev/null) || {
        printf '__unavailable__'
        return
      }
      PROCESS_NAME="$process_name" PROCESS_LIST="$process_list" python3 - <<'PY'
import json
import os

try:
    processes = json.loads(os.environ['PROCESS_LIST'])
    if not isinstance(processes, list) or any(not isinstance(item, dict) for item in processes):
        raise ValueError('pm2 jlist did not return a process object list')
    matches = [item for item in processes if item.get('name') == os.environ['PROCESS_NAME']]
    if not matches:
        print('0')
    elif len(matches) != 1:
        print('__unavailable__')
    else:
        item = matches[0]
        pid = item.get('pid') or 0
        status = item.get('pm2_env', {}).get('status')
        if status == 'stopped' and pid == 0:
            print('0')
        elif status == 'online' and isinstance(pid, int) and pid > 0:
            print(pid)
        else:
            print('__unavailable__')
except Exception:
    print('__unavailable__')
PY
    }
    assert_release_version() {
      version_url=$1
      version_label=$2
      version_response=$(curl -fsS "$version_url")
      actual_version=$(VERSION_RESPONSE="$version_response" node - <<'NODE'
const payload = JSON.parse(process.env.VERSION_RESPONSE || 'null');
if (!payload || typeof payload.version !== 'string') {
  throw new Error('version endpoint did not return a string version');
}
process.stdout.write(payload.version);
NODE
      )
      if [ "$actual_version" != "$RELEASE_SOURCE_SHA" ]; then
        echo "[错误] $version_label 版本 $actual_version 与 canonical source $RELEASE_SOURCE_SHA 不一致"
        exit 1
      fi
    }
    verify_remote_deployed_record() {
      verification_phase=$1
      deployed_record="$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json"
      if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
        if [ -e "$deployed_record" ]; then
          echo "[错误] $verification_phase: production bootstrap 期间出现正式部署记录"
          exit 1
        fi
      else
        test -f "$deployed_record"
        DEPLOYED_RECORD="$deployed_record" \
        EXPECTED_SHA="$DEPLOYED_SOURCE_SHA" \
        EXPECTED_ARTIFACT_DIGEST="$DEPLOYED_ARTIFACT_DIGEST" \
        EXPECTED_REPOSITORY="$RELEASE_CNB_REPOSITORY" \
        EXPECTED_REF="$RELEASE_CNB_SOURCE_REF" node - <<'NODE'
const fs = require('fs');
const record = JSON.parse(fs.readFileSync(process.env.DEPLOYED_RECORD, 'utf8'));
if (record?.source?.commitSha !== process.env.EXPECTED_SHA
  || record?.artifact?.digest !== process.env.EXPECTED_ARTIFACT_DIGEST
  || record?.cnb?.repository !== process.env.EXPECTED_REPOSITORY
  || record?.cnb?.sourceRef !== process.env.EXPECTED_REF) {
  throw new Error('deployed-release record changed during deployment');
}
NODE
      fi
      echo "==> $verification_phase: 生产部署记录未被并发修改"
    }
    ensure_bootstrap_progress_marker() {
      [ -n "$RELEASE_BOOTSTRAP_BASE" ] || return 0
      bootstrap_progress_marker="$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json"
      test ! -e "$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json"
      BOOTSTRAP_PROGRESS_MARKER="$bootstrap_progress_marker" \
      EXPECTED_BASELINE="$RELEASE_BOOTSTRAP_BASE" \
      EXPECTED_CANDIDATE="$RELEASE_SOURCE_SHA" \
      EXPECTED_TREE="$RELEASE_SOURCE_TREE" \
      EXPECTED_MIGRATION_SET="$RELEASE_MIGRATION_SET_SHA" \
      EXPECTED_LEGACY_RELEASE="$RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID" \
      EXPECTED_LEGACY_CNB_COMMIT="$RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT" \
      EXPECTED_LEGACY_CNB_BUILD_SN="$RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN" \
      EXPECTED_LEGACY_RUNTIME_VERSION="$RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION" \
      EXPECTED_LEGACY_BUILD_ID="$RELEASE_BOOTSTRAP_LEGACY_BUILD_ID" \
      EXPECTED_LEGACY_CNB_REPOSITORY="$RELEASE_BOOTSTRAP_CNB_REPOSITORY" \
      EXPECTED_BASELINE_COUNT="$RELEASE_BOOTSTRAP_MIGRATION_COUNT" \
      EXPECTED_BASELINE_DIGEST="$RELEASE_BOOTSTRAP_MIGRATION_DIGEST" python3 - <<'PY'
import json
import os
from pathlib import Path

expected = {
    'schemaVersion': 2,
    'phase': 'mutation-started',
    'baselineSha': os.environ['EXPECTED_BASELINE'],
    'candidateSha': os.environ['EXPECTED_CANDIDATE'],
    'candidateTreeSha': os.environ['EXPECTED_TREE'],
    'candidateMigrationSetSha256': os.environ['EXPECTED_MIGRATION_SET'],
    'legacyReleaseId': os.environ['EXPECTED_LEGACY_RELEASE'],
    'legacyCnbCommitSha': os.environ['EXPECTED_LEGACY_CNB_COMMIT'],
    'legacyCnbBuildSn': os.environ['EXPECTED_LEGACY_CNB_BUILD_SN'],
    'legacyRuntimeVersion': os.environ['EXPECTED_LEGACY_RUNTIME_VERSION'],
    'legacyBuildId': os.environ['EXPECTED_LEGACY_BUILD_ID'],
    'legacyCnbRepository': os.environ['EXPECTED_LEGACY_CNB_REPOSITORY'],
    'baselineMigrationCount': int(os.environ['EXPECTED_BASELINE_COUNT']),
    'baselineMigrationSetSha256': os.environ['EXPECTED_BASELINE_DIGEST'],
}
path = Path(os.environ['BOOTSTRAP_PROGRESS_MARKER'])
if path.exists():
    try:
        actual = json.loads(path.read_text(encoding='utf-8'))
    except Exception as error:
        raise SystemExit(f'production bootstrap progress marker is invalid: {error}')
    if actual != expected:
        raise SystemExit('production bootstrap progress marker is not the exact same receipt and candidate')
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f'.{path.name}.tmp-{os.getpid()}'
    temporary.write_text(json.dumps(expected, indent=2) + '\n', encoding='utf-8')
    temporary.chmod(0o600)
    temporary.replace(path)
PY
      echo '==> production bootstrap 已在首次 mutation 前原子绑定当前 receipt/candidate'
    }
    atomic_switch_current() {
      current_target=$1
      current_swap_tmp="$REMOTE_DIR/.current.swap-$RELEASE_SOURCE_SHA"
      rm -f "$current_swap_tmp"
      ln -s "$current_target" "$current_swap_tmp"
      mv -Tf "$current_swap_tmp" "$REMOTE_DIR/current"
      current_swap_tmp=''
    }
    rollback_cutover() {
      exit_code=$?
      trap - EXIT
      if [ -n "$current_swap_tmp" ]; then
        rm -f "$current_swap_tmp"
        current_swap_tmp=''
      fi
      if [ "$exit_code" -ne 0 ] && [ "$release_committed" = '0' ] && [ -f "$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json" ]; then
        if DEPLOYED_RECORD="$REMOTE_WORKSPACE_CONFIG_DIR/deployed-release.json" \
          EXPECTED_SOURCE="$RELEASE_SOURCE_SHA" \
          EXPECTED_TREE="$RELEASE_SOURCE_TREE" \
          EXPECTED_ARTIFACT_DIGEST="$RELEASE_ARTIFACT_DIGEST" \
          EXPECTED_RELEASE_DIR="$release_dir" node - <<'NODE'
const fs = require('fs');
const record = JSON.parse(fs.readFileSync(process.env.DEPLOYED_RECORD, 'utf8'));
if (record?.source?.commitSha !== process.env.EXPECTED_SOURCE
  || record?.source?.treeSha !== process.env.EXPECTED_TREE
  || record?.artifact?.digest !== process.env.EXPECTED_ARTIFACT_DIGEST
  || record?.deployment?.releaseDir !== process.env.EXPECTED_RELEASE_DIR) {
  process.exit(1);
}
NODE
        then
          release_committed=1
          echo '==> deployed-release 原子记录已绑定当前 candidate；将其视为 commit point，不执行旧版本回滚'
        fi
      fi
      if [ "$exit_code" -ne 0 ] && [ "$release_committed" = '1' ]; then
        cleanup_remote_release_module
        exit "$exit_code"
      fi
      candidate_cleanup_failed=0
      if [ "$exit_code" -ne 0 ]; then
        pm2 delete "$cutover_candidate_name" 2>/dev/null || true
        rollback_candidate_pid=$(pm2_pid_or_unavailable "$cutover_candidate_name")
        if [ "$rollback_candidate_pid" != '0' ]; then
          candidate_cleanup_failed=1
          echo '[错误] 未提交 candidate writer 未能确认停止；禁止自动启动或回退任何 writer。'
        else
          pm2 save
        fi
      fi
      if [ "$exit_code" -ne 0 ] && [ "$candidate_cleanup_failed" = '1' ]; then
        echo '[错误] candidate 无法确认停止；立即隔离 public 与 WeCom，避免双 writer。'
        pm2 delete "$PM2_NAME" 2>/dev/null || true
        pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
        rollback_public_pid=$(pm2_pid_or_unavailable "$PM2_NAME")
        rollback_wecom_pid=$(pm2_pid_or_unavailable "$PM2_WECOM_BOT_NAME")
        pm2 save || echo '[错误] writer 已隔离，但 PM2 状态持久化失败；禁止自动恢复。'
        if [ "$rollback_public_pid" != '0' ] || [ "$rollback_wecom_pid" != '0' ]; then
          echo '[错误] candidate 状态不明且其余 writer 也未能全部隔离；保持失败并等待人工处理。'
        else
          echo '[维护] candidate 状态不明；public 与 WeCom 已确认停止，不执行自动回退。'
        fi
      elif [ "$exit_code" -ne 0 ] && [ -n "$cutover_source" ] && [ "$cutover_public_switched" = '0' ]; then
        pm2 delete "$cutover_candidate_name" 2>/dev/null || true
        pm2 delete "$PM2_NAME" 2>/dev/null || true
        pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
        rollback_candidate_pid=$(pm2_pid_or_unavailable "$cutover_candidate_name")
        rollback_public_pid=$(pm2_pid_or_unavailable "$PM2_NAME")
        rollback_wecom_pid=$(pm2_pid_or_unavailable "$PM2_WECOM_BOT_NAME")
        if [ "$rollback_candidate_pid" != '0' ] || [ "$rollback_public_pid" != '0' ] || [ "$rollback_wecom_pid" != '0' ]; then
          cutover_public_switched=1
          echo '[错误] PostgreSQL candidate/public/WeCom writer 未能全部确认停止；禁止自动回退 SQLite。'
        elif [ -n "$cutover_public_wal_lsn" ]; then
          rollback_final_wal_lsn=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()' 2>/dev/null || printf '__unavailable__')
          if [ "$rollback_final_wal_lsn" != "$cutover_public_wal_lsn" ]; then
            cutover_public_switched=1
            echo '[错误] PostgreSQL 3000 writer 已停止，但最终 WAL 与对外启动前不同；为防止数据丢失，禁止自动回退 SQLite。'
          fi
        fi
        if [ "$cutover_public_switched" = '0' ]; then
          echo '[回滚] PostgreSQL writer 已停止且 WAL 未变化，恢复旧 SQLite env 与旧 release。'
          cp "$cutover_rollback_env" "$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp"
          chmod 600 "$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp"
          mv "$REMOTE_WORKSPACE_CONFIG_DIR/.env.rollback.tmp" "$REMOTE_WORKSPACE_CONFIG_DIR/.env"
          set -a
          . "$REMOTE_WORKSPACE_CONFIG_DIR/.env"
          set +a
          old_server_entry=$(cat "$old_release/.server-entry" 2>/dev/null || printf 'server.js')
          old_app_dir=$(dirname "$old_release/$old_server_entry")
          pm2 start "$old_release/$old_server_entry" --name "$PM2_NAME" --cwd "$old_app_dir" --update-env
          rollback_ready=0
          for _ in $(seq 1 20); do
            if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
              rollback_ready=1
              break
            fi
            sleep 1
          done
          if [ "$rollback_ready" != '1' ]; then
            echo '[错误] 旧 SQLite release 已尝试恢复，但 3000 端口健康检查失败。'
            pm2 logs "$PM2_NAME" --lines 80 --nostream || true
          fi
          if [ -n "${WECHAT_BOT_ID:-}" ] && [ -n "${WECHAT_BOT_SECRET:-}" ] && [ -f "$old_release/scripts/runtime/wecom-agent-bot.mjs" ]; then
            pm2 start "$old_release/scripts/runtime/wecom-agent-bot.mjs" --name "$PM2_WECOM_BOT_NAME" --cwd "$old_release" --update-env
          fi
          pm2 save
        fi
      elif [ "$exit_code" -ne 0 ] && [ -z "$cutover_source" ] && [ "$public_process_stopped" = '1' ] && [ "$release_committed" = '0' ]; then
        pm2 delete "$cutover_candidate_name" 2>/dev/null || true
        pm2 delete "$PM2_NAME" 2>/dev/null || true
        pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
        if [ "$maintenance_migration_started" = '1' ]; then
          echo '[维护] 不兼容 migration 已开始执行；为防止旧版本读取新协议，保持 Workspace 与企业微信停止。'
          if [ ! -f "$maintenance_marker_path" ]; then
            echo '[错误] maintenance 持久 marker 丢失；保持停机并等待人工恢复'
          else
            chmod 600 "$maintenance_marker_path"
          fi
          pm2 save
        elif [ -n "$old_release" ] && [ -f "$old_release/.server-entry" ]; then
          echo '[回滚] 新 release 未完成健康/版本/证据提交，恢复上一 PostgreSQL 应用版本。'
          old_server_entry=$(cat "$old_release/.server-entry" 2>/dev/null || printf 'server.js')
          old_app_dir=$(dirname "$old_release/$old_server_entry")
          PORT=3000 HOSTNAME=0.0.0.0 pm2 start "$old_release/$old_server_entry" --name "$PM2_NAME" --cwd "$old_app_dir" --update-env
          atomic_switch_current "$old_release"
          rollback_ready=0
          for _ in $(seq 1 20); do
            if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
              rollback_ready=1
              break
            fi
            sleep 1
          done
          if [ "$rollback_ready" != '1' ]; then
            echo '[错误] 上一 PostgreSQL 应用版本已重启，但健康检查失败。'
            pm2 logs "$PM2_NAME" --lines 80 --nostream || true
          fi
          if [ -n "${WECHAT_BOT_ID:-}" ] && [ -n "${WECHAT_BOT_SECRET:-}" ] && [ -f "$old_release/scripts/runtime/wecom-agent-bot.mjs" ]; then
            pm2 start "$old_release/scripts/runtime/wecom-agent-bot.mjs" --name "$PM2_WECOM_BOT_NAME" --cwd "$old_release" --update-env
          fi
          pm2 save
        else
          echo '[错误] 没有可用的上一 release，无法自动恢复公网应用。'
        fi
      fi
      cleanup_remote_release_module
      exit "$exit_code"
    }
    trap rollback_cutover EXIT
    if [ "$maintenance_migration_started" = '1' ]; then
      echo '==> 检测到 maintenance marker；先无条件隔离所有旧 writer'
      public_process_stopped=1
      pm2 delete "$cutover_candidate_name" 2>/dev/null || true
      pm2 delete "$PM2_NAME" 2>/dev/null || true
      pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
      if [ "$(pm2_pid_or_unavailable "$cutover_candidate_name")" != '0' ] \
        || [ "$(pm2_pid_or_unavailable "$PM2_NAME")" != '0' ] \
        || [ "$(pm2_pid_or_unavailable "$PM2_WECOM_BOT_NAME")" != '0' ]; then
        echo '[错误] maintenance 续跑未能确认所有旧 writer 停止'
        exit 1
      fi
      pm2 save
      test "$maintenance_marker_present" = '1'
      test -f "$maintenance_marker_path"
      persisted_line_count=$(awk 'END { print NR }' "$maintenance_marker_path")
      persisted_source=$(sed -n 's/^sourceSha=//p' "$maintenance_marker_path")
      persisted_migrations=$(sed -n 's/^migrations=//p' "$maintenance_marker_path")
      persisted_backup=$(sed -n 's/^backupPath=//p' "$maintenance_marker_path")
      persisted_backup_sha=$(sed -n 's/^backupSha256=//p' "$maintenance_marker_path")
      if [ "$persisted_line_count" != '4' ] \
        || ! printf '%s' "$persisted_source" | grep -Eq '^[0-9a-f]{40}$' \
        || ! printf '%s' "$persisted_migrations" | grep -Eq '^[0-9]{14}_[a-z0-9_]+(,[0-9]{14}_[a-z0-9_]+)*$' \
        || ! printf '%s' "$persisted_backup_sha" | grep -Eq '^(pending|[0-9a-f]{64})$'; then
        echo '[错误] maintenance-deploy 持久状态损坏；writer 已保持停止'
        exit 1
      fi
      if [ "$persisted_source" != "$RELEASE_SOURCE_SHA" ]; then
        echo '[错误] maintenance-deploy 属于其他 candidate；writer 已保持停止'
        exit 1
      fi
      case "$persisted_backup" in
        "$REMOTE_BACKUP_DIR/maintenance-pinned/"*.dump) ;;
        *) echo '[错误] maintenance-deploy 备份路径不在受保护目录；writer 已保持停止'; exit 1 ;;
      esac
      maintenance_migrations="$persisted_migrations"
      maintenance_backup="$persisted_backup"
      maintenance_backup_sha="$persisted_backup_sha"
      maintenance_marker_source="$persisted_source"
      if [ "$maintenance_backup_sha" != 'pending' ]; then
        test -s "$maintenance_backup"
        pg_restore --list "$maintenance_backup" >/dev/null
        if command -v sha256sum >/dev/null 2>&1; then
          persisted_backup_actual=$(sha256sum "$maintenance_backup" | awk '{print $1}')
        else
          persisted_backup_actual=$(shasum -a 256 "$maintenance_backup" | awk '{print $1}')
        fi
        if [ "$persisted_backup_actual" != "$maintenance_backup_sha" ]; then
          echo '[错误] maintenance 前置恢复点 digest 不匹配；writer 已保持停止'
          exit 1
        fi
      fi
      echo "==> 未完成维护状态（source ${persisted_source}）已隔离；旧版本回滚保持禁用"
    fi
    if [ -n "$cutover_source" ]; then
      case "$cutover_rollback_env" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_ROLLBACK_ENV 必须是绝对路径'; exit 1 ;; esac
      test -r "$cutover_rollback_env"
      test -n "$old_release"
      test -f "$old_release/.server-entry"
      if [ "$(pm2_pid_or_unavailable "$cutover_candidate_name")" != '0' ] || [ "$(pm2_pid_or_unavailable "$PM2_NAME")" != '0' ] || [ "$(pm2_pid_or_unavailable "$PM2_WECOM_BOT_NAME")" != '0' ]; then
        echo '[错误] SQLite cutover 前必须先停止 candidate、Workspace 与企业微信 PM2 writer'
        exit 1
      fi
    fi
    echo '==> 检查 Prisma migration 状态...'
    node "$release_dir/scripts/check/check-prisma-deploy-status.js" --migrations-dir "$release_dir/prisma/migrations" --allow-pending
    migration_inventory_rows=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -At -F '|' -c 'SELECT migration_name, checksum, CASE WHEN finished_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, CASE WHEN rolled_back_at IS NULL THEN '\''0'\'' ELSE '\''1'\'' END, applied_steps_count::text FROM "_prisma_migrations" ORDER BY migration_name, id')
    MIGRATION_ROWS="$migration_inventory_rows" MIGRATIONS_DIR="$release_dir/prisma/migrations" node - <<'NODE'
const { createHash } = require('crypto');
const { readFileSync, readdirSync } = require('fs');
const path = require('path');

const migrations = new Map();
for (const entry of readdirSync(process.env.MIGRATIONS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[0-9]{14}_[a-z0-9_]+$/.test(entry.name)) continue;
  const sqlPath = path.join(process.env.MIGRATIONS_DIR, entry.name, 'migration.sql');
  const checksum = createHash('sha256').update(readFileSync(sqlPath)).digest('hex');
  migrations.set(entry.name, checksum);
}
const active = new Set();
for (const line of (process.env.MIGRATION_ROWS || '').split('\n').filter(Boolean)) {
  const [name, checksum, finished, rolledBack, steps, ...rest] = line.split('|');
  if (rest.length || !/^[0-9]{14}_[a-z0-9_]+$/.test(name || '')
    || !/^[0-9a-f]{64}$/.test(checksum || '') || !/^[01]$/.test(finished || '')
    || !/^[01]$/.test(rolledBack || '') || !/^[0-9]+$/.test(steps || '')) {
    throw new Error('database migration inventory contains a malformed row');
  }
  if (!migrations.has(name) || migrations.get(name) !== checksum) {
    throw new Error('database migration ' + name + ' is absent from the candidate or has a different checksum');
  }
  if (finished === '0' && rolledBack === '0') {
    throw new Error('database migration ' + name + ' is unfinished; resolve it explicitly before retrying deployment');
  }
  if (finished === '1' && rolledBack === '1') {
    throw new Error('database migration ' + name + ' is both finished and rolled back');
  }
  if (finished === '1' && rolledBack === '0') {
    if (active.has(name)) throw new Error('database migration ' + name + ' has duplicate active receipts');
    active.add(name);
    if (Number(steps) < 1) throw new Error('database migration ' + name + ' has no applied steps');
  }
}
NODE
    if [ -z "$cutover_source" ]; then
      for migration_file in "$release_dir"/prisma/migrations/*/migration.sql; do
        [ -f "$migration_file" ] || continue
        migration_name=$(basename "$(dirname "$migration_file")")
        if ! printf '%s' "$migration_name" | grep -Eq '^[0-9]{14}_[a-z0-9_]+$'; then
          echo "[错误] migration 名称不安全: $migration_name"
          exit 1
        fi
        migration_applied=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc "SELECT CASE WHEN EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '$migration_name' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN '1' ELSE '0' END")
        [ "$migration_applied" = '1' ] && continue
        migration_mode=$(node "$release_dir/scripts/ci/check-migration-policy.mjs" --file "$migration_file" --print-mode)
        if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
          case ",$maintenance_migrations," in
            *,"$migration_name",*) ;;
            *) maintenance_migrations="${maintenance_migrations}${maintenance_migrations:+,}$migration_name" ;;
          esac
        else
          case "$migration_mode" in
            expand) ;;
            maintenance)
              case ",$maintenance_migrations," in
                *,"$migration_name",*) ;;
                *) maintenance_migrations="${maintenance_migrations}${maintenance_migrations:+,}$migration_name" ;;
              esac
              ;;
            *) echo "[错误] migration mode 不可识别: $migration_name"; exit 1 ;;
          esac
        fi
      done
    fi
    # This is the first candidate-bound production mutation. The exact marker
    # is durable before maintenance state, database writes, seed/provision,
    # candidate PM2, or current can change. Different candidates never rebind it.
    ensure_bootstrap_progress_marker
    if [ -n "$maintenance_migrations" ]; then
      umask 077
      mkdir -p "$REMOTE_BACKUP_DIR/maintenance-pinned"
      if [ -z "$maintenance_backup" ]; then
        maintenance_backup="$REMOTE_BACKUP_DIR/maintenance-pinned/pre-""$maintenance_marker_source"'.dump'
        maintenance_backup_sha='pending'
      fi
      marker_tmp="$maintenance_marker_path.tmp.$$"
      printf '%s\n' \
        "sourceSha=$maintenance_marker_source" \
        "migrations=$maintenance_migrations" \
        "backupPath=$maintenance_backup" \
        "backupSha256=$maintenance_backup_sha" > "$marker_tmp"
      chmod 600 "$marker_tmp"
      mv "$marker_tmp" "$maintenance_marker_path"
      maintenance_migration_started=1
      echo "==> 进入维护窗口；停止旧 Workspace、candidate 与企业微信: $maintenance_migrations"
      public_process_stopped=1
      pm2 delete "$cutover_candidate_name" 2>/dev/null || true
      pm2 delete "$PM2_NAME" 2>/dev/null || true
      pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
      if [ "$(pm2_pid_or_unavailable "$cutover_candidate_name")" != '0' ] \
        || [ "$(pm2_pid_or_unavailable "$PM2_NAME")" != '0' ] \
        || [ "$(pm2_pid_or_unavailable "$PM2_WECOM_BOT_NAME")" != '0' ]; then
        echo '[错误] maintenance migration 前未能确认所有旧 writer 停止'
        exit 1
      fi
      pm2 save
      if [ "$maintenance_backup_sha" = 'pending' ]; then
        echo '==> 所有 writer 已停止并持久化；创建唯一的 migration 前 PostgreSQL 恢复点...'
        maintenance_backup_tmp="$maintenance_backup.tmp.$$"
        rm -f "$maintenance_backup_tmp"
        pg_dump --format=custom --no-owner --no-privileges --file="$maintenance_backup_tmp" "$DIRECT_URL"
        pg_restore --list "$maintenance_backup_tmp" >/dev/null
        if command -v sha256sum >/dev/null 2>&1; then
          maintenance_backup_sha=$(sha256sum "$maintenance_backup_tmp" | awk '{print $1}')
        else
          maintenance_backup_sha=$(shasum -a 256 "$maintenance_backup_tmp" | awk '{print $1}')
        fi
        test -s "$maintenance_backup_tmp"
        mv "$maintenance_backup_tmp" "$maintenance_backup"
        printf '%s  %s\n' "$maintenance_backup_sha" "$maintenance_backup" > "$maintenance_backup.sha256"
        marker_tmp="$maintenance_marker_path.tmp.$$"
        printf '%s\n' \
          "sourceSha=$maintenance_marker_source" \
          "migrations=$maintenance_migrations" \
          "backupPath=$maintenance_backup" \
          "backupSha256=$maintenance_backup_sha" > "$marker_tmp"
        chmod 600 "$marker_tmp"
        mv "$marker_tmp" "$maintenance_marker_path"
      fi
      test -s "$maintenance_backup"
      test -s "$maintenance_backup.sha256"
    fi
    verify_remote_deployed_record 'pre-migration'
    echo '==> 执行 Prisma 数据库迁移...'
    node "$release_dir/node_modules/prisma/build/index.js" migrate deploy --schema="$release_dir/prisma"
    if [ -n "${SQLITE_CUTOVER_SOURCE:-}" ]; then
      if [ -z "${SQLITE_CUTOVER_SHA256:-}" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_SHA256'
        exit 1
      fi
      if [ -z "${SQLITE_CUTOVER_ROLLBACK_ENV:-}" ]; then
        echo '[错误] 配置了 SQLITE_CUTOVER_SOURCE 但缺少 SQLITE_CUTOVER_ROLLBACK_ENV'
        exit 1
      fi
      if ! printf '%s' "$SQLITE_CUTOVER_SHA256" | grep -Eq '^[0-9a-f]{64}$'; then
        echo '[错误] SQLITE_CUTOVER_SHA256 必须是 64 位小写十六进制 SHA-256'
        exit 1
      fi
      case "$SQLITE_CUTOVER_SOURCE" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_SOURCE 必须是绝对路径'; exit 1 ;; esac
      test -r "$SQLITE_CUTOVER_SOURCE"
      cutover_manifest="${SQLITE_CUTOVER_MANIFEST:-$REMOTE_BACKUP_DIR/postgresql-cutover/postgresql-execute.json}"
      case "$cutover_manifest" in /*) ;; *) echo '[错误] SQLITE_CUTOVER_MANIFEST 必须是绝对路径'; exit 1 ;; esac
      mkdir -p "$(dirname "$cutover_manifest")"
      cutover_dry_run_manifest="$cutover_manifest.dry-run.json"
      echo '==> 预演一次性 SQLite 到 PostgreSQL 数据切换...'
      node "$release_dir/scripts/migrate/sqlite-to-postgresql.mjs" \
        --sqlite "$SQLITE_CUTOVER_SOURCE" \
        --target "$DIRECT_URL" \
        --expected-source-sha256 "$SQLITE_CUTOVER_SHA256" \
        --manifest "$cutover_dry_run_manifest"
      echo '==> 执行一次性 SQLite 到 PostgreSQL 数据切换...'
      node "$release_dir/scripts/migrate/sqlite-to-postgresql.mjs" \
        --sqlite "$SQLITE_CUTOVER_SOURCE" \
        --target "$DIRECT_URL" \
        --expected-source-sha256 "$SQLITE_CUTOVER_SHA256" \
        --manifest "$cutover_manifest" \
        --execute
      psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO \"SystemConfig\" (\"key\", \"value\") VALUES ('database.cutover.marker', '$SQLITE_CUTOVER_SHA256') ON CONFLICT (\"key\") DO UPDATE SET \"value\" = EXCLUDED.\"value\"" >/dev/null
      python3 - "$REMOTE_WORKSPACE_CONFIG_DIR/.env" "$cutover_manifest" "$SQLITE_CUTOVER_SHA256" <<'PY'
import json
import os
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
source_sha256 = sys.argv[3]
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
if manifest.get('status') != 'success' or manifest.get('mode') != 'execute':
    raise SystemExit('SQLite cutover manifest is not a successful execute manifest')
if manifest.get('source', {}).get('sha256After') != source_sha256:
    raise SystemExit('SQLite cutover manifest source hash does not match the frozen source')
keys = {'SQLITE_CUTOVER_SOURCE', 'SQLITE_CUTOVER_SHA256', 'SQLITE_CUTOVER_MANIFEST', 'SQLITE_CUTOVER_ROLLBACK_ENV'}
lines = [line for line in env_path.read_text(encoding='utf-8').splitlines() if line.split('=', 1)[0].strip() not in keys]
temporary = env_path.with_suffix('.env.cutover.tmp')
temporary.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
os.chmod(temporary, 0o600)
temporary.replace(env_path)
receipt = manifest_path.with_suffix(manifest_path.suffix + '.complete')
receipt.write_text(f'{source_sha256}  {manifest_path.name}\n', encoding='utf-8')
os.chmod(receipt, 0o600)
PY
      unset SQLITE_CUTOVER_SOURCE SQLITE_CUTOVER_SHA256 SQLITE_CUTOVER_MANIFEST SQLITE_CUTOVER_ROLLBACK_ENV
      echo '==> SQLite 一次性切换完成，切换变量已从运行态配置移除。'
    fi
    node "$release_dir/scripts/check/check-prisma-deploy-status.js" --migrations-dir "$release_dir/prisma/migrations"
    echo '==> 同步 RBAC resource registry...'
    node "$release_dir/seed-resources-runtime.mjs" "$release_dir/resource-defs.json"
    echo '==> 幂等同步 Agent 虚拟员工与岗位...'
    node "$release_dir/scripts/provision-agent-workforce.mjs" --execute
    node "$release_dir/scripts/provision-agent-workforce.mjs" --check
    echo '==> 校验 RBAC action grant 数据...'
    node "$release_dir/scripts/check/check-permission-action-grants.mjs" "$release_dir/resource-defs.json"
    user_count=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM "User";')
    invalid_constraint_count=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM pg_constraint WHERE connamespace = '\''public'\''::regnamespace AND NOT convalidated;')
    if [ "$user_count" -lt 1 ]; then
      echo '[错误] PostgreSQL 中没有用户数据，拒绝启动生产服务'
      exit 1
    fi
    if [ "$invalid_constraint_count" -ne 0 ]; then
      echo '[错误] PostgreSQL 存在未验证约束，拒绝启动生产服务'
      exit 1
    fi
    direct_fingerprint=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc "SELECT (SELECT value FROM \"SystemConfig\" WHERE key = 'database.cutover.marker') || '|' || (SELECT checksum FROM \"_prisma_migrations\" WHERE migration_name = '20260713000000_postgresql_baseline' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"User\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"Resource\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"FinanceVoucherItem\")")
    runtime_fingerprint=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT (SELECT value FROM \"SystemConfig\" WHERE key = 'database.cutover.marker') || '|' || (SELECT checksum FROM \"_prisma_migrations\" WHERE migration_name = '20260713000000_postgresql_baseline' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1) || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"User\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"Resource\") || '|' || (SELECT count(*)::text || ':' || COALESCE(min(id), 0)::text || ':' || COALESCE(max(id), 0)::text FROM \"FinanceVoucherItem\")")
    if [ -z "$direct_fingerprint" ] || [ "$direct_fingerprint" != "$runtime_fingerprint" ]; then
      echo '[错误] DATABASE_URL 与 DIRECT_URL 的切换标记、migration checksum 或核心数据指纹不一致'
      exit 1
    fi

    pm2 delete "$cutover_candidate_name" 2>/dev/null || true
    PORT=3101 HOSTNAME=127.0.0.1 pm2 start "$release_dir/$server_entry" --name "$cutover_candidate_name" --cwd "$app_dir" --update-env
    qc_cache_ready=0
    for _ in $(seq 1 20); do
      if curl -fsS -X POST -H "x-qc-cache-warmup: $NEXTAUTH_SECRET" 'http://127.0.0.1:3101/workspace/api/modules/production/qc/cache' >/dev/null; then
        qc_cache_ready=1
        break
      fi
      sleep 1
    done
    if [ "$qc_cache_ready" != "1" ]; then
      echo '[错误] QC 模板缓存预热失败'
      pm2 logs "$cutover_candidate_name" --lines 80 --nostream || true
      exit 1
    fi
    assert_release_version 'http://127.0.0.1:3101/workspace/api/settings/version' 'candidate'
    verify_remote_deployed_record 'pre-cutover'
    pm2 delete "$cutover_candidate_name" 2>/dev/null || true
    if [ "$(pm2_pid_or_unavailable "$cutover_candidate_name")" != '0' ]; then
      echo '[错误] PostgreSQL candidate writer 未能确认停止，拒绝启动公网进程'
      exit 1
    fi
    pm2 delete "$PM2_NAME" 2>/dev/null || true
    if [ "$(pm2_pid_or_unavailable "$PM2_NAME")" != '0' ]; then
      echo '[错误] PostgreSQL public writer 未能确认停止，拒绝记录 WAL 基线'
      exit 1
    fi
    public_process_stopped=1
    if [ -n "$cutover_source" ]; then
      cutover_public_wal_lsn=$(psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT pg_current_wal_lsn()')
    fi
    PORT=3000 HOSTNAME=0.0.0.0 pm2 start "$release_dir/$server_entry" --name "$PM2_NAME" --cwd "$app_dir" --update-env
    public_ready=0
    for _ in $(seq 1 20); do
      if curl -fsS "$HEALTHCHECK_URL" >/dev/null && curl -fsS -X POST -H "x-qc-cache-warmup: $NEXTAUTH_SECRET" 'http://127.0.0.1:3000/workspace/api/modules/production/qc/cache' >/dev/null; then
        public_ready=1
        break
      fi
      sleep 1
    done
    if [ "$public_ready" != '1' ]; then
      pm2 logs "$PM2_NAME" --lines 80 --nostream || true
      exit 1
    fi
    assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'
    cutover_public_switched=1
    atomic_switch_current "$release_dir"
    pm2 delete "$PM2_WECOM_BOT_NAME" 2>/dev/null || true
    if [ -n "${WECHAT_BOT_ID:-}" ] && [ -n "${WECHAT_BOT_SECRET:-}" ]; then
      pm2 start "$release_dir/scripts/runtime/wecom-agent-bot.mjs" --name "$PM2_WECOM_BOT_NAME" --cwd "$release_dir" --update-env
    else
      echo '==> 跳过企业微信智能机器人：WECHAT_BOT_ID/WECHAT_BOT_SECRET 未配置'
    fi
    pm2 save
    DEPLOY_SOURCE_SHA="$RELEASE_SOURCE_SHA" \
    DEPLOY_SOURCE_TREE="$RELEASE_SOURCE_TREE" \
    DEPLOY_ARTIFACT_SHA="$ARTIFACT_SHA" \
    DEPLOY_ARTIFACT_DIGEST="$RELEASE_ARTIFACT_DIGEST" \
    DEPLOY_MANIFEST_SHA="$ARTIFACT_MANIFEST_SHA" \
    DEPLOY_CNB_REPOSITORY="$RELEASE_CNB_REPOSITORY" \
    DEPLOY_CNB_SOURCE_REF="$RELEASE_CNB_SOURCE_REF" \
    DEPLOY_CNB_RELEASE_SHA="$CNB_RELEASE_SHA" \
    DEPLOY_RELEASE_ID="$RELEASE_ID" \
    DEPLOY_RELEASE_DIR="$REMOTE_DIR/releases/$RELEASE_ID" \
    REMOTE_WORKSPACE_CONFIG_DIR="$REMOTE_WORKSPACE_CONFIG_DIR" \
      python3 - <<'PY'
from datetime import datetime, timezone
import json
import os
from pathlib import Path

config_dir = Path(os.environ['REMOTE_WORKSPACE_CONFIG_DIR'])
record = {
    'schemaVersion': 2,
    'source': {
        'commitSha': os.environ['DEPLOY_SOURCE_SHA'],
        'treeSha': os.environ['DEPLOY_SOURCE_TREE'],
    },
    'artifact': {
        'sha256': os.environ['DEPLOY_ARTIFACT_SHA'],
        'digest': os.environ['DEPLOY_ARTIFACT_DIGEST'],
        'manifestSha256': os.environ['DEPLOY_MANIFEST_SHA'],
    },
    'cnb': {
        'repository': os.environ['DEPLOY_CNB_REPOSITORY'],
        'sourceRef': os.environ['DEPLOY_CNB_SOURCE_REF'],
        'releaseCommitSha': os.environ['DEPLOY_CNB_RELEASE_SHA'],
    },
    'deployment': {
        'releaseId': os.environ['DEPLOY_RELEASE_ID'],
        'releaseDir': os.environ['DEPLOY_RELEASE_DIR'],
        'deployedAt': datetime.now(timezone.utc).isoformat(),
    },
}
config_dir.mkdir(parents=True, exist_ok=True)
path = config_dir / 'deployed-release.json'
temporary = config_dir / f'.deployed-release.json.tmp-{os.getpid()}'
temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
temporary.chmod(0o600)
temporary.replace(path)
PY
    release_committed=1
    rm -f "$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy"
    rm -f "$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json"
    find "$REMOTE_DIR/releases" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | xargs -r rm -rf
    pm2 status
}

main "$@"
