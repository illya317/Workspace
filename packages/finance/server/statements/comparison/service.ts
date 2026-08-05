import { createHash } from "node:crypto";

import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import type { StatementTargetRef } from "@workspace/finance/types/statement-explanation";

import { canonicalFingerprint } from "../amount-explanation/fingerprint";
import type { DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  StatementComparisonValidationError,
  validateComparisonMappingConfirmation,
  validateComparisonMappingRevision,
  validateComparisonPackageArchive,
  validateComparisonUploadCommand,
} from "../../domain/statement-comparison-validation";
import { ingestWorkbookEvidence, WORKBOOK_INGEST_VERSION, type WorkbookIngestFailureCode } from "./ingest";
import {
  detectStatementMapping,
  type DetectedStatementStructure,
  type LineMappingEntry,
  type StatementMappingDetection,
} from "./mapping";
import type { WorkbookAnalysisSnapshot } from "./workbook-dto";
import type { WorkbookFormulaEngineAdapter } from "@workspace/platform/formula";

export { StatementComparisonValidationError } from "../../domain/statement-comparison-validation";

/**
 * 报表对比证据持久化 service（计划 §5.4/§6，Package 5）。
 *
 * 固定边界：
 * - 只做 package/mapping/run/line 的创建与状态机；不创建/更新任何会计事实。
 * - 状态机错误先于数据库 trigger 给出友好中文错误；trigger 只是最后防线。
 * - mapping 乐观并发：UPDATE 一律 (id, revision) 条件更新 + revision 递增（CAS）。
 * - run 完成后不可变；rerun 只新建记录。archive 而非 delete。
 * - raw payload 只在 preflight 全过后入库；failureCode/Message 不回显不安全内容。
 */

export const STATEMENT_COMPARISON_CONFIG_KEY = "finance.statements.comparison.enabled";

/** 与 platform moduleDisabledResponse 同款错误形态（code=MODULE_DISABLED, 403）。 */
export class StatementComparisonDisabledError extends Error {
  readonly name = "StatementComparisonDisabledError";
  readonly code = "MODULE_DISABLED";
  readonly httpStatus = 403;

  constructor() {
    super("报表对比功能未启用");
  }
}

/** 状态机友好错误（先于数据库 trigger）。 */
export class StatementComparisonStateError extends Error {
  readonly name = "StatementComparisonStateError";
}

/** (id, revision) CAS 冲突。 */
export class StatementComparisonConflictError extends Error {
  readonly name = "StatementComparisonConflictError";

  constructor() {
    super("记录已被并发修改，请刷新后重试");
  }
}

/** 上传被 preflight/parse 拒绝；failureCode 精确、message 不回显不安全内容。 */
export class WorkbookUploadRejectedError extends Error {
  readonly name = "WorkbookUploadRejectedError";
  readonly failureCode: WorkbookIngestFailureCode;
  /** preflight 失败为 true：调用方不得入库原始字节。 */
  readonly beforePersistence: boolean;

  constructor(failureCode: WorkbookIngestFailureCode, message: string, beforePersistence: boolean) {
    super(message);
    this.failureCode = failureCode;
    this.beforePersistence = beforePersistence;
  }
}

/** domain 校验失败统一转为 StatementComparisonValidationError（业务形状错误，400 语义）。 */
export function assertComparisonValid<T>(result: DomainValidationResult<T>): T {
  if (!result.ok) throw new StatementComparisonValidationError(result.issue.message);
  return result.data;
}

export type StatementComparisonDb = Pick<
  typeof prisma,
  | "systemConfig"
  | "financeStatementComparisonPackage"
  | "financeStatementComparisonMapping"
  | "financeStatementComparisonRun"
  | "financeStatementComparisonLine"
  | "$transaction"
>;

// ─── 功能开关（ADR 决策 4：SystemConfig 键，缺省 false = fail-closed）───────────

export async function isStatementComparisonEnabled(db: StatementComparisonDb = prisma): Promise<boolean> {
  const row = await db.systemConfig.findUnique({
    where: { key: STATEMENT_COMPARISON_CONFIG_KEY },
    select: { value: true },
  });
  return row?.value.trim() === "true";
}

