#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";
import pg from "pg";

const BASELINE_MIGRATION = "20260713000000_postgresql_baseline";
const LOCK_NAME = "workspace-sqlite-postgresql-migration";
const ALLOWED_TARGET_ONLY_COLUMNS = new Map([
  ["ReclassResult", new Set(["voucherItemIdSnapshot", "ruleIdSnapshot"])],
]);
const ALLOWED_SOURCE_ORPHANS = new Set([
  "ReclassResult.voucherItemId->FinanceVoucherItem.id",
  "ReclassResult.ruleId->FinanceReclassRule.id",
  "WorkReportItem.workPlanId->WorkPlan.id",
]);
const POSTGRESQL_INTEGER_MIN = -2_147_483_648;
const POSTGRESQL_INTEGER_MAX = 2_147_483_647;
const LEGACY_MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../prisma/migrations-sqlite-legacy");
const LEGACY_MIGRATIONS_WITHOUT_LEDGER_CHECKSUM = new Map([
  ["20260530000000_add_budget_version_v1", "5d3e5793de1a985c39d67f5d9f4b6060a58d204a3e6768ef93b0ed9434e36e43"],
  ["20260530000001_make_version_required", "c99d94ef0d1b49d92305560e77bc90fc643b9de3df2cd4253063977f4756c815"],
]);

pg.types.setTypeParser(1114, (value) => value);

