import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

import type {
  SqlSettingCatalogGroup,
  SqlSettingCatalogItem,
  SqlSettingGroupKey,
  SqlSettingReviewStatus,
  SqlSettingsCatalog,
} from "../sql-settings-contract";

export interface SqlSettingRow {
  name: string;
  setting: string;
  unit: string | null;
  source: string;
  context: string;
  pendingRestart: boolean;
}

export interface SqlConnectionRow {
  databaseName: string;
  roleName: string;
  serverVersion: string;
  ssl: boolean;
  protocol: string | null;
  cipher: string | null;
}

interface SqlSettingDefinition {
  key: string;
  label: string;
  description: string;
  recommendedValue: string;
  assess: (value: string) => SqlSettingReviewStatus;
}

interface SqlSettingGroupDefinition {
  key: SqlSettingGroupKey;
  label: string;
  description: string;
  items: readonly SqlSettingDefinition[];
}

const informational = () => "informational" as const;
const equals = (expected: string) => (value: string): SqlSettingReviewStatus => (
  value.toLowerCase() === expected.toLowerCase() ? "aligned" : "review"
);
const positiveDuration = (value: string): SqlSettingReviewStatus => (
  Number.isFinite(Number(value)) && Number(value) > 0 ? "aligned" : "review"
);
const tlsVersion = (value: string): SqlSettingReviewStatus => (
  value === "TLSv1.2" || value === "TLSv1.3" ? "aligned" : "review"
);
const recoverableWal = (value: string): SqlSettingReviewStatus => (
  value === "replica" || value === "logical" ? "aligned" : "review"
);

const SQL_SETTING_GROUPS: readonly SqlSettingGroupDefinition[] = [
  {
    key: "connection",
    label: "连接与认证",
    description: "核对 TLS、密码摘要和数据库监听边界。",
    items: [
      { key: "ssl", label: "TLS", description: "数据库服务端是否启用 TLS。", recommendedValue: "开启", assess: equals("on") },
      { key: "ssl_min_protocol_version", label: "最低 TLS 版本", description: "服务端接受的最低 TLS 协议版本。", recommendedValue: "TLSv1.2 或更高", assess: tlsVersion },
      { key: "password_encryption", label: "密码摘要", description: "新密码写入系统目录时使用的摘要方式。", recommendedValue: "scram-sha-256", assess: equals("scram-sha-256") },
      { key: "listen_addresses", label: "监听地址", description: "数据库监听的网络地址；应与主机防火墙和 HBA 一起核对。", recommendedValue: "仅受控地址", assess: informational },
      { key: "port", label: "监听端口", description: "当前 PostgreSQL 服务端口。", recommendedValue: "纳入受控网络边界", assess: informational },
    ],
  },
  {
    key: "session",
    label: "查询与锁",
    description: "核对连接容量、查询超时和空闲事务保护。",
    items: [
      { key: "max_connections", label: "最大连接数", description: "整个实例允许的并发连接上限。", recommendedValue: "按连接池容量核定", assess: informational },
      { key: "statement_timeout", label: "语句超时", description: "当前角色单条 SQL 的最大执行时间。", recommendedValue: "非 0", assess: positiveDuration },
      { key: "lock_timeout", label: "锁等待超时", description: "当前角色等待数据库锁的最长时间。", recommendedValue: "非 0", assess: positiveDuration },
      { key: "idle_in_transaction_session_timeout", label: "空闲事务超时", description: "事务开启后无操作连接的清理时间。", recommendedValue: "非 0", assess: positiveDuration },
      { key: "idle_session_timeout", label: "空闲会话超时", description: "无事务空闲连接的清理时间。", recommendedValue: "非 0", assess: positiveDuration },
    ],
  },
  {
    key: "audit",
    label: "审计日志",
    description: "核对连接、断开、锁等待和 SQL 文本记录策略。",
    items: [
      { key: "log_connections", label: "记录连接", description: "记录数据库连接建立事件。", recommendedValue: "开启", assess: equals("on") },
      { key: "log_disconnections", label: "记录断开", description: "记录数据库会话断开事件。", recommendedValue: "开启", assess: equals("on") },
      { key: "log_lock_waits", label: "记录锁等待", description: "超过 deadlock_timeout 时记录锁等待。", recommendedValue: "开启", assess: equals("on") },
      { key: "deadlock_timeout", label: "死锁探测等待", description: "触发死锁检查和锁等待日志前的等待时间。", recommendedValue: "按业务并发核定", assess: informational },
      { key: "log_statement", label: "SQL 文本记录", description: "完整 SQL 可能包含敏感业务数据。", recommendedValue: "none", assess: equals("none") },
    ],
  },
  {
    key: "recovery",
    label: "备份与恢复",
    description: "核对 WAL、归档和检查点相关恢复基础。",
    items: [
      { key: "wal_level", label: "WAL 级别", description: "WAL 中保留的恢复与复制信息范围。", recommendedValue: "replica 或 logical", assess: recoverableWal },
      { key: "archive_mode", label: "WAL 归档", description: "是否启用持续归档；开启前必须具备已批准且已恢复验证的仓库。", recommendedValue: "具备恢复仓库后开启", assess: informational },
      { key: "full_page_writes", label: "完整页写入", description: "检查点后的首次页面变更是否写入完整页。", recommendedValue: "开启", assess: equals("on") },
      { key: "checkpoint_timeout", label: "检查点间隔", description: "自动检查点之间允许的最长时间。", recommendedValue: "按恢复目标核定", assess: informational },
      { key: "max_wal_size", label: "WAL 容量上限", description: "检查点之间允许积累的 WAL 目标上限。", recommendedValue: "按磁盘与恢复目标核定", assess: informational },
    ],
  },
];