/** service 入口统一评估点：开关缺省/false 即拒绝，错误形态同款 moduleDisabledResponse。 */
export async function assertStatementComparisonEnabled(db: StatementComparisonDb = prisma): Promise<void> {
  if (!(await isStatementComparisonEnabled(db))) {
    throw new StatementComparisonDisabledError();
  }
}

// ─── Package 导入 ────────────────────────────────────────────────

export interface ImportComparisonWorkbookInput {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  uploadedBy: number;
  db?: StatementComparisonDb;
  formulaAdapter?: WorkbookFormulaEngineAdapter;
}

export interface ImportComparisonWorkbookResult {
  packageId: number;
  lifecycle: "parsed" | "mappingRequired" | "ready" | "failed";
  sha256: string;
  /** 成功时的检测提案（瞬态返回给调用方展示；持久化以确认为准）。 */
  detection: StatementMappingDetection | null;
}

/**
 * 上传入口：envelope → preflight → 隔离 parse → DTO → 重算通道 → 检测 → 入库。
 * preflight 失败抛 WorkbookUploadRejectedError 且不落任何行（raw payload 只在
 * preflight 全过后入库）；parse 失败落 lifecycle=failed 证据行（含安全字节与
 * failureCode/Message），审计可追溯。
 */
export async function importComparisonWorkbook(
  input: ImportComparisonWorkbookInput,
): Promise<ImportComparisonWorkbookResult> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonUploadCommand({
    fileName: input.fileName,
    fileSize: input.bytes.byteLength,
    uploadedBy: input.uploadedBy,
  }));

  const outcome = await ingestWorkbookEvidence({
    bytes: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    formulaAdapter: input.formulaAdapter,
  });

  if (!outcome.ok) {
    if (outcome.stage === "envelope" || outcome.stage === "preflight") {
      throw new WorkbookUploadRejectedError(outcome.failureCode, outcome.message, true);
    }
    await db.financeStatementComparisonPackage.create({
      data: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.bytes.byteLength,
        // parse 失败发生于 preflight 之后，字节已通过全部 archive 检查；
        // sha256 只是内容哈希（不解析），可安全记录用于证据身份。
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        payload: new Uint8Array(input.bytes),
        parserVersion: WORKBOOK_INGEST_VERSION,
        workbookSnapshot: Prisma.JsonNull,
        scanSummary: { failureStage: "parse" } as unknown as Prisma.InputJsonValue,
        lifecycle: "failed",
        failureCode: outcome.failureCode,
        failureMessage: outcome.message,
        uploadedBy: input.uploadedBy,
      },
      select: { id: true },
    });
    throw new WorkbookUploadRejectedError(outcome.failureCode, outcome.message, false);
  }

  const detection = detectStatementMapping(outcome.analysis.dto);
  const best = detection.best;
  const lifecycle = best === null || best.pendingCount > 0 ? "mappingRequired" : "ready";

  const created = await db.financeStatementComparisonPackage.create({
    data: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
      sha256: outcome.scanSummary.sha256,
      payload: new Uint8Array(input.bytes),
      parserVersion: outcome.parserVersion,
      workbookSnapshot: outcome.analysis as unknown as Prisma.InputJsonValue,
      scanSummary: {
        ...outcome.scanSummary,
        snapshotFingerprint: outcome.snapshotFingerprint,
        detectionWarnings: detection.warnings,
      } as unknown as Prisma.InputJsonValue,
      lifecycle,
      uploadedBy: input.uploadedBy,
    },
    select: { id: true },
  });

  return { packageId: created.id, lifecycle, sha256: outcome.scanSummary.sha256, detection };
}