function parseArgs(argv) {
  const options = { execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (["--sqlite", "--target", "--manifest", "--expected-source-sha256"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options[arg.slice(2).replaceAll("-", "_")] = value;
      index += 1;
      continue;
    }
    if (arg === "--help") return { help: true };
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  npm run db:migrate:sqlite-to-postgresql -- --sqlite <snapshot.db> --manifest <manifest.json>",
    "  npm run db:migrate:sqlite-to-postgresql -- --sqlite <snapshot.db> --manifest <manifest.json> --execute",
    "",
    "Options:",
    "  --target <url>                    Defaults to DIRECT_URL, then DATABASE_URL",
    "  --expected-source-sha256 <hash>   Abort if the frozen source differs",
    "  --execute                         Import into an empty PostgreSQL baseline",
    "",
    "Dry-run is the default and never writes PostgreSQL application data.",
  ].join("\n");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function assertStandaloneSqliteSource(path) {
  const companions = [`${path}-wal`, `${path}-shm`, `${path}-journal`].filter((candidate) => existsSync(candidate));
  if (companions.length > 0) {
    throw new Error(
      `SQLite source is not a standalone backup; companion files are present: ${companions.join(", ")}`,
    );
  }
}

function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString().slice(0, -1);
  if (typeof value === "number" || typeof value === "bigint") {
    const date = new Date(Number(value));
    if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp value: ${value}`);
    return date.toISOString().slice(0, -1);
  }

  let text = String(value).trim();
  if (/^-?\d+$/.test(text)) return normalizeTimestamp(Number(text));
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(text)) {
    const date = new Date(text);
    if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp value: ${value}`);
    return date.toISOString().slice(0, -1);
  }

  text = text.replace(" ", "T");
  const match = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid timestamp value: ${value}`);
  return `${match[1]}.${(match[2] ?? "").padEnd(3, "0").slice(0, 3)}`;
}

function convertValue(value, column, tableName) {
  if (value === null || value === undefined) {
    if (column.is_nullable === "NO") {
      throw new Error(`${tableName}.${column.column_name} is required but source value is null`);
    }
    return null;
  }
  switch (column.data_type) {
    case "boolean":
      if ([true, 1, 1n, "1", "true"].includes(value)) return true;
      if ([false, 0, 0n, "0", "false"].includes(value)) return false;
      throw new Error(`${tableName}.${column.column_name} has invalid boolean value ${value}`);
    case "integer": {
      const integer = Number(value);
      if (!Number.isSafeInteger(integer) || integer < POSTGRESQL_INTEGER_MIN || integer > POSTGRESQL_INTEGER_MAX) {
        throw new Error(`${tableName}.${column.column_name} has invalid integer value ${value}`);
      }
      return integer;
    }
    case "double precision": {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        throw new Error(`${tableName}.${column.column_name} has invalid number value ${value}`);
      }
      return number;
    }
    case "timestamp without time zone":
      return normalizeTimestamp(value);
    case "text":
      return String(value);
    default:
      throw new Error(`Unsupported PostgreSQL type ${column.data_type} at ${tableName}.${column.column_name}`);
  }
}

function hashRows(rowHashes) {
  rowHashes.sort();
  return createHash("sha256").update(rowHashes.join("\n")).digest("hex");
}

function rowHash(values) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function sqliteTableNames(sqlite) {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name")
    .all()
    .map(({ name }) => name);
}

function sqliteColumns(sqlite, tableName) {
  return sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map(({ name }) => name);
}

function sourceMigrationState(sqlite) {
  const exists = sqlite
    .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
    .get().count;
  if (!exists) throw new Error("Source does not contain _prisma_migrations");
  const rows = sqlite
    .prepare('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')
    .all();
  const unfinished = rows.filter((row) => row.finished_at === null && row.rolled_back_at === null);
  if (unfinished.length > 0) {
    throw new Error(`Source has unfinished migrations: ${unfinished.map((row) => row.migration_name).join(", ")}`);
  }
  const expected = readdirSync(LEGACY_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expectedChecksums = new Map(expected.map((name) => {
    const sqlPath = join(LEGACY_MIGRATIONS_DIR, name, "migration.sql");
    if (!existsSync(sqlPath)) throw new Error(`Archived SQLite migration is missing migration.sql: ${name}`);
    const checksum = createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
    return [name, checksum];
  }));
  const successfulRows = rows
    .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
    .map((row) => ({ migrationName: String(row.migration_name), checksum: row.checksum == null ? "" : String(row.checksum) }))
    .sort((left, right) => left.migrationName.localeCompare(right.migrationName));
  const successful = successfulRows.map((row) => row.migrationName);
  const successfulSet = new Set(successful);
  const duplicates = successful.filter((name, index) => index > 0 && successful[index - 1] === name);
  const missing = expected.filter((name) => !successfulSet.has(name));
  const unknown = successful.filter((name) => !expected.includes(name));
  const checksumMismatches = successfulRows
    .filter((row) => row.checksum !== "" && expectedChecksums.get(row.migrationName) !== row.checksum)
    .map((row) => row.migrationName);
  const blankChecksumRows = successfulRows.filter((row) => row.checksum === "");
  const unexpectedBlankChecksums = blankChecksumRows
    .filter((row) => !LEGACY_MIGRATIONS_WITHOUT_LEDGER_CHECKSUM.has(row.migrationName))
    .map((row) => row.migrationName);
  const pinnedChecksumMismatches = blankChecksumRows
    .filter((row) => LEGACY_MIGRATIONS_WITHOUT_LEDGER_CHECKSUM.get(row.migrationName) !== expectedChecksums.get(row.migrationName))
    .map((row) => row.migrationName);
  if (
    duplicates.length > 0
    || missing.length > 0
    || unknown.length > 0
    || checksumMismatches.length > 0
    || unexpectedBlankChecksums.length > 0
    || pinnedChecksumMismatches.length > 0
  ) {
    throw new Error(
      `Source SQLite migration set mismatch; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}; duplicates=${[...new Set(duplicates)].join(",") || "none"}; checksumMismatches=${checksumMismatches.join(",") || "none"}; unexpectedBlankChecksums=${unexpectedBlankChecksums.join(",") || "none"}; pinnedChecksumMismatches=${pinnedChecksumMismatches.join(",") || "none"}`,
    );
  }
  return {
    ledgerRows: rows.length,
    successfulCount: successful.length,
    ledgerChecksumVerifiedCount: successfulRows.length - blankChecksumRows.length,
    pinnedLegacyChecksumVerifiedCount: blankChecksumRows.length,
    rolledBackCount: rows.filter((row) => row.rolled_back_at !== null).length,
    unfinished: 0,
    latestByName: successful.at(-1) ?? null,
  };
}

function sourceDataInvariants(sqlite) {
  const count = (sql) => Number(sqlite.prepare(sql).get().count);
  const invariants = {
    invalidDepartmentDescriptionJson: count(`
      SELECT count(*) AS count
      FROM "DepartmentDescription"
      WHERE "details" IS NOT NULL AND NOT json_valid("details")
    `),
    departmentDescriptionLegacyKeys: count(`
      SELECT count(*) AS count
      FROM "DepartmentDescription"
      WHERE "details" IS NOT NULL AND json_valid("details")
        AND (
          json_type("details", '$."基本信息"."负责人"') IS NOT NULL
          OR json_type("details", '$."基本信息"."主管领导"') IS NOT NULL
          OR json_type("details", '$."基本信息"."岗位编制"') IS NOT NULL
          OR json_type("details", '$."基本信息"."定编岗位"') IS NOT NULL
        )
    `),
    libraryAliasTags: count(`SELECT count(*) AS count FROM "LibraryTag" WHERE "key" = '合同协议'`),
    libraryAliasCandidates: count(`SELECT count(*) AS count FROM "LibraryTagCandidate" WHERE "proposedKey" = '合同协议'`),
    legacyAdHocWorkPlans: count(`SELECT count(*) AS count FROM "WorkPlan" WHERE "kind" = 'ad_hoc'`),
  };
  const failed = Object.entries(invariants).filter(([, value]) => value !== 0);
  if (failed.length > 0) {
    throw new Error(`Source data invariants failed: ${failed.map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }
  return invariants;
}

