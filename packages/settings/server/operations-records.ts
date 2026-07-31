import "server-only";

import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";

import type {
  OperationsRecord,
  OperationsRecordProviderCoverage,
  OperationsRecordsQuery,
  OperationsRecordsResponse,
  RelationPolicyOperationsRecordSource,
} from "../operations-records-contract";
import type { SqlSettingOperation } from "../sql-settings-contract";
import { listSqlSettingOperations } from "./sql-settings-operations";

export const OPERATIONS_RECORDS_WINDOW_DAYS = 180;
const SQL_OPERATION_LIMIT = 100;
const RELATION_POLICY_REVISION_LIMIT = 1_000;

const PROVIDERS: OperationsRecordProviderCoverage[] = [
  {
    source: "sql-settings",
    label: "SQL 设置",
    provenance: "SystemConfig · HMAC 验签请求",
    maximumRecords: SQL_OPERATION_LIMIT,
  },
  {
    source: "relation-policy",
    label: "关系策略",
    provenance: "RelationPolicyRevision · 追加式修订",
    maximumRecords: RELATION_POLICY_REVISION_LIMIT,
  },
];

const SQL_SETTING_LABELS: Record<string, string> = {
  statement_timeout: "语句超时",
  lock_timeout: "锁等待超时",
  idle_in_transaction_session_timeout: "空闲事务超时",
};

function validIsoTimestamp(value: string, field: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`OPERATIONS_RECORD_INVALID_TIMESTAMP:${field}`);
  return new Date(time).toISOString();
}

function sqlStatus(status: SqlSettingOperation["status"]): OperationsRecord["status"] {
  return status === "reconciliation_required" ? "attention" : status;
}

function actorLabel(user: { username: string; alias: string | null } | null | undefined, userId: number | null) {
  return user?.alias?.trim() || user?.username || (userId ? `用户 #${userId}` : "系统");
}

function sqlRecord(
  operation: SqlSettingOperation,
  users: ReadonlyMap<number, { username: string; alias: string | null }>,
): OperationsRecord {
  const rotatePassword = operation.operation === "rotate-runtime-password";
  return {
    id: `sql-settings:${operation.id}`,
    source: "sql-settings",
    sourceLabel: "SQL 设置",
    provenance: "SystemConfig · HMAC 验签请求",
    action: operation.operation,
    actionLabel: rotatePassword ? "轮换数据库密码" : "调整 SQL 运行参数",
    status: sqlStatus(operation.status),
    target: rotatePassword
      ? "应用数据库密码"
      : SQL_SETTING_LABELS[operation.settingKey ?? ""] ?? operation.settingKey ?? "SQL 运行参数",
    actorUserId: operation.requestedByUserId,
    actorLabel: actorLabel(users.get(operation.requestedByUserId), operation.requestedByUserId),
    reason: operation.reason || null,
    result: operation.message,
    occurredAt: validIsoTimestamp(operation.createdAt, operation.id),
    completedAt: operation.completedAt ? validIsoTimestamp(operation.completedAt, `${operation.id}:completed`) : null,
  };
}

function relationPolicyRecord(row: RelationPolicyOperationsRecordSource): OperationsRecord {
  const reset = row.changeKind === "reset";
  return {
    id: `relation-policy:${row.id}`,
    source: "relation-policy",
    sourceLabel: "关系策略",
    provenance: "RelationPolicyRevision · 追加式修订",
    action: reset ? "reset" : "upsert",
    actionLabel: reset ? "重置关系策略" : "更新关系策略",
    status: "succeeded",
    target: row.policyKey,
    actorUserId: row.actorUserId,
    actorLabel: actorLabel(row.actor, row.actorUserId),
    reason: row.reason,
    result: `版本 ${row.version}`,
    occurredAt: row.createdAt.toISOString(),
    completedAt: row.createdAt.toISOString(),
  };
}

export function buildOperationsRecordsResponse(input: {
  query: OperationsRecordsQuery;
  sqlOperations: SqlSettingOperation[];
  relationPolicyRevisions: RelationPolicyOperationsRecordSource[];
  users: ReadonlyMap<number, { username: string; alias: string | null }>;
  generatedAt: Date;
}): OperationsRecordsResponse {
  const windowStart = new Date(
    input.generatedAt.getTime() - OPERATIONS_RECORDS_WINDOW_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const records = [
    ...input.sqlOperations.map((operation) => sqlRecord(operation, input.users)),
    ...input.relationPolicyRevisions.map(relationPolicyRecord),
  ]
    .filter((record) => record.occurredAt >= windowStart)
    .filter((record) => input.query.source === "all" || record.source === input.query.source)
    .filter((record) => input.query.status === "all" || record.status === input.query.status)
    .filter((record) => !input.query.query || matchSearchFields(record, input.query.query, [
      "sourceLabel",
      "actionLabel",
      "target",
      "actorLabel",
      "reason",
      "result",
    ]))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  const totalPages = Math.max(1, Math.ceil(records.length / input.query.pageSize));
  const page = Math.min(input.query.page, totalPages - 1);
  const start = page * input.query.pageSize;

  return {
    records: records.slice(start, start + input.query.pageSize),
    page,
    pageSize: input.query.pageSize,
    total: records.length,
    totalPages,
    generatedAt: input.generatedAt.toISOString(),
    coverage: {
      windowDays: OPERATIONS_RECORDS_WINDOW_DAYS,
      providers: PROVIDERS.map((provider) => ({ ...provider })),
    },
  };
}

export async function listOperationsRecords(query: OperationsRecordsQuery): Promise<OperationsRecordsResponse> {
  const generatedAt = new Date();
  const windowStart = new Date(generatedAt.getTime() - OPERATIONS_RECORDS_WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  const includeSql = query.source === "all" || query.source === "sql-settings";
  const includeRelations = query.source === "all" || query.source === "relation-policy";
  const [sqlOperations, relationPolicyRevisions] = await Promise.all([
    includeSql ? listSqlSettingOperations(SQL_OPERATION_LIMIT) : Promise.resolve([]),
    includeRelations
      ? prisma.relationPolicyRevision.findMany({
          where: { createdAt: { gte: windowStart } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: RELATION_POLICY_REVISION_LIMIT,
          select: {
            id: true,
            policyKey: true,
            version: true,
            changeKind: true,
            reason: true,
            actorUserId: true,
            createdAt: true,
            actor: { select: { username: true, alias: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const sqlActorIds = [...new Set(sqlOperations.map((operation) => operation.requestedByUserId))];
  const userRows = sqlActorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: sqlActorIds } },
        select: { id: true, username: true, alias: true },
      })
    : [];
  const users = new Map(userRows.map(({ id, username, alias }) => [id, { username, alias }]));

  return buildOperationsRecordsResponse({
    query,
    sqlOperations,
    relationPolicyRevisions,
    users,
    generatedAt,
  });
}
