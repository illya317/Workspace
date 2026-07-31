import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

import type { SqlSettingOperation, SqlSettingOperationInput, SqlSettingOperationStatus } from "../sql-settings-contract";
import { validateSqlSettingOperation } from "./domain/sql-settings-operation-validation";

export const SQL_SETTING_OPERATION_PREFIX = "postgresqlOperationRequest:";
const OPERATION_LOCK_KEY = "workspace:postgresql-operation-request";
const ACTIVE_STATUSES = new Set<SqlSettingOperationStatus>(["pending", "running"]);
const MAX_REQUESTS = 128;
const MAX_ACTIVE_REQUESTS = 16;
const CLEANUP_TARGET_REQUESTS = 96;
const REQUEST_HMAC_FILE_ENV = "WORKSPACE_SQL_SETTINGS_REQUEST_HMAC_FILE";

export class SqlSettingOperationConflictError extends Error {}
export class SqlSettingOperationQueueError extends Error {}

interface SignedSqlSettingOperationRequest {
  requestId: string;
  operation: SqlSettingOperation["operation"];
  settingKey: string | null;
  requestedValue: string | null;
  expectedCurrentValueMs: number | null;
  reason: string;
  requestedByUserId: number;
  createdAt: string;
  idempotencyHash: string;
  requestFingerprint: string;
}

function readRequestHmacKey() {
  const filePath = process.env[REQUEST_HMAC_FILE_ENV]?.trim() ?? "";
  if (!filePath || !isAbsolute(filePath)) {
    throw new SqlSettingOperationQueueError("SQL 操作请求签名不可用");
  }
  try {
    const keyPath = resolve(/* turbopackIgnore: true */ filePath);
    const key = readFileSync(keyPath, "utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(key)) {
      throw new Error("invalid key format");
    }
    // The worker uses the normalized 64-character text itself as the HMAC key.
    return Buffer.from(key, "utf8");
  } catch {
    throw new SqlSettingOperationQueueError("SQL 操作请求签名不可用");
  }
}

export function canonicalizeSqlSettingOperationRequest(value: SignedSqlSettingOperationRequest) {
  return JSON.stringify({
    requestId: value.requestId,
    operation: value.operation,
    settingKey: value.settingKey,
    requestedValue: value.requestedValue,
    expectedCurrentValueMs: value.expectedCurrentValueMs,
    reason: value.reason,
    requestedByUserId: value.requestedByUserId,
    createdAt: value.createdAt,
    idempotencyHash: value.idempotencyHash,
    requestFingerprint: value.requestFingerprint,
  });
}

function signSqlSettingOperationRequest(value: SignedSqlSettingOperationRequest, requestHmacKey: Buffer) {
  return createHmac("sha256", requestHmacKey)
    .update(canonicalizeSqlSettingOperationRequest(value), "utf8")
    .digest("hex");
}

function stringValue(value: unknown, maximum = 240) {
  return typeof value === "string" ? value.slice(0, maximum) : null;
}