function sourceForeignKeyAudit(sqlite) {
  const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
  const summary = new Map();
  const unexpected = [];
  for (const violation of violations) {
    const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(violation.table)})`).all();
    const foreignKey = foreignKeys.find((item) => item.id === violation.fkid);
    if (!foreignKey) throw new Error(`Cannot resolve SQLite FK ${violation.table}#${violation.fkid}`);
    const key = `${violation.table}.${foreignKey.from}->${violation.parent}.${foreignKey.to}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
    if (!ALLOWED_SOURCE_ORPHANS.has(key)) unexpected.push(`${key} rowid=${violation.rowid}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`Unexpected SQLite foreign-key violations:\n${unexpected.slice(0, 20).join("\n")}`);
  }
  return Object.fromEntries([...summary.entries()].sort());
}

function buildRepairContext(sqlite) {
  const idSet = (table) => new Set(sqlite.prepare(`SELECT id FROM ${quoteIdentifier(table)}`).all().map(({ id }) => Number(id)));
  const countMissing = (childTable, childColumn, parentTable) =>
    Number(
      sqlite
        .prepare(`
          SELECT count(*) AS count
          FROM ${quoteIdentifier(childTable)} AS child
          LEFT JOIN ${quoteIdentifier(parentTable)} AS parent ON parent.id = child.${quoteIdentifier(childColumn)}
          WHERE child.${quoteIdentifier(childColumn)} IS NOT NULL AND parent.id IS NULL
        `)
        .get().count,
    );
  const workReportItems = sqlite
    .prepare('SELECT id, reportId, sortOrder FROM "WorkReportItem" ORDER BY reportId, sortOrder, id')
    .all()
    .map((row) => ({ id: Number(row.id), reportId: Number(row.reportId), sortOrder: Number(row.sortOrder) }));
  const affectedReportIds = new Set(workReportItems
    .filter(({ sortOrder }) => sortOrder < POSTGRESQL_INTEGER_MIN || sortOrder > POSTGRESQL_INTEGER_MAX)
    .map(({ reportId }) => reportId));
  const normalizedWorkReportSortOrders = new Map();
  const reportRanks = new Map();
  for (const row of workReportItems) {
    if (!affectedReportIds.has(row.reportId)) continue;
    const rank = (reportRanks.get(row.reportId) ?? 0) + 1;
    reportRanks.set(row.reportId, rank);
    normalizedWorkReportSortOrders.set(row.id, rank * 10);
  }
  const normalizedWorkReportSortOrderCount = workReportItems.filter((row) => {
    const normalized = normalizedWorkReportSortOrders.get(row.id);
    return normalized !== undefined && normalized !== row.sortOrder;
  }).length;
  return {
    voucherItemIds: idSet("FinanceVoucherItem"),
    reclassRuleIds: idSet("FinanceReclassRule"),
    workPlanIds: idSet("WorkPlan"),
    normalizedWorkReportSortOrders,
    counts: { missingReclassVoucherItem: 0, missingReclassRule: 0, missingWorkReportPlan: 0, normalizedWorkReportSortOrder: 0 },
    expectedCounts: {
      missingReclassVoucherItem: countMissing("ReclassResult", "voucherItemId", "FinanceVoucherItem"),
      missingReclassRule: countMissing("ReclassResult", "ruleId", "FinanceReclassRule"),
      missingWorkReportPlan: countMissing("WorkReportItem", "workPlanId", "WorkPlan"),
      normalizedWorkReportSortOrder: normalizedWorkReportSortOrderCount,
    },
  };
}