/** 读取归一化快照并重新检测（remap 流程的提案来源）。 */
export async function detectComparisonMapping(
  packageId: number,
  db: StatementComparisonDb = prisma,
): Promise<StatementMappingDetection> {
  await assertStatementComparisonEnabled(db);
  const record = await db.financeStatementComparisonPackage.findUnique({
    where: { id: packageId },
    select: { workbookSnapshot: true, lifecycle: true },
  });
  if (!record) throw new StatementComparisonStateError(`证据包 ${packageId} 不存在`);
  if (record.lifecycle === "failed") {
    throw new StatementComparisonStateError("证据包解析失败，无法检测映射");
  }
  const snapshot = record.workbookSnapshot as unknown as WorkbookAnalysisSnapshot;
  return detectStatementMapping(snapshot.dto);
}

// ─── Mapping 确认（绑定 workbook SHA-256 + revision + StatementTargetRef + 目标指纹）────

function targetFields(target: StatementTargetRef) {
  if (target.kind === "entity") {
    return {
      targetKind: "entity",
      targetCompanyId: target.companyId,
      year: target.year,
      month: target.month,
      periodKind: target.periodKind,
      reportType: target.reportType,
      targetFingerprint: target.targetFingerprint,
    };
  }
  return {
    targetKind: "consolidated",
    targetParentCompanyId: target.parentCompanyId,
    targetBatchId: target.batchId,
    targetOutputSnapshotId: target.outputSnapshotId,
    reportType: target.reportType,
    targetFingerprint: target.targetFingerprint,
  };
}

export interface ConfirmComparisonMappingInput {
  packageId: number;
  target: StatementTargetRef;
  /** 用户确认后的结构映射（通常来自 detectComparisonMapping 提案 + 人工选择）。 */
  structureMapping: DetectedStatementStructure;
  /** 用户确认后的行映射（ambiguous/duplicate/unmatched 必须已被人工处置）。 */
  lineMapping: LineMappingEntry[];
  confirmedBy: number;
  db?: StatementComparisonDb;
}

export interface ConfirmedMappingResult {
  mappingId: number;
  revision: number;
  inputFingerprint: string;
}

export async function confirmComparisonMapping(
  input: ConfirmComparisonMappingInput,
): Promise<ConfirmedMappingResult> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonMappingConfirmation({
    structureMapping: input.structureMapping,
    lineMapping: input.lineMapping,
    targetReportType: input.target.reportType,
  }));

  const pkg = await db.financeStatementComparisonPackage.findUnique({
    where: { id: input.packageId },
    select: { id: true, sha256: true, lifecycle: true },
  });
  if (!pkg) throw new StatementComparisonStateError(`证据包 ${input.packageId} 不存在`);
  if (pkg.lifecycle === "failed" || pkg.lifecycle === "archived") {
    throw new StatementComparisonStateError("证据包已失败或归档，不能确认映射");
  }

  const inputFingerprint = canonicalFingerprint({
    packageId: input.packageId,
    workbookSha256: pkg.sha256,
    target: input.target,
    structureMapping: input.structureMapping,
    lineMapping: input.lineMapping,
  });

  const created = await db.financeStatementComparisonMapping.create({
    data: {
      packageId: input.packageId,
      ...targetFields(input.target),
      workbookSha256: pkg.sha256,
      structureMapping: input.structureMapping as unknown as Prisma.InputJsonValue,
      lineMapping: input.lineMapping as unknown as Prisma.InputJsonValue,
      revision: 1,
      status: "confirmed",
      inputFingerprint,
      confirmedBy: input.confirmedBy,
      confirmedAt: new Date(),
    },
    select: { id: true, revision: true },
  });

  // package 就绪：mapping 已确认（生命周期仅推进，不触碰冻结内容列）。
  if (pkg.lifecycle === "mappingRequired" || pkg.lifecycle === "parsed") {
    await db.financeStatementComparisonPackage.update({
      where: { id: input.packageId },
      data: { lifecycle: "ready" },
    });
  }

  return { mappingId: created.id, revision: created.revision, inputFingerprint };
}

export interface RemapComparisonMappingInput {
  mappingId: number;
  /** 调用方读到的 revision；不匹配即 CAS 冲突。 */
  expectedRevision: number;
  structureMapping: DetectedStatementStructure;
  lineMapping: LineMappingEntry[];
  confirmedBy: number;
  db?: StatementComparisonDb;
}

