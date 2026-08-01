#!/bin/bash

validate_local_deploy_credentials() {
  if [ -n "${KEY_CONTENT:-}" ]; then
    return 0
  fi
  if [ -n "${KEY:-}" ] && [ -f "$KEY" ]; then
    return 0
  fi
  if [ -n "${KEY:-}" ]; then
    echo "[错误] local deploy 凭据文件不存在: $KEY" >&2
  else
    echo "[错误] local deploy 必须在 prepare 前配置 KEY 或 KEY_CONTENT" >&2
  fi
  return 1
}

freeze_fast_validation_task_graph() {
  local plan_id="$1"
  local graph_file="$RELEASE_WORKTREE/.cache/release-task-graphs/$plan_id.json"
  mkdir -p "$(dirname "$graph_file")"
  (
    set -a
    # shellcheck source=/dev/null
    source "$RELEASE_CI_ENV_FILE"
    set +a
    cd "$RELEASE_WORKTREE"
    CI=1 \
      CHECK_SOURCE_PLAN_ID="$plan_id" \
      CHECK_RELEASE_MODE=fast \
      CHECK_TASK_GRAPH_FILE="$graph_file" \
      node scripts/check/with-check-lock.js -- node scripts/check/run-check-suite.mjs release-source
  )
  fast_graph_digest="$(node - "$graph_file" "$plan_id" <<'NODE'
const fs = require('node:fs');
const [file, planId] = process.argv.slice(2);
const graph = JSON.parse(fs.readFileSync(file, 'utf8'));
if (graph.kind !== 'workspace-check-task-graph' || graph.mode !== 'fast' || graph.sourcePlanId !== planId) {
  throw new Error('fast validation task graph identity is invalid');
}
if (!Array.isArray(graph.tasks) || graph.tasks.some((task) => !['skipped_by_fast', 'blocked'].includes(task.status))) {
  throw new Error('fast validation task graph contains executable task states');
}
if (!/^[0-9a-f]{64}$/.test(graph.graphDigest ?? '')) throw new Error('fast validation task graph digest is invalid');
process.stdout.write(graph.graphDigest);
NODE
)"
  fast_skip_evidence="$(node -e '
    const [taskGraphFile, taskGraphDigest] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({ taskGraphFile, taskGraphDigest }));
  ' ".cache/release-task-graphs/$plan_id.json" "$fast_graph_digest")"
  node "$RELEASE_SCRIPT_DIR/release/plan/release-plan.mjs" skip-fast-validation \
    --root "$RELEASE_PLAN_ROOT" --evidence "$fast_skip_evidence" >/dev/null
}

capture_release_configuration_identity() {
  WORKSPACE_CONFIG_DIR="${WORKSPACE_CONFIG_DIR:-${LOCAL_WORKSPACE_CONFIG_DIR:-}}"
  : "${WORKSPACE_CONFIG_DIR:?WORKSPACE_CONFIG_DIR not set in $OPS_ENV_FILE}"
  local tenant_root="$WORKSPACE_CONFIG_DIR/config/tenant"
  [ -d "$tenant_root" ] || { echo "[错误] 租户配置目录不存在: $tenant_root"; exit 1; }
  RELEASE_CONFIGURATION_DIGEST="$(node - "$tenant_root" <<'NODE'
const { createHash } = require('node:crypto');
const { lstatSync, readFileSync, readlinkSync, readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const hash = createHash('sha256');
function walk(directory) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      hash.update(`dir\0${relative}\0`);
      walk(absolute);
    } else if (stat.isSymbolicLink()) {
      hash.update(`link\0${relative}\0${readlinkSync(absolute)}\0`);
    } else if (stat.isFile()) {
      hash.update(`file\0${relative}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
    } else throw new Error(`unsupported tenant configuration entry: ${relative}`);
  }
}
walk(root);
process.stdout.write(hash.digest('hex'));
NODE
)"
  export RELEASE_CONFIGURATION_DIGEST
}
