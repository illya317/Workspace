require_local_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[错误] 当前 CI 容器缺少命令: $cmd"
    exit 1
  fi
}

resolve_release_metadata() {
  local release_head
  local release_parent_count
  local injection_files

  RELEASE_BOOTSTRAP_BASE=""
  RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT=""
  RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID=""
  RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN=""
  RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION=""
  RELEASE_BOOTSTRAP_LEGACY_BUILD_ID=""
  RELEASE_BOOTSTRAP_CNB_REPOSITORY=""
  RELEASE_BOOTSTRAP_MIGRATION_COUNT=""
  RELEASE_BOOTSTRAP_MIGRATION_DIGEST=""
  RELEASE_GENESIS_FROM_SOURCE=""
  RELEASE_GENESIS_LEGACY_MIGRATION_COUNT=""
  RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST=""
  RELEASE_GENESIS_BASELINE_MIGRATION=""
  RELEASE_GENESIS_BASELINE_CHECKSUM=""
  RELEASE_DATABASE_REPLACEMENT_DUMP_SHA=""
  RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE=""
  RELEASE_DATABASE_REPLACEMENT_REMOTE_ARTIFACT=""
  RELEASE_DATABASE_REPLACEMENT_MIGRATION_COUNT=""
  RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET=""
  RELEASE_DATABASE_REPLACEMENT_PREPARED_AT=""
  RELEASE_TRANSPORT=""
  RELEASE_RECEIPT_RECOVERY_BASE=""
  RELEASE_RECEIPT_RECOVERY_SOURCE=""
  RELEASE_RECEIPT_RECOVERY_TREE=""
  RELEASE_RECEIPT_RECOVERY_MIGRATION_SET=""

  if [ "$RELEASE_METADATA_FILE" != ".cnb-release.json" ]; then
    echo "[错误] RELEASE_METADATA_FILE 必须是 .cnb-release.json"
    exit 1
  fi
  test -f "$RELEASE_METADATA_FILE"

  release_head="$(git rev-parse HEAD)"
  release_parent_count="$(git rev-list --parents -n 1 "$release_head" | awk '{print NF - 1}')"
  if [ "$release_parent_count" != "1" ]; then
    echo "[错误] CNB injection commit 必须恰好有一个 canonical source parent"
    exit 1
  fi
  RELEASE_SOURCE_SHA="$(git rev-parse HEAD^ 2>/dev/null)" || {
    echo "[错误] CNB 发布提交缺少 canonical source parent"
    exit 1
  }
  RELEASE_SOURCE_TREE="$(git rev-parse "${RELEASE_SOURCE_SHA}^{tree}")"
  injection_files="$(git diff-tree --no-commit-id --name-only -r "$release_head" | LC_ALL=C sort)"
  if [ "$injection_files" != $'.cnb-release.json\n.cnb.yml' ]; then
    echo "[错误] CNB injection commit 只能修改 .cnb.yml 与 .cnb-release.json"
    printf '%s\n' "$injection_files"
    exit 1
  fi

  metadata_values="$(node - "$RELEASE_METADATA_FILE" "$RELEASE_SOURCE_SHA" "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST" "$EXPECTED_CNB_REPOSITORY" "$RELEASE_SOURCE_BRANCH" "$release_head" <<'NODE'
const fs = require('node:fs');
const [file, sha, tree, contentDigest, repository, branch, injectionSha] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
const transport = metadata.transport?.kind;
const localTiming = metadata.deployment?.localTiming;
const localTimingKeys = 'releaseAttemptCount,releaseProcessSeconds,releaseProcessStartedAt,tenantSyncSeconds';
const validLocalTiming = localTiming
  && Object.keys(localTiming).sort().join(',') === localTimingKeys
  && Number.isSafeInteger(localTiming.releaseProcessSeconds)
  && localTiming.releaseProcessSeconds >= 0
  && Number.isSafeInteger(localTiming.releaseAttemptCount)
  && localTiming.releaseAttemptCount >= 1
  && typeof localTiming.releaseProcessStartedAt === 'string'
  && !Number.isNaN(Date.parse(localTiming.releaseProcessStartedAt))
  && Number.isSafeInteger(localTiming.tenantSyncSeconds)
  && localTiming.tenantSyncSeconds >= 0;
if (metadata.schemaVersion !== 1
  || metadata.source?.commitSha !== sha
  || metadata.source?.treeSha !== tree
  || metadata.source?.contentDigest !== contentDigest
  || metadata.releaseCandidate?.schemaVersion !== 2
  || metadata.releaseCandidate?.kind !== 'workspace-release-candidate'
  || metadata.releaseCandidate?.status !== 'prepared'
  || metadata.releaseCandidate?.command !== 'ops/publish.sh prepare'
  || metadata.releaseCandidate?.treeId !== tree
  || metadata.releaseCandidate?.contentDigest !== contentDigest
  || !['cnb', 'local'].includes(transport)
  || JSON.stringify(metadata.releaseCandidate?.checks) !== JSON.stringify([
    'cnb-release-config',
    'tenant-config-dry-run',
    'tenant-permission-docs',
  ])
  || !Number.isFinite(Date.parse(metadata.releaseCandidate?.completedAt ?? ''))
  || metadata.cnb?.repository !== repository
  || metadata.cnb?.sourceBranch !== branch
  || !Number.isSafeInteger(metadata.deployment?.startedAtEpochSeconds)
  || metadata.deployment.startedAtEpochSeconds <= 0
  || !validLocalTiming) {
  throw new Error('CNB release metadata does not match injection parent');
}
const bootstrap = metadata.deploymentBootstrap;
const genesis = metadata.deploymentGenesis;
const databaseReplacement = metadata.databaseReplacement;
const receiptRecovery = metadata.deployedReceiptRecovery;
if (bootstrap && genesis) throw new Error('bootstrap and genesis metadata are mutually exclusive');
if (receiptRecovery) {
  const recoveryKeys = Object.keys(receiptRecovery).sort().join(',');
  if (bootstrap || genesis || databaseReplacement
    || recoveryKeys !== 'baseSha,kind,migrationSetSha256,sourceSha,treeSha'
    || receiptRecovery.kind !== 'legacy-local-injection-source'
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.baseSha ?? '')
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.sourceSha ?? '')
    || !/^[0-9a-f]{40}$/.test(receiptRecovery.treeSha ?? '')
    || !/^[0-9a-f]{64}$/.test(receiptRecovery.migrationSetSha256 ?? '')
    || receiptRecovery.baseSha !== metadata.validation?.baseSha
    || receiptRecovery.sourceSha === sha) {
    throw new Error('deployed local receipt recovery metadata is invalid');
  }
}
if (databaseReplacement) {
  const replacementKeys = Object.keys(databaseReplacement).sort().join(',');
  const sourceKeys = Object.keys(databaseReplacement.source ?? {}).sort().join(',');
  const dumpKeys = Object.keys(databaseReplacement.dump ?? {}).sort().join(',');
  const databaseKeys = Object.keys(databaseReplacement.database ?? {}).sort().join(',');
  if (metadata.deployment?.target?.kind !== 'monolith' || bootstrap || genesis
    || replacementKeys !== 'database,dump,kind,preparedAt,schemaVersion,source,status'
    || databaseReplacement.schemaVersion !== 1
    || databaseReplacement.kind !== 'workspace-database-replacement'
    || databaseReplacement.status !== 'prepared'
    || sourceKeys !== 'commitSha,treeSha'
    || databaseReplacement.source.commitSha !== sha
    || databaseReplacement.source.treeSha !== tree
    || dumpKeys !== 'format,remoteArtifact,sha256,sizeBytes'
    || databaseReplacement.dump.format !== 'postgresql-custom'
    || !/^[0-9a-f]{64}$/.test(databaseReplacement.dump.sha256 ?? '')
    || databaseReplacement.dump.remoteArtifact !== `${sha}/${databaseReplacement.dump.sha256}/workspace-postgresql.dump`
    || !Number.isSafeInteger(databaseReplacement.dump.sizeBytes) || databaseReplacement.dump.sizeBytes < 1
    || databaseKeys !== 'migrationCount,migrationSetSha256'
    || !Number.isSafeInteger(databaseReplacement.database.migrationCount) || databaseReplacement.database.migrationCount < 1
    || !/^[0-9a-f]{64}$/.test(databaseReplacement.database.migrationSetSha256 ?? '')
    || !Number.isFinite(Date.parse(databaseReplacement.preparedAt ?? ''))) {
    throw new Error('database replacement metadata is invalid');
  }
}
if (genesis) {
  if (metadata.deployment?.target?.kind !== 'monolith'
    || Object.keys(genesis).sort().join(',') !== 'baselineChecksum,baselineMigration,fromSourceSha,legacyMigrationCount,legacyMigrationSetSha256'
    || !/^[0-9a-f]{40}$/.test(genesis.fromSourceSha ?? '')
    || genesis.fromSourceSha === sha
    || !Number.isSafeInteger(genesis.legacyMigrationCount)
    || genesis.legacyMigrationCount < 1
    || !/^[0-9a-f]{64}$/.test(genesis.legacyMigrationSetSha256 ?? '')
    || genesis.baselineMigration !== '00000000000000_sanitized_baseline'
    || !/^[0-9a-f]{64}$/.test(genesis.baselineChecksum ?? '')) {
    throw new Error('deployment genesis metadata is invalid');
  }
}
const values = [
  repository,
  branch,
  injectionSha,
  bootstrap?.baselineSha ?? '',
  bootstrap?.legacy?.cnbCommitSha ?? '',
  bootstrap?.legacy?.releaseId ?? '',
  bootstrap?.legacy?.cnbBuildSn ?? '',
  bootstrap?.legacy?.runtimeVersion ?? '',
  bootstrap?.legacy?.buildId ?? '',
  bootstrap?.legacy?.cnbRepository ?? '',
  String(bootstrap?.database?.migrationCount ?? ''),
  bootstrap?.database?.migrationSetSha256 ?? '',
  genesis?.fromSourceSha ?? '',
  String(genesis?.legacyMigrationCount ?? ''),
  genesis?.legacyMigrationSetSha256 ?? '',
  genesis?.baselineMigration ?? '',
  genesis?.baselineChecksum ?? '',
  databaseReplacement?.dump?.sha256 ?? '',
  String(databaseReplacement?.dump?.sizeBytes ?? ''),
  databaseReplacement?.dump?.remoteArtifact ?? '',
  String(databaseReplacement?.database?.migrationCount ?? ''),
  databaseReplacement?.database?.migrationSetSha256 ?? '',
  databaseReplacement?.preparedAt ?? '',
  transport,
  receiptRecovery?.baseSha ?? '',
  receiptRecovery?.sourceSha ?? '',
  receiptRecovery?.treeSha ?? '',
  receiptRecovery?.migrationSetSha256 ?? '',
];
process.stdout.write(values.join('\n'));
NODE
)"
  RELEASE_CNB_REPOSITORY="$(printf '%s\n' "$metadata_values" | sed -n '1p')"
  RELEASE_CNB_BRANCH="$(printf '%s\n' "$metadata_values" | sed -n '2p')"
  RELEASE_CNB_INJECTION_SHA="$(printf '%s\n' "$metadata_values" | sed -n '3p')"
  RELEASE_BOOTSTRAP_BASE="$(printf '%s\n' "$metadata_values" | sed -n '4p')"
  if [ -n "$RELEASE_BOOTSTRAP_BASE" ]; then
    RELEASE_BOOTSTRAP_LEGACY_CNB_COMMIT="$(printf '%s\n' "$metadata_values" | sed -n '5p')"
    RELEASE_BOOTSTRAP_LEGACY_RELEASE_ID="$(printf '%s\n' "$metadata_values" | sed -n '6p')"
    RELEASE_BOOTSTRAP_LEGACY_CNB_BUILD_SN="$(printf '%s\n' "$metadata_values" | sed -n '7p')"
    RELEASE_BOOTSTRAP_LEGACY_RUNTIME_VERSION="$(printf '%s\n' "$metadata_values" | sed -n '8p')"
    RELEASE_BOOTSTRAP_LEGACY_BUILD_ID="$(printf '%s\n' "$metadata_values" | sed -n '9p')"
    RELEASE_BOOTSTRAP_CNB_REPOSITORY="$(printf '%s\n' "$metadata_values" | sed -n '10p')"
    RELEASE_BOOTSTRAP_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '11p')"
    RELEASE_BOOTSTRAP_MIGRATION_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '12p')"
    if [ "$RELEASE_BOOTSTRAP_CNB_REPOSITORY" != "$EXPECTED_CNB_REPOSITORY" ]; then
      echo "[错误] production bootstrap CNB repository 与 canonical repository 不一致"
      exit 1
    fi
  fi
  RELEASE_GENESIS_FROM_SOURCE="$(printf '%s\n' "$metadata_values" | sed -n '13p')"
  if [ -n "$RELEASE_GENESIS_FROM_SOURCE" ]; then
    RELEASE_GENESIS_LEGACY_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '14p')"
    RELEASE_GENESIS_LEGACY_MIGRATION_DIGEST="$(printf '%s\n' "$metadata_values" | sed -n '15p')"
    RELEASE_GENESIS_BASELINE_MIGRATION="$(printf '%s\n' "$metadata_values" | sed -n '16p')"
    RELEASE_GENESIS_BASELINE_CHECKSUM="$(printf '%s\n' "$metadata_values" | sed -n '17p')"
  fi
  RELEASE_DATABASE_REPLACEMENT_DUMP_SHA="$(printf '%s\n' "$metadata_values" | sed -n '18p')"
  if [ -n "$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA" ]; then
    RELEASE_DATABASE_REPLACEMENT_DUMP_SIZE="$(printf '%s\n' "$metadata_values" | sed -n '19p')"
    RELEASE_DATABASE_REPLACEMENT_REMOTE_ARTIFACT="$(printf '%s\n' "$metadata_values" | sed -n '20p')"
    RELEASE_DATABASE_REPLACEMENT_MIGRATION_COUNT="$(printf '%s\n' "$metadata_values" | sed -n '21p')"
    RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET="$(printf '%s\n' "$metadata_values" | sed -n '22p')"
    RELEASE_DATABASE_REPLACEMENT_PREPARED_AT="$(printf '%s\n' "$metadata_values" | sed -n '23p')"
  fi
  RELEASE_TRANSPORT="$(printf '%s\n' "$metadata_values" | sed -n '24p')"
  RELEASE_RECEIPT_RECOVERY_BASE="$(printf '%s\n' "$metadata_values" | sed -n '25p')"
  if [ -n "$RELEASE_RECEIPT_RECOVERY_BASE" ]; then
    RELEASE_RECEIPT_RECOVERY_SOURCE="$(printf '%s\n' "$metadata_values" | sed -n '26p')"
    RELEASE_RECEIPT_RECOVERY_TREE="$(printf '%s\n' "$metadata_values" | sed -n '27p')"
    RELEASE_RECEIPT_RECOVERY_MIGRATION_SET="$(printf '%s\n' "$metadata_values" | sed -n '28p')"
  fi
  echo "==> 已验证 ${RELEASE_TRANSPORT} source: ${RELEASE_SOURCE_SHA:0:12} via ${RELEASE_CNB_INJECTION_SHA:0:12}"
}

