import { z } from "zod";

import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { AmountOriginQuery } from "@workspace/finance/types/statement-explanation";

import {
  buildAmountOriginQueryCommand,
  buildArchiveComparisonPackageCommand,
  buildCreateComparisonRunCommand,
  buildSaveComparisonMappingCommand,
  type ArchiveComparisonPackageCommand,
  type CreateComparisonRunCommand,
  type SaveComparisonMappingCommand,
} from "../../domain/comparison-validation";
import { AmountOriginQueryError } from "../amount-explanation/query";
import { explainAmountOrigin } from "../amount-explanation/service";
import { MAX_UPLOAD_BYTES } from "./limits";
import {
  getComparisonPackageDetail,
  getComparisonRunDetail,
  listComparisonPackages,
  type ComparisonPackageDetail,
  type ComparisonPackageListItem,
  type ComparisonRunDetail,
} from "./queries";
import { executeComparisonRun, type ExecutedComparisonRun } from "./run-execution";
import {
  previewStatementComparisonTarget,
  type ComparisonTargetPreview,
  type ComparisonTargetPreviewSelection,
} from "./target-preview";
import {
  archiveComparisonPackage,
  assertStatementComparisonEnabled,
  confirmComparisonMapping,
  importComparisonWorkbook,
  remapComparisonMapping,
  StatementComparisonConflictError,
  StatementComparisonDisabledError,
  StatementComparisonStateError,
  StatementComparisonValidationError,
  WorkbookUploadRejectedError,
  type ImportComparisonWorkbookResult,
} from "./service";

/**
 * 报表对比 route command 层（route 接缝；Package 6）。
 * route 只做 auth/RBAC/Zod/一次 service 调用：这里持有请求 envelope 的 Zod schema，
 * 把 route 输入归一成命令（业务规则委托 packages/finance/server/domain/comparison-validation.ts），
 * 并把 service 抛出的领域错误映射为稳定 ServiceResult（DTO/错误映射）。
 */

// ─── 错误映射（service throw -> ServiceResult）─────────────────────

function comparisonServiceError(error: unknown, fallback: string): ServiceResult<never> {
  if (error instanceof StatementComparisonDisabledError) return serviceError(error.message, 403);
  if (error instanceof StatementComparisonConflictError) return serviceError(error.message, 409);
  if (error instanceof StatementComparisonValidationError) return serviceError(error.message, 400);
  if (error instanceof WorkbookUploadRejectedError) {
    return serviceError(error.message, error.failureCode === "file_too_large" ? 413 : 400);
  }
  if (error instanceof AmountOriginQueryError) return serviceError(error.message, 400);
  if (error instanceof StatementComparisonStateError) return serviceError(error.message, 409);
  return serviceError(error instanceof Error ? error.message : fallback, 500);
}

// ─── 上传（POST /comparisons）──────────────────────────────────────

export interface ImportComparisonWorkbookRouteCommand {
  file: File;
  userId: number;
}

/** 上传命令：route 层在 arrayBuffer() 之前强制 20 MiB（content-length 与 File.size 双检查）。 */
export function buildImportComparisonWorkbookRouteCommand(input: {
  file: File;
  contentLength: number | null;
  userId: number;
}): DomainValidationResult<ImportComparisonWorkbookRouteCommand> {
  if (input.contentLength !== null && input.contentLength > MAX_UPLOAD_BYTES) {
    return failCommand("文件超过 20 MiB 上限", 413, "file");
  }
  if (!input.file.name.trim()) return failCommand("文件名不能为空", 400, "file");
  if (input.file.size <= 0) return failCommand("文件不能为空", 400, "file");
  if (input.file.size > MAX_UPLOAD_BYTES) {
    return failCommand("文件超过 20 MiB 上限", 413, "file");
  }
  return okCommand({ file: input.file, userId: input.userId });
}

export async function executeImportComparisonWorkbookRouteCommand(
  command: ImportComparisonWorkbookRouteCommand,
): Promise<ServiceResult<ImportComparisonWorkbookResult>> {
  try {
    const bytes = Buffer.from(await command.file.arrayBuffer());
    const result = await importComparisonWorkbook({
      bytes,
      fileName: command.file.name,
      mimeType: command.file.type
        || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      uploadedBy: command.userId,
    });
    return serviceOk(result);
  } catch (error) {
    return comparisonServiceError(error, "对比证据上传失败");
  }
}