function transformRow(tableName, sourceRow, targetColumns, repair) {
  const raw = { ...sourceRow };
  if (tableName === "ReclassResult") {
    raw.voucherItemIdSnapshot = raw.voucherItemId;
    raw.ruleIdSnapshot = raw.ruleId;
    if (!repair.voucherItemIds.has(Number(raw.voucherItemId))) {
      raw.voucherItemId = null;
      repair.counts.missingReclassVoucherItem += 1;
    }
    if (raw.ruleId !== null && !repair.reclassRuleIds.has(Number(raw.ruleId))) {
      raw.ruleId = null;
      repair.counts.missingReclassRule += 1;
    }
  }
  if (tableName === "WorkReportItem") {
    if (raw.workPlanId !== null && !repair.workPlanIds.has(Number(raw.workPlanId))) {
      raw.workPlanId = null;
      repair.counts.missingWorkReportPlan += 1;
    }
    const normalizedSortOrder = repair.normalizedWorkReportSortOrders.get(Number(raw.id));
    if (normalizedSortOrder !== undefined && normalizedSortOrder !== Number(raw.sortOrder)) {
      raw.sortOrder = normalizedSortOrder;
      repair.counts.normalizedWorkReportSortOrder += 1;
    }
  }
  return targetColumns.map((column) => convertValue(raw[column.column_name], column, tableName));
}

async function targetMetadata(client) {
  const result = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
    ORDER BY table_name, ordinal_position
  `);
  const tables = new Map();
  for (const column of result.rows) {
    const columns = tables.get(column.table_name) ?? [];
    columns.push(column);
    tables.set(column.table_name, columns);
  }
  return tables;
}

function validateShape(sqlite, sourceTables, targetTables) {
  const targetNames = [...targetTables.keys()].sort();
  if (JSON.stringify(sourceTables) !== JSON.stringify(targetNames)) {
    const sourceOnly = sourceTables.filter((name) => !targetTables.has(name));
    const targetOnly = targetNames.filter((name) => !sourceTables.includes(name));
    throw new Error(`Table mismatch. source-only=${sourceOnly.join(",") || "none"}; target-only=${targetOnly.join(",") || "none"}`);
  }
  for (const tableName of sourceTables) {
    const source = new Set(sqliteColumns(sqlite, tableName));
    const target = new Set(targetTables.get(tableName).map((column) => column.column_name));
    const allowed = ALLOWED_TARGET_ONLY_COLUMNS.get(tableName) ?? new Set();
    const sourceOnly = [...source].filter((name) => !target.has(name));
    const targetOnly = [...target].filter((name) => !source.has(name) && !allowed.has(name));
    if (sourceOnly.length > 0 || targetOnly.length > 0) {
      throw new Error(`${tableName} column mismatch. source-only=${sourceOnly.join(",") || "none"}; target-only=${targetOnly.join(",") || "none"}`);
    }
  }
}

async function validateEmptyTarget(client, targetTables) {
  const nonempty = [];
  for (const tableName of targetTables.keys()) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(tableName)}`);
    if (result.rows[0].count !== 0) nonempty.push(`${tableName}=${result.rows[0].count}`);
  }
  if (nonempty.length > 0) throw new Error(`Target application tables are not empty: ${nonempty.join(", ")}`);
}

async function validateTargetBaseline(client) {
  const result = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at
  `);
  if (result.rows.length !== 1 || result.rows[0].migration_name !== BASELINE_MIGRATION || !result.rows[0].finished_at || result.rows[0].rolled_back_at) {
    throw new Error(`Target migration history must contain only ${BASELINE_MIGRATION}`);
  }
}

function approximateBytes(values) {
  return values.reduce((total, value) => total + (value === null ? 1 : Buffer.byteLength(String(value))), 0);
}

async function insertBatch(client, tableName, columns, batch) {
  if (batch.length === 0) return;
  const values = [];
  const groups = batch.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(",")})`;
  });
  const columnSql = columns.map((column) => quoteIdentifier(column.column_name)).join(",");
  await client.query(`INSERT INTO ${quoteIdentifier(tableName)} (${columnSql}) VALUES ${groups.join(",")}`, values);
}