run_local_checks() {
  echo "==> 安装 CI 依赖..."
  npm ci --no-audit --fund=false --loglevel=error

  echo "==> 运行静态检查..."
  npm run deploy:preflight:ci
  npm run docs:check
}

build_artifact() {
  ARTIFACT_PATH="${STANDALONE_ARTIFACT_PATH:-.next/workspace-standalone.tgz}"
  ARTIFACT_MANIFEST_PATH="${STANDALONE_MANIFEST_PATH:-.next/workspace-standalone.manifest.json}"
  echo "==> 校验 CNB 本次构建的 standalone 与 manifest..."
  test -s "$ARTIFACT_MANIFEST_PATH"
  test -s "$ARTIFACT_PATH"
  ARTIFACT_SHA="$(node - "$ARTIFACT_MANIFEST_PATH" "$ARTIFACT_PATH" "$RELEASE_SOURCE_TREE" "$RELEASE_CONTENT_DIGEST" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [manifestPath, artifactPath, sourceTree, contentDigest] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const artifactSha = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
if (manifest.schemaVersion !== 2
  || manifest.source?.treeSha !== sourceTree
  || manifest.source?.contentDigest !== contentDigest
  || manifest.build?.buildId !== contentDigest
  || manifest.artifact?.sha256 !== artifactSha) {
  throw new Error('CNB standalone identity or digest is invalid');
}
process.stdout.write(artifactSha);
NODE
)"
  RELEASE_MIGRATION_SET_SHA="$(node -e 'const m=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); const value=m.inputs?.migrationSetSha256; if (!/^[0-9a-f]{64}$/.test(value ?? "")) throw new Error("standalone migration-set digest is invalid"); process.stdout.write(value);' "$ARTIFACT_MANIFEST_PATH")"
  if [ -n "$RELEASE_DATABASE_REPLACEMENT_DUMP_SHA" ]; then
    [ "$RELEASE_DATABASE_REPLACEMENT_MIGRATION_SET" = "$RELEASE_MIGRATION_SET_SHA" ] || {
      echo "[错误] 数据库替换 receipt 的 migration set 与 CNB artifact 不一致"
      exit 1
    }
  fi
  ARTIFACT_MANIFEST_SHA="$(node -e 'const {createHash}=require("crypto"); const {readFileSync}=require("fs"); process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$ARTIFACT_MANIFEST_PATH")"
}