// ─── Mapping 确认/重确认（PUT /comparisons/:id/mapping）──────────────

const reportTypeSchema = z.enum(["balance", "income", "cashflow"]);

export const comparisonTargetRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entity"),
    companyId: z.number().int().positive(),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    periodKind: z.enum(["monthly", "cumulative"]),
    reportType: reportTypeSchema,
    targetFingerprint: z.string().trim().min(1),
  }).strict(),
  z.object({
    kind: z.literal("consolidated"),
    parentCompanyId: z.number().int().positive(),
    batchId: z.number().int().positive(),
    outputSnapshotId: z.number().int().positive(),
    reportType: reportTypeSchema,
    targetFingerprint: z.string().trim().min(1),
  }).strict(),
]);

const structureMappingSchema = z.object({
  sheetName: z.string().trim().min(1),
  sheetIndex: z.number().int().min(0),
  visibility: z.enum(["visible", "hidden", "veryHidden"]),
  reportType: reportTypeSchema,
  score: z.number().int().min(0),
  /** 0-based 行索引（与 detection 输出一致），首行即表头时为 0。 */
  headerRow: z.number().int().min(0).nullable(),
  labelColumn: z.number().int().min(0),
  blockStartRow: z.number().int().positive(),
  blockEndRow: z.number().int().positive(),
  amountColumns: z.array(z.object({
    col: z.number().int().min(0),
    headerText: z.string().nullable(),
  }).strict()).min(1),
  mergedHeader: z.boolean(),
}).strict();

const lineMappingEntrySchema = z.object({
  label: z.string(),
  normalizedLabel: z.string(),
  row: z.number().int().positive(),
  labelCell: z.string().trim().min(1),
  status: z.enum(["auto_accepted", "ambiguous", "duplicate", "unmatched"]),
  lineCode: z.string().trim().min(1).nullable(),
  candidates: z.array(z.string()),
  amountCells: z.array(z.string()),
}).strict();

export const comparisonMappingSaveBodySchema = z.object({
  /** 提供即 remap（必须带 expectedRevision CAS）；缺省即对 :id 证据包首次确认。 */
  mappingId: z.number().int().positive().optional(),
  expectedRevision: z.number().int().positive().optional(),
  target: comparisonTargetRefSchema.optional(),
  structureMapping: structureMappingSchema,
  lineMapping: z.array(lineMappingEntrySchema).min(1),
}).strict();

export type SaveComparisonMappingBody = z.infer<typeof comparisonMappingSaveBodySchema>;

export function buildSaveComparisonMappingRouteCommand(input: {
  packageId: number;
  body: SaveComparisonMappingBody;
  userId: number;
}): DomainValidationResult<SaveComparisonMappingCommand> {
  return buildSaveComparisonMappingCommand(input);
}

export interface SavedComparisonMappingResult {
  mappingId: number;
  revision: number;
  inputFingerprint: string;
}

export async function executeSaveComparisonMappingRouteCommand(
  command: SaveComparisonMappingCommand,
): Promise<ServiceResult<SavedComparisonMappingResult>> {
  try {
    const result = command.mode === "confirm"
      ? await confirmComparisonMapping(command)
      : await remapComparisonMapping(command);
    return serviceOk(result);
  } catch (error) {
    return comparisonServiceError(error, "映射确认失败");
  }
}

// ─── 创建并执行 run（POST /comparisons/:id/runs，:id = mappingId）────

export function buildCreateComparisonRunRouteCommand(input: {
  mappingId: number;
  userId: number;
}): DomainValidationResult<CreateComparisonRunCommand> {
  return buildCreateComparisonRunCommand(input);
}

export async function executeCreateComparisonRunRouteCommand(
  command: CreateComparisonRunCommand,
): Promise<ServiceResult<ExecutedComparisonRun>> {
  try {
    const result = await executeComparisonRun(command);
    return serviceOk(result);
  } catch (error) {
    return comparisonServiceError(error, "对比运行创建失败");
  }
}

// ─── 归档（POST /comparisons/:id/archive）───────────────────────────