async function importTables({ client, sqlite, sourceTables, targetTables, execute, repair }) {
  const tableResults = {};
  for (const tableName of sourceTables) {
    const columns = targetTables.get(tableName);
    const rowHashes = [];
    let count = 0;
    let batch = [];
    let batchBytes = 0;
    const maxRows = Math.max(1, Math.min(250, Math.floor(50_000 / columns.length)));
    const statement = sqlite.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    for (const sourceRow of statement.iterate()) {
      const values = transformRow(tableName, sourceRow, columns, repair);
      rowHashes.push(rowHash(values));
      count += 1;
      if (execute) {
        const bytes = approximateBytes(values);
        if (batch.length > 0 && (batch.length >= maxRows || batchBytes + bytes > 4_000_000)) {
          await insertBatch(client, tableName, columns, batch);
          batch = [];
          batchBytes = 0;
        }
        batch.push(values);
        batchBytes += bytes;
      }
    }
    if (execute) await insertBatch(client, tableName, columns, batch);
    tableResults[tableName] = { sourceCount: count, sourceSemanticSha256: hashRows(rowHashes) };
    process.stdout.write(`${execute ? "imported" : "checked"} ${tableName}: ${count}\n`);
  }
  return tableResults;
}

async function verifyTargetData(client, targetTables, tableResults) {
  for (const [tableName, columns] of targetTables.entries()) {
    const columnSql = columns.map((column) => quoteIdentifier(column.column_name)).join(",");
    const result = await client.query(`SELECT ${columnSql} FROM ${quoteIdentifier(tableName)}`);
    const hashes = result.rows.map((row) => {
      const values = columns.map((column) => convertValue(row[column.column_name], column, tableName));
      return rowHash(values);
    });
    const targetHash = hashRows(hashes);
    const expected = tableResults[tableName];
    if (result.rowCount !== expected.sourceCount || targetHash !== expected.sourceSemanticSha256) {
      throw new Error(`${tableName} verification failed: source=${expected.sourceCount}/${expected.sourceSemanticSha256}, target=${result.rowCount}/${targetHash}`);
    }
    expected.targetCount = result.rowCount;
    expected.targetSemanticSha256 = targetHash;
  }
}

async function restoreSequences(client, sqlite, targetTables) {
  const sqliteSequences = new Map(
    sqlite.prepare("SELECT name, seq FROM sqlite_sequence").all().map(({ name, seq }) => [name, Number(seq)]),
  );
  const restored = [];
  for (const [tableName, columns] of targetTables.entries()) {
    for (const column of columns.filter((item) => item.column_default?.startsWith("nextval("))) {
      const sequenceResult = await client.query("SELECT pg_get_serial_sequence($1, $2) AS name", [quoteIdentifier(tableName), column.column_name]);
      const sequenceName = sequenceResult.rows[0].name;
      if (!sequenceName) throw new Error(`Cannot resolve sequence for ${tableName}.${column.column_name}`);
      const maxResult = await client.query(`SELECT max(${quoteIdentifier(column.column_name)})::bigint AS max FROM ${quoteIdentifier(tableName)}`);
      const max = Number(maxResult.rows[0].max ?? 0);
      const highWater = Math.max(max, sqliteSequences.get(tableName) ?? 0);
      await client.query("SELECT setval($1::regclass, $2::bigint, $3::boolean)", [sequenceName, highWater || 1, highWater > 0]);
      restored.push({ table: tableName, column: column.column_name, sequence: sequenceName, highWater, isCalled: highWater > 0 });
    }
  }
  return restored;
}

async function targetConstraintState(client) {
  const result = await client.query(`
    SELECT
      count(*) FILTER (WHERE contype = 'f')::int AS foreign_keys,
      count(*) FILTER (WHERE contype = 'f' AND condeferrable AND condeferred)::int AS deferred_foreign_keys,
      count(*) FILTER (WHERE NOT convalidated)::int AS unvalidated
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  `);
  return result.rows[0];
}