function exactStringValue(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function operationStatus(value: unknown): SqlSettingOperationStatus | null {
  return value === "pending" || value === "running" || value === "succeeded" || value === "failed" || value === "reconciliation_required"
    ? value
    : null;
}

export function parseSqlSettingOperation(
  key: string,
  rawValue: string,
  requestHmacKey = readRequestHmacKey(),
): SqlSettingOperation | null {
  if (!key.startsWith(SQL_SETTING_OPERATION_PREFIX)) return null;
  try {
    const value = JSON.parse(rawValue) as Record<string, unknown>;
    const requestId = exactStringValue(value.requestId, 120);
    const keyRequestId = key.slice(SQL_SETTING_OPERATION_PREFIX.length);
    const operation = value.operation;
    const status = operationStatus(value.status);
    const requestedByUserId = typeof value.requestedByUserId === "number" && Number.isInteger(value.requestedByUserId)
      ? value.requestedByUserId
      : null;
    const createdAt = exactStringValue(value.createdAt, 40);
    const settingKey = exactStringValue(value.settingKey, 80);
    const requestedValue = exactStringValue(value.requestedValue, 40);
    const expectedCurrentValueMs = typeof value.expectedCurrentValueMs === "number" && Number.isInteger(value.expectedCurrentValueMs)
      ? value.expectedCurrentValueMs
      : null;
    const reason = exactStringValue(value.reason, 200);
    const idempotencyHash = exactStringValue(value.idempotencyHash, 64);
    const requestFingerprint = exactStringValue(value.requestFingerprint, 64);
    const requestSignature = exactStringValue(value.requestSignature, 64);
    if (
      (operation !== "set-runtime-setting" && operation !== "rotate-runtime-password")
      || !status
      || !requestId
      || requestId !== keyRequestId
      || requestedByUserId === null
      || requestedByUserId <= 0
      || !createdAt
      || reason === null
      || !idempotencyHash
      || !/^[a-f0-9]{64}$/.test(idempotencyHash)
      || !requestFingerprint
      || !/^[a-f0-9]{64}$/.test(requestFingerprint)
      || !requestSignature
      || !/^[a-f0-9]{64}$/.test(requestSignature)
      || (operation === "set-runtime-setting" && (!settingKey || !requestedValue || expectedCurrentValueMs === null || expectedCurrentValueMs <= 0))
      || (operation === "rotate-runtime-password" && (settingKey !== null || requestedValue !== null || expectedCurrentValueMs !== null))
      || Object.hasOwn(value, "password")
      || Object.hasOwn(value, "secret")
      || Object.hasOwn(value, "databaseUrl")
    ) return null;
    const expectedSignature = signSqlSettingOperationRequest({
      requestId,
      operation,
      settingKey,
      requestedValue,
      expectedCurrentValueMs,
      reason,
      requestedByUserId,
      createdAt,
      idempotencyHash,
      requestFingerprint,
    }, requestHmacKey);
    if (!timingSafeEqual(Buffer.from(requestSignature, "hex"), Buffer.from(expectedSignature, "hex"))) {
      return null;
    }
    return {
      id: requestId,
      operation,
      status,
      settingKey,
      requestedValue,
      expectedCurrentValueMs,
      reason,
      requestedByUserId,
      createdAt,
      startedAt: stringValue(value.startedAt, 40),
      completedAt: stringValue(value.completedAt, 40),
      message: stringValue(value.message, 240),
    };
  } catch {
    return null;
  }
}

export async function listSqlSettingOperations(limit = 20): Promise<SqlSettingOperation[]> {
  const requestHmacKey = readRequestHmacKey();
  const rows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: SQL_SETTING_OPERATION_PREFIX } },
    orderBy: { key: "desc" },
    take: MAX_REQUESTS + 1,
  });
  if (rows.length > MAX_REQUESTS) throw new SqlSettingOperationQueueError("SQL 操作队列超过安全容量");
  return rows.map((row) => {
    const operation = parseSqlSettingOperation(row.key, row.value, requestHmacKey);
    if (!operation) throw new SqlSettingOperationQueueError("SQL 操作队列数据损坏");
    return operation;
  }).slice(0, Math.min(Math.max(limit, 1), 100));
}

function conflicts(left: SqlSettingOperation, right: { operation: string; settingKey?: string }) {
  if (!ACTIVE_STATUSES.has(left.status) || left.operation !== right.operation) return false;
  return left.operation === "rotate-runtime-password" || left.settingKey === right.settingKey;
}