export function buildArchiveComparisonPackageRouteCommand(input: {
  packageId: number;
  userId: number;
}): DomainValidationResult<ArchiveComparisonPackageCommand> {
  return buildArchiveComparisonPackageCommand(input);
}

export async function executeArchiveComparisonPackageRouteCommand(
  command: ArchiveComparisonPackageCommand,
): Promise<ServiceResult<{ archived: true }>> {
  try {
    await archiveComparisonPackage(command);
    return serviceOk({ archived: true });
  } catch (error) {
    return comparisonServiceError(error, "对比证据归档失败");
  }
}

// ─── 只读查询（GET 列表/详情/run 详情）───────────────────────────────

export async function executeListComparisonPackagesCommand(): Promise<
  ServiceResult<ComparisonPackageListItem[]>
> {
  try {
    return serviceOk(await listComparisonPackages());
  } catch (error) {
    return comparisonServiceError(error, "对比证据列表读取失败");
  }
}

export async function executeGetComparisonPackageCommand(
  packageId: number,
): Promise<ServiceResult<ComparisonPackageDetail>> {
  try {
    return serviceOk(await getComparisonPackageDetail(packageId));
  } catch (error) {
    return comparisonServiceError(error, "对比证据详情读取失败");
  }
}

export async function executeGetComparisonRunCommand(
  runId: number,
): Promise<ServiceResult<ComparisonRunDetail>> {
  try {
    return serviceOk(await getComparisonRunDetail(runId));
  } catch (error) {
    return comparisonServiceError(error, "对比运行读取失败");
  }
}

// ─── 目标预览（GET /comparisons/target-preview，只读）────────────────────

export const comparisonTargetPreviewQuerySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entity"),
    companyCode: z.string().trim().min(1),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    periodKind: z.enum(["monthly", "cumulative"]),
    reportType: reportTypeSchema,
  }).strict(),
  z.object({
    kind: z.literal("consolidated"),
    batchId: z.coerce.number().int().positive(),
    reportType: reportTypeSchema,
  }).strict(),
]);

/**
 * 目标选择预览（Package 7）：把选择字段解析为类型化 StatementTargetRef +
 * 可见系统指纹/版本。只读；功能开关关闭时同样拒绝。
 */
export async function executeComparisonTargetPreviewCommand(
  selection: ComparisonTargetPreviewSelection,
): Promise<ServiceResult<ComparisonTargetPreview>> {
  try {
    return serviceOk(await previewStatementComparisonTarget(selection));
  } catch (error) {
    return comparisonServiceError(error, "对比目标预览失败");
  }
}

// ─── 金额来源即席查询（POST /amount-explanations/query，只读）─────────

export const amountOriginQueryBodySchema = z.object({
  targetAmount: z.string().trim().min(1),
  currencyCode: z.string().regex(/^[A-Za-z]{3}$/),
  companyIds: z.array(z.number().int().positive()).max(64).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accountHints: z.array(z.string().trim().min(1).max(32)).max(16).optional(),
  reportContext: z.object({
    target: comparisonTargetRefSchema,
    lineCode: z.string().trim().min(1).optional(),
    workbookCell: z.string().trim().min(1).optional(),
  }).strict().optional(),
  tolerance: z.string().trim().min(1).optional(),
  maxTerms: z.number().int().min(1).max(6).optional(),
  sourceKinds: z.array(
    z.enum(["voucherLine", "consolidationMatch", "reclassLineage", "fxTrace", "workbookCell"]),
  ).optional(),
}).strict();

export function buildAmountOriginQueryRouteCommand(input: {
  body: AmountOriginQuery;
}): DomainValidationResult<AmountOriginQuery> {
  return buildAmountOriginQueryCommand(input);
}

/**
 * 只读复杂查询（显式 read-only POST exception）：无任何持久化；
 * 功能开关关闭时同样拒绝（ADR 决策 4 评估点含 query）。
 */
export async function executeAmountOriginQueryRouteCommand(
  query: AmountOriginQuery,
): Promise<ServiceResult<unknown>> {
  try {
    await assertStatementComparisonEnabled();
    return serviceOk(await explainAmountOrigin({ query }));
  } catch (error) {
    return comparisonServiceError(error, "金额来源查询失败");
  }
}