/** remap：(id, revision) 条件更新 + revision 递增；冲突由失败方重读解决。 */
export async function remapComparisonMapping(
  input: RemapComparisonMappingInput,
): Promise<ConfirmedMappingResult> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonMappingConfirmation({
    structureMapping: input.structureMapping,
    lineMapping: input.lineMapping,
  }));

  const mapping = await db.financeStatementComparisonMapping.findUnique({
    where: { id: input.mappingId },
    select: {
      id: true,
      revision: true,
      status: true,
      packageId: true,
      workbookSha256: true,
      targetFingerprint: true,
      package: { select: { sha256: true } },
    },
  });
  if (!mapping) throw new StatementComparisonStateError(`映射 ${input.mappingId} 不存在`);
  if (mapping.status === "archived") {
    throw new StatementComparisonStateError("映射已归档，不能修改");
  }
  if (mapping.package.sha256 !== mapping.workbookSha256) {
    throw new StatementComparisonStateError("证据包内容指纹已变化，映射失效，请重新确认");
  }

  const inputFingerprint = canonicalFingerprint({
    mappingId: input.mappingId,
    workbookSha256: mapping.workbookSha256,
    structureMapping: input.structureMapping,
    lineMapping: input.lineMapping,
  });

  const updated = await db.financeStatementComparisonMapping.updateMany({
    where: { id: input.mappingId, revision: input.expectedRevision },
    data: {
      structureMapping: input.structureMapping as unknown as Prisma.InputJsonValue,
      lineMapping: input.lineMapping as unknown as Prisma.InputJsonValue,
      status: "confirmed",
      inputFingerprint,
      confirmedBy: input.confirmedBy,
      confirmedAt: new Date(),
      revision: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new StatementComparisonConflictError();
  }
  return { mappingId: input.mappingId, revision: input.expectedRevision + 1, inputFingerprint };
}

/** 指纹漂移时显式失效映射（CAS）；先于 trigger 的友好状态机。 */
export async function invalidateComparisonMapping(
  mappingId: number,
  expectedRevision: number,
  db: StatementComparisonDb = prisma,
): Promise<void> {
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonMappingRevision({ mappingId, expectedRevision }));
  const updated = await db.financeStatementComparisonMapping.updateMany({
    where: { id: mappingId, revision: expectedRevision },
    data: { status: "invalidated", revision: { increment: 1 } },
  });
  if (updated.count === 0) throw new StatementComparisonConflictError();
}

// ─── Archive（不删除；被已完成 run 引用的 package 也允许 -> archived）─────────

export interface ArchiveComparisonPackageInput {
  packageId: number;
  /** 归档操作人（guardedDelete 审计字段必填）。 */
  archivedBy: number;
  db?: StatementComparisonDb;
}

/**
 * 归档证据包：存在性/已归档的友好状态机错误先于 guardedDelete；
 * guardedDelete 显式声明 deleteMode=archive + referencePolicy=retained
 * （mapping/run 是聚合内引用，归档保留引用、绝不删除记录）。
 */
export async function archiveComparisonPackage(
  input: ArchiveComparisonPackageInput,
): Promise<void> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonPackageArchive({
    packageId: input.packageId,
    archivedBy: input.archivedBy,
  }));
  const pkg = await db.financeStatementComparisonPackage.findUnique({
    where: { id: input.packageId },
    select: { lifecycle: true },
  });
  if (!pkg) throw new StatementComparisonStateError(`证据包 ${input.packageId} 不存在`);
  if (pkg.lifecycle === "archived") {
    throw new StatementComparisonStateError("证据包已归档");
  }
  const result = await guardedDelete({
    entityType: "FinanceStatementComparisonPackage",
    modelKey: "financeStatementComparisonPackage",
    id: input.packageId,
    userId: input.archivedBy,
    actionLabel: "归档报表对比证据包",
    deleteMode: "archive",
    archiveField: { field: "lifecycle", value: "archived" },
    auditPolicy: "none",
    skipVersionCheck: true,
    referencePolicy: "retained",
  });
  if (!result.ok) throw new StatementComparisonStateError(result.error);
}
