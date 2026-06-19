/** P3 Batch 2: workpaper read/write service. */
import { prisma } from "@workspace/platform/server/prisma";
import { loadIncomeStatementConfig, loadCashFlowConfig } from "../config/load-config-reports";
import type { IncomeStatementLineRow, CashFlowLineRow } from "../config/load-config-reports";
import type {
  WorkpaperReportType,
  WorkpaperOutput, WorkpaperLineOutput,
  GetWorkpaperParams, SaveWorkpaperInput,
} from "./types";

// ─── helpers ─────────────────────────────────────────────────

function validateReportType(rt: string): WorkpaperReportType {
  if (rt !== "incomeStatement" && rt !== "cashFlow") {
    throw new Error(`不支持的 reportType: ${rt}，仅支持 incomeStatement / cashFlow`);
  }
  return rt;
}

async function loadLineConfig(companyCode: string, year: number, reportType: WorkpaperReportType) {
  if (reportType === "incomeStatement") {
    return loadIncomeStatementConfig(companyCode, year);
  }
  return loadCashFlowConfig(companyCode, year);
}

type LineConfigRow = IncomeStatementLineRow | CashFlowLineRow;

function configLineCode(row: LineConfigRow): string {
  return row.lineCode;
}

function configSortOrder(_row: LineConfigRow, index: number): number {
  return index;
}

function buildDraftLines(config: LineConfigRow[]): WorkpaperLineOutput[] {
  return config.map((row, i) => ({
    id: 0,
    lineCode: configLineCode(row),
    manualAmount: 0,
    importedAmount: 0,
    formulaText: null,
    note: null,
    source: null,
    sortOrder: configSortOrder(row, i),
  }));
}

// ─── public API ──────────────────────────────────────────────

/** Get existing workpaper, or return an empty draft from line config (no DB write). */
export async function getOrCreateDraft(params: GetWorkpaperParams): Promise<WorkpaperOutput> {
  const { companyCode, year, month, reportType: rt } = params;
  const reportType = validateReportType(rt);

  const existing = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: { companyCode, year, month, reportType } },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) {
    return {
      id: existing.id,
      companyCode: existing.companyCode,
      year: existing.year,
      month: existing.month,
      reportType: existing.reportType as WorkpaperReportType,
      status: existing.status,
      note: existing.note,
      lines: existing.lines.map((l) => ({
        id: l.id,
        lineCode: l.lineCode,
        manualAmount: l.manualAmount,
        importedAmount: l.importedAmount,
        formulaText: l.formulaText,
        note: l.note,
        source: l.source,
        sortOrder: l.sortOrder,
      })),
    };
  }

  // Draft from config — not persisted
  const config = await loadLineConfig(companyCode, year, reportType);
  return {
    id: 0,
    companyCode,
    year,
    month,
    reportType,
    status: "draft",
    note: null,
    lines: buildDraftLines(config),
  };
}

/** Save (upsert) workpaper header + lines. Validates all lineCodes against line config. */
export async function saveWorkpaper(
  input: SaveWorkpaperInput,
  userId?: number,
): Promise<WorkpaperOutput> {
  const { companyCode, year, month, reportType: rt, note, lines } = input;
  const reportType = validateReportType(rt);

  const config = await loadLineConfig(companyCode, year, reportType);
  const validCodes = new Set(config.map((r) => r.lineCode));
  for (const line of lines) {
    if (!validCodes.has(line.lineCode)) {
      throw new Error(`无效 lineCode "${line.lineCode}"，不在 ${reportType} 的 line config 中`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const wp = await tx.financeStatementWorkpaper.upsert({
      where: { companyCode_year_month_reportType: { companyCode, year, month, reportType } },
      create: { companyCode, year, month, reportType, note: note ?? null, updatedBy: userId ?? null,
        editedAt: userId ? new Date() : null },
      update: { note: note ?? null, updatedBy: userId ?? null,
        editedAt: userId ? new Date() : null, version: { increment: 1 } },
    });

    // Delete lines not in this payload, then upsert
    const incomingCodes = new Set(lines.map((l) => l.lineCode));
    await tx.financeStatementWorkpaperLine.deleteMany({
      where: { workpaperId: wp.id, lineCode: { notIn: [...incomingCodes] } },
    });

    const savedLines: WorkpaperLineOutput[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const row = await tx.financeStatementWorkpaperLine.upsert({
        where: { workpaperId_lineCode: { workpaperId: wp.id, lineCode: l.lineCode } },
        create: {
          workpaperId: wp.id,
          lineCode: l.lineCode,
          manualAmount: l.manualAmount,
          importedAmount: l.importedAmount,
          formulaText: l.formulaText ?? null,
          note: l.note ?? null,
          source: l.source ?? null,
          sortOrder: i,
        },
        update: {
          manualAmount: l.manualAmount,
          importedAmount: l.importedAmount,
          formulaText: l.formulaText ?? null,
          note: l.note ?? null,
          source: l.source ?? null,
          sortOrder: i,
        },
      });
      savedLines.push({
        id: row.id,
        lineCode: row.lineCode,
        manualAmount: row.manualAmount,
        importedAmount: row.importedAmount,
        formulaText: row.formulaText,
        note: row.note,
        source: row.source,
        sortOrder: row.sortOrder,
      });
    }

    return {
      id: wp.id,
      companyCode: wp.companyCode,
      year: wp.year,
      month: wp.month,
      reportType: wp.reportType as WorkpaperReportType,
      status: wp.status,
      note: wp.note,
      lines: savedLines,
    };
  });

  return result;
}
