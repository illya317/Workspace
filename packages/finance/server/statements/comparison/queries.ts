import { prisma } from "@workspace/platform/server/prisma";

import { detectStatementMapping, type StatementMappingDetection } from "./mapping";
import {
  assertStatementComparisonEnabled,
  StatementComparisonStateError,
  type StatementComparisonDb,
} from "./service";
import { cellChannelKey, type WorkbookAnalysisSnapshot } from "./workbook-dto";

/**
 * 对比证据只读查询（计划 §7 API 矩阵的 GET 行；Package 6）。
 * 只返回稳定 DTO：绝不返回 raw payload 字节或私有 Prisma 载荷；
 * 金额 Decimal 一律序列化为规范化十进制字符串。
 */

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function decimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export interface ComparisonPackageListItem {
  id: number;
  fileName: string;
  sha256: string;
  fileSize: number;
  lifecycle: string;
  failureCode: string | null;
  uploadedBy: number;
  createdAt: string;
  mappingCount: number;
  runCount: number;
}

export async function listComparisonPackages(
  db: StatementComparisonDb = prisma,
): Promise<ComparisonPackageListItem[]> {
  await assertStatementComparisonEnabled(db);
  const rows = await db.financeStatementComparisonPackage.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      sha256: true,
      fileSize: true,
      lifecycle: true,
      failureCode: true,
      uploadedBy: true,
      createdAt: true,
      mappings: { select: { id: true, runs: { select: { id: true } } } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    sha256: row.sha256,
    fileSize: row.fileSize,
    lifecycle: row.lifecycle,
    failureCode: row.failureCode,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    mappingCount: row.mappings.length,
    runCount: row.mappings.reduce((count, mapping) => count + mapping.runs.length, 0),
  }));
}

export interface ComparisonMappingDto {
  id: number;
  revision: number;
  status: string;
  targetKind: string;
  reportType: string;
  targetFingerprint: string;
  confirmedBy: number | null;
  confirmedAt: string | null;
  updatedAt: string;
  runs: ComparisonRunListItem[];
}

export interface ComparisonRunListItem {
  id: number;
  status: string;
  failureCode: string | null;
  inputFingerprint: string;
  outputFingerprint: string | null;
  createdBy: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ComparisonSheetInventoryItem {
  name: string;
  visibility: string;
  cellCount: number;
}

export interface ComparisonPackageDetail {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  parserVersion: string;
  lifecycle: string;
  failureCode: string | null;
  failureMessage: string | null;
  uploadedBy: number;
  createdAt: string;
  scanSummary: unknown;
  sheets: ComparisonSheetInventoryItem[];
  /** 由归一化快照重新检测的映射提案（Package 7 结构化映射确认；failed/archived 为 null）。 */
  detection: StatementMappingDetection | null;
  mappings: ComparisonMappingDto[];
}

export async function getComparisonPackageDetail(
  packageId: number,
  db: StatementComparisonDb = prisma,
): Promise<ComparisonPackageDetail> {
  await assertStatementComparisonEnabled(db);
  const row = await db.financeStatementComparisonPackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      sha256: true,
      parserVersion: true,
      lifecycle: true,
      failureCode: true,
      failureMessage: true,
      uploadedBy: true,
      createdAt: true,
      scanSummary: true,
      workbookSnapshot: true,
      mappings: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          revision: true,
          status: true,
          targetKind: true,
          reportType: true,
          targetFingerprint: true,
          confirmedBy: true,
          confirmedAt: true,
          updatedAt: true,
          runs: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              failureCode: true,
              inputFingerprint: true,
              outputFingerprint: true,
              createdBy: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });
  if (!row) throw new StatementComparisonStateError(`证据包 ${packageId} 不存在`);

  const snapshot = row.workbookSnapshot as WorkbookAnalysisSnapshot | null;
  const sheets: ComparisonSheetInventoryItem[] = Array.isArray(snapshot?.dto?.sheets)
    ? snapshot.dto.sheets.map((sheet) => ({
        name: sheet.name,
        visibility: sheet.visibility,
        cellCount: Array.isArray(sheet.cells) ? sheet.cells.length : 0,
      }))
    : [];

  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    sha256: row.sha256,
    parserVersion: row.parserVersion,
    lifecycle: row.lifecycle,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    scanSummary: row.scanSummary,
    sheets,
    detection: snapshot ? detectStatementMapping(snapshot.dto) : null,
    mappings: row.mappings.map((mapping) => ({
      id: mapping.id,
      revision: mapping.revision,
      status: mapping.status,
      targetKind: mapping.targetKind,
      reportType: mapping.reportType,
      targetFingerprint: mapping.targetFingerprint,
      confirmedBy: mapping.confirmedBy,
      confirmedAt: iso(mapping.confirmedAt),
      updatedAt: mapping.updatedAt.toISOString(),
      runs: mapping.runs.map((run) => ({
        id: run.id,
        status: run.status,
        failureCode: run.failureCode,
        inputFingerprint: run.inputFingerprint,
        outputFingerprint: run.outputFingerprint,
        createdBy: run.createdBy,
        createdAt: run.createdAt.toISOString(),
        completedAt: iso(run.completedAt),
      })),
    })),
  };
}