async function writeManifest(path, manifest) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!options.sqlite || !options.manifest) throw new Error(`--sqlite and --manifest are required\n\n${usage()}`);
  const targetUrl = options.target ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!targetUrl || !/^postgres(?:ql)?:\/\//.test(targetUrl)) throw new Error("A PostgreSQL --target, DIRECT_URL, or DATABASE_URL is required");

  const sourcePath = resolve(options.sqlite);
  const manifestPath = resolve(options.manifest);
  assertStandaloneSqliteSource(sourcePath);
  const sourceBeforeStat = await stat(sourcePath);
  if (!sourceBeforeStat.isFile()) throw new Error(`SQLite source is not a regular file: ${sourcePath}`);
  const sourceShaBefore = await sha256File(sourcePath);
  if (options.expected_source_sha256 && sourceShaBefore !== options.expected_source_sha256.toLowerCase()) {
    throw new Error(`Source SHA-256 mismatch: expected ${options.expected_source_sha256}, got ${sourceShaBefore}`);
  }

  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  sqlite.exec("PRAGMA query_only = ON");
  assertStandaloneSqliteSource(sourcePath);
  const client = new pg.Client({ connectionString: targetUrl, application_name: "workspace-sqlite-postgresql-migration" });
  const startedAt = new Date().toISOString();
  let locked = false;
  let transaction = false;
  try {
    const integrity = sqlite.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    if (integrity.length !== 1 || integrity[0] !== "ok") throw new Error(`SQLite integrity_check failed: ${integrity.join("; ")}`);
    const sourceMigrations = sourceMigrationState(sqlite);
    const sourceInvariants = sourceDataInvariants(sqlite);
    const sourceForeignKeys = sourceForeignKeyAudit(sqlite);
    const sourceTables = sqliteTableNames(sqlite);
    const repair = buildRepairContext(sqlite);

    await client.connect();
    await client.query("SET TIME ZONE 'UTC'");
    const lockResult = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [LOCK_NAME]);
    if (!lockResult.rows[0].locked) throw new Error("Another SQLite-to-PostgreSQL migration holds the advisory lock");
    locked = true;
    await validateTargetBaseline(client);
    const targetTables = await targetMetadata(client);
    validateShape(sqlite, sourceTables, targetTables);
    await validateEmptyTarget(client, targetTables);
    const targetIdentity = (await client.query("SELECT current_database() AS database, current_user AS owner, inet_server_addr()::text AS host, inet_server_port() AS port")).rows[0];

    if (options.execute) {
      await client.query("BEGIN");
      transaction = true;
      await client.query("SET CONSTRAINTS ALL DEFERRED");
    }
    const tables = await importTables({ client, sqlite, sourceTables, targetTables, execute: options.execute, repair });
    if (JSON.stringify(repair.counts) !== JSON.stringify(repair.expectedCounts)) {
      throw new Error(`Repair count mismatch: transformed=${JSON.stringify(repair.counts)}, expected=${JSON.stringify(repair.expectedCounts)}`);
    }

    let sequences = [];
    let constraints = await targetConstraintState(client);
    if (options.execute) {
      sequences = await restoreSequences(client, sqlite, targetTables);
      await verifyTargetData(client, targetTables, tables);
      const sourceShaDuringTransaction = await sha256File(sourcePath);
      const sourceAfterStat = await stat(sourcePath);
      assertStandaloneSqliteSource(sourcePath);
      if (sourceShaDuringTransaction !== sourceShaBefore || sourceAfterStat.size !== sourceBeforeStat.size || sourceAfterStat.mtimeMs !== sourceBeforeStat.mtimeMs) {
        throw new Error("Frozen SQLite source changed during import; rolling back PostgreSQL transaction");
      }
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      constraints = await targetConstraintState(client);
      if (constraints.unvalidated !== 0 || constraints.foreign_keys !== constraints.deferred_foreign_keys) {
        throw new Error(`PostgreSQL constraint validation failed: ${JSON.stringify(constraints)}`);
      }
      await client.query("COMMIT");
      transaction = false;
    }

    const sourceShaAfter = await sha256File(sourcePath);
    assertStandaloneSqliteSource(sourcePath);
    if (sourceShaAfter !== sourceShaBefore) throw new Error("SQLite source hash changed during migration");
    const manifest = {
      formatVersion: 1,
      status: "success",
      mode: options.execute ? "execute" : "dry-run",
      startedAt,
      completedAt: new Date().toISOString(),
      source: {
        path: sourcePath,
        bytes: sourceBeforeStat.size,
        sha256Before: sourceShaBefore,
        sha256After: sourceShaAfter,
        integrityCheck: "ok",
        migrations: sourceMigrations,
        dataInvariants: sourceInvariants,
        allowedForeignKeyRepairs: sourceForeignKeys,
      },
      target: {
        ...targetIdentity,
        baselineMigration: BASELINE_MIGRATION,
        constraints,
      },
      repairs: repair.counts,
      tables,
      sequences,
    };
    await writeManifest(manifestPath, manifest);
    process.stdout.write(`${options.execute ? "Migration" : "Dry-run"} succeeded. Manifest: ${manifestPath}\n`);
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]).catch(() => undefined);
    await client.end().catch(() => undefined);
    sqlite.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