export async function createSqlSettingOperation(
  input: SqlSettingOperationInput,
  requestedByUserId: number,
  idempotencyKey: string,
): Promise<SqlSettingOperation> {
  const command = validateSqlSettingOperation(input);
  const idempotencyHash = createHash("sha256").update(idempotencyKey).digest("hex");
  const requestFingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const requestHmacKey = readRequestHmacKey();
  const createdAt = new Date().toISOString();
  const id = `${Date.now()}-${randomUUID()}`;
  const record: SqlSettingOperation = {
    id,
    operation: command.operation,
    status: "pending",
    settingKey: command.operation === "set-runtime-setting" ? command.settingKey : null,
    requestedValue: command.operation === "set-runtime-setting" ? command.value : null,
    expectedCurrentValueMs: command.operation === "set-runtime-setting" ? command.expectedCurrentValueMs : null,
    reason: command.reason,
    requestedByUserId,
    createdAt,
    startedAt: null,
    completedAt: null,
    message: null,
  };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${OPERATION_LOCK_KEY}))`);
    const activeRows = await tx.systemConfig.findMany({
      where: { key: { startsWith: SQL_SETTING_OPERATION_PREFIX } },
      orderBy: { key: "desc" },
      take: MAX_REQUESTS + 1,
    });
    if (activeRows.length > MAX_REQUESTS) throw new SqlSettingOperationQueueError("SQL 操作队列超过安全容量");
    const parsedRows = activeRows.map((row) => {
      const operation = parseSqlSettingOperation(row.key, row.value, requestHmacKey);
      if (!operation) throw new SqlSettingOperationQueueError("SQL 操作队列数据损坏");
      let stored: Record<string, unknown>;
      try {
        stored = JSON.parse(row.value) as Record<string, unknown>;
      } catch {
        throw new SqlSettingOperationQueueError("SQL 操作队列数据损坏");
      }
      return { operation, stored };
    });
    const replay = parsedRows.find(({ stored }) => stored.idempotencyHash === idempotencyHash);
    if (replay) {
      if (replay.stored.requestFingerprint !== requestFingerprint) {
        throw new SqlSettingOperationConflictError("幂等键已用于不同的 SQL 操作");
      }
      return replay.operation;
    }
    const activeOperations = parsedRows.map(({ operation }) => operation).filter((operation) => ACTIVE_STATUSES.has(operation.status));
    if (activeOperations.length >= MAX_ACTIVE_REQUESTS) {
      throw new SqlSettingOperationQueueError("等待执行的 SQL 操作过多");
    }
    const active = activeOperations.find((operation) => conflicts(operation, command));
    if (active) {
      throw new SqlSettingOperationConflictError("相同 SQL 操作已在等待或执行中");
    }
    if (parsedRows.length >= MAX_REQUESTS) {
      const deleteCount = parsedRows.length - CLEANUP_TARGET_REQUESTS;
      const terminalKeys = parsedRows
        .filter(({ operation }) => !ACTIVE_STATUSES.has(operation.status))
        .reverse()
        .slice(0, deleteCount)
        .map(({ operation }) => `${SQL_SETTING_OPERATION_PREFIX}${operation.id}`);
      if (terminalKeys.length !== deleteCount) {
        throw new SqlSettingOperationQueueError("SQL 操作队列没有足够的可清理历史记录");
      }
      const deleted = await tx.systemConfig.deleteMany({ where: { key: { in: terminalKeys } } });
      if (deleted.count !== deleteCount) {
        throw new SqlSettingOperationQueueError("SQL 操作历史清理未完整执行");
      }
    }
    const signedRequest = {
      requestId: id,
      operation: record.operation,
      settingKey: record.settingKey,
      requestedValue: record.requestedValue,
      expectedCurrentValueMs: record.expectedCurrentValueMs,
      reason: record.reason,
      requestedByUserId: record.requestedByUserId,
      createdAt: record.createdAt,
      idempotencyHash,
      requestFingerprint,
    } satisfies SignedSqlSettingOperationRequest;
    await tx.systemConfig.create({
      data: {
        key: `${SQL_SETTING_OPERATION_PREFIX}${id}`,
        value: JSON.stringify({
          requestId: id,
          operation: record.operation,
          status: record.status,
          settingKey: record.settingKey,
          requestedValue: record.requestedValue,
          expectedCurrentValueMs: record.expectedCurrentValueMs,
          reason: record.reason,
          requestedByUserId: record.requestedByUserId,
          createdAt: record.createdAt,
          startedAt: null,
          completedAt: null,
          message: null,
          idempotencyHash,
          requestFingerprint,
          requestSignature: signSqlSettingOperationRequest(signedRequest, requestHmacKey),
        }),
      },
    });
    return record;
  });
}