export interface ComparisonRunExternalCellDto {
  sheet: string;
  a1: string;
  type: string;
  /** 原始值（JSON-safe scalar）。 */
  value: unknown;
  /** SheetJS 格式化文本，仅展示用途。 */
  text: string | null;
  formula: string | null;
  cachedValue: unknown;
  recalculatedValue: unknown;
  /** 独立重算通道的 trust 状态；未参与重算时为 null。 */
  trust: string | null;
}

export interface ComparisonRunLineDto {
  lineCode: string;
  lineLabel: string;
  sortOrder: number;
  sourceSheet: string | null;
  sourceCell: string | null;
  externalAmount: string | null;
  systemAmount: string | null;
  differenceAmount: string | null;
  explainedAmount: string | null;
  residualAmount: string | null;
  explanationStatus: string;
  explanationMethod: string | null;
  evidence: unknown;
  alternatives: unknown;
  diagnostics: unknown;
  /** 来源 workbook 单元格富化（raw/formatted/cached/formula/recalc/trust）；无来源单元格为 null。 */
  externalCell: ComparisonRunExternalCellDto | null;
}

export interface ComparisonRunDetail extends ComparisonRunListItem {
  mappingId: number;
  targetFingerprint: string;
  orchestratorId: string;
  orchestratorVersion: string;
  formulaAdapterId: string | null;
  formulaAdapterVersion: string | null;
  solverAdapterId: string | null;
  solverAdapterVersion: string | null;
  configFingerprint: string;
  failureMessage: string | null;
  summary: unknown;
  lines: ComparisonRunLineDto[];
}

export async function getComparisonRunDetail(
  runId: number,
  db: StatementComparisonDb = prisma,
): Promise<ComparisonRunDetail> {
  await assertStatementComparisonEnabled(db);
  const run = await db.financeStatementComparisonRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      mappingId: true,
      targetFingerprint: true,
      orchestratorId: true,
      orchestratorVersion: true,
      formulaAdapterId: true,
      formulaAdapterVersion: true,
      solverAdapterId: true,
      solverAdapterVersion: true,
      configFingerprint: true,
      status: true,
      inputFingerprint: true,
      outputFingerprint: true,
      summary: true,
      failureCode: true,
      failureMessage: true,
      createdBy: true,
      createdAt: true,
      completedAt: true,
      mapping: {
        select: { package: { select: { workbookSnapshot: true } } },
      },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          lineCode: true,
          lineLabel: true,
          sortOrder: true,
          sourceSheet: true,
          sourceCell: true,
          externalAmount: true,
          systemAmount: true,
          differenceAmount: true,
          explainedAmount: true,
          residualAmount: true,
          explanationStatus: true,
          explanationMethod: true,
          evidence: true,
          alternatives: true,
          diagnostics: true,
        },
      },
    },
  });
  if (!run) throw new StatementComparisonStateError(`对比运行 ${runId} 不存在`);
  const snapshot = run.mapping.package.workbookSnapshot as WorkbookAnalysisSnapshot | null;
  const externalCellOf = (
    sourceSheet: string | null,
    sourceCell: string | null,
  ): ComparisonRunExternalCellDto | null => {
    if (!snapshot || !sourceSheet || !sourceCell) return null;
    const sheet = snapshot.dto.sheets.find((entry) => entry.name === sourceSheet);
    const cell = sheet?.cells.find((entry) => entry.a1 === sourceCell);
    if (!cell) return null;
    const recalculated = snapshot.recalculation.cells[cellChannelKey(sourceSheet, sourceCell)];
    return {
      sheet: sourceSheet,
      a1: sourceCell,
      type: cell.type,
      value: cell.value,
      text: cell.text,
      formula: cell.formula,
      cachedValue: cell.cachedValue ?? null,
      recalculatedValue: recalculated ? recalculated.recalculatedValue : null,
      trust: recalculated ? recalculated.trust : null,
    };
  };
  return {
    id: run.id,
    mappingId: run.mappingId,
    targetFingerprint: run.targetFingerprint,
    orchestratorId: run.orchestratorId,
    orchestratorVersion: run.orchestratorVersion,
    formulaAdapterId: run.formulaAdapterId,
    formulaAdapterVersion: run.formulaAdapterVersion,
    solverAdapterId: run.solverAdapterId,
    solverAdapterVersion: run.solverAdapterVersion,
    configFingerprint: run.configFingerprint,
    status: run.status,
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
    inputFingerprint: run.inputFingerprint,
    outputFingerprint: run.outputFingerprint,
    summary: run.summary,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
    completedAt: iso(run.completedAt),
    lines: run.lines.map((line) => ({
      lineCode: line.lineCode,
      lineLabel: line.lineLabel,
      sortOrder: line.sortOrder,
      sourceSheet: line.sourceSheet,
      sourceCell: line.sourceCell,
      externalAmount: decimalString(line.externalAmount),
      systemAmount: decimalString(line.systemAmount),
      differenceAmount: decimalString(line.differenceAmount),
      explainedAmount: decimalString(line.explainedAmount),
      residualAmount: decimalString(line.residualAmount),
      explanationStatus: line.explanationStatus,
      explanationMethod: line.explanationMethod,
      evidence: line.evidence,
      alternatives: line.alternatives,
      diagnostics: line.diagnostics,
      externalCell: externalCellOf(line.sourceSheet, line.sourceCell),
    })),
  };
}