function catalogItem(
  definition: SqlSettingDefinition,
  rowsByName: ReadonlyMap<string, SqlSettingRow>,
): SqlSettingCatalogItem {
  const row = rowsByName.get(definition.key);
  if (!row) {
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      currentValue: "运行角色无权读取",
      unit: null,
      recommendedValue: definition.recommendedValue,
      source: "least-privilege",
      context: "unknown",
      pendingRestart: false,
      status: "informational",
    };
  }
  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    currentValue: row.setting,
    unit: row.unit,
    recommendedValue: definition.recommendedValue,
    source: row.source,
    context: row.context,
    pendingRestart: row.pendingRestart,
    status: definition.assess(row.setting),
  };
}

export function buildSqlSettingsCatalog(
  connection: SqlConnectionRow,
  rows: readonly SqlSettingRow[],
  generatedAt = new Date().toISOString(),
): SqlSettingsCatalog {
  const rowsByName = new Map(rows.map((row) => [row.name, row]));
  const groups: SqlSettingCatalogGroup[] = SQL_SETTING_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    items: group.items.map((definition) => catalogItem(definition, rowsByName)),
  }));
  return {
    generatedAt,
    databaseName: connection.databaseName,
    roleName: connection.roleName,
    serverVersion: connection.serverVersion,
    transport: {
      ssl: connection.ssl,
      protocol: connection.protocol,
      cipher: connection.cipher,
    },
    groups,
  };
}

export async function listSqlSettingsCatalog(): Promise<SqlSettingsCatalog> {
  const [connection] = await prisma.$queryRaw<SqlConnectionRow[]>(Prisma.sql`
    SELECT
      current_database() AS "databaseName",
      current_user AS "roleName",
      current_setting('server_version') AS "serverVersion",
      COALESCE(ssl.ssl, FALSE) AS "ssl",
      ssl.version AS "protocol",
      ssl.cipher AS "cipher"
    FROM (SELECT pg_backend_pid() AS pid) current_connection
    LEFT JOIN pg_catalog.pg_stat_ssl ssl ON ssl.pid = current_connection.pid
  `);
  const rows = await prisma.$queryRaw<SqlSettingRow[]>(Prisma.sql`
    SELECT
      name::text AS "name",
      setting::text AS "setting",
      unit::text AS "unit",
      source::text AS "source",
      context::text AS "context",
      pending_restart AS "pendingRestart"
    FROM pg_catalog.pg_settings
    WHERE name IN (
      'ssl', 'ssl_min_protocol_version', 'password_encryption', 'listen_addresses', 'port',
      'max_connections', 'statement_timeout', 'lock_timeout',
      'idle_in_transaction_session_timeout', 'idle_session_timeout',
      'log_connections', 'log_disconnections', 'log_lock_waits', 'deadlock_timeout', 'log_statement',
      'wal_level', 'archive_mode', 'full_page_writes', 'checkpoint_timeout', 'max_wal_size'
    )
  `);

  if (!connection) throw new Error("SQL_SETTINGS_CONNECTION_IDENTITY_UNAVAILABLE");
  return buildSqlSettingsCatalog(connection, rows);
}
