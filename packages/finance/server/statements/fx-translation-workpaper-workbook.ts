import * as XLSX from "xlsx";
import type {
  ConsolidatedOutputEntityAmount,
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
} from "@workspace/finance/types";

import {
  formulaAwareSheet,
  workbookFormula,
  type FinanceWorkbookCell,
} from "../workbook-formula-contract";
import { statementLineFormula } from "./statement-workbook-formulas";

const AMOUNT_FORMAT = "#,##0.00;[Red]-#,##0.00;;@";
const RATE_FORMAT = "0.00000000";
const SHEETS = [
  ["balanceSheet", "资产负债表折算"],
  ["incomeStatement", "利润表折算"],
  ["cashFlow", "现金流量表折算"],
] as const;

const BASIS_LABELS = {
  identity: "本位币无需折算",
  closing: "期末汇率",
  historical: "历史汇率",
  monthlyAverage: "月平均汇率",
  monthlyAverageMultiple: "逐月平均汇率",
  cashPoint: "时点汇率",
  rolling: "期初人民币加逐月利润滚算",
  balancing: "折算平衡差额",
  aggregate: "汇总派生",
  priorReference: "上期已折算数",
} as const;

function foreignEntities(statement: ConsolidatedStatementOutput) {
  const byId = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const line of statement.lines) {
    for (const entity of line.entityAmounts ?? []) {
      const trace = entity.translationTrace;
      if (trace && trace.sourceCurrency !== trace.presentationCurrency && !byId.has(entity.entitySnapshotId)) {
        byId.set(entity.entitySnapshotId, entity);
      }
    }
  }
  return [...byId.values()].sort((left, right) => left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true }));
}

function entityLineAmount(line: ConsolidatedOutputLine, entitySnapshotId: number) {
  return line.entityAmounts?.find((entity) => entity.entitySnapshotId === entitySnapshotId) ?? null;
}

function exactDerivedFormula(input: Parameters<typeof statementLineFormula>[0]) {
  try {
    return statementLineFormula(input);
  } catch {
    // 部分折算小计含滚算或平衡项，不能用看似可见但不闭合的公式伪造差额。
    return null;
  }
}

function buildSheet(report: ConsolidatedReportOutputPackage, statement: ConsolidatedStatementOutput) {
  const entities = foreignEntities(statement);
  const rows: FinanceWorkbookCell[][] = [
    [`${statement.label} · 外币报表折算底稿`, "", "", "", "", ""],
    [`集团列报币种：${report.batch.presentationCurrency ?? "CNY"}`, `会计期间：${report.batch.year}.${String(report.batch.month).padStart(2, "0")}`, "", "", "", "单位：元"],
    ["公司 / 报表项目", "原币", "原币金额", "折算依据", "适用汇率", "折算后金额"],
  ];
  for (const entity of entities) {
    const entityLines = statement.lines.filter((line) => entityLineAmount(line, entity.entitySnapshotId)?.translationTrace);
    const startRow = rows.length + 2;
    const rowByCode = new Map(entityLines.map((line, index) => [line.lineCode, startRow + index]));
    const valueByCode = new Map(entityLines.map((line) => [
      line.lineCode,
      entityLineAmount(line, entity.entitySnapshotId)!.translationTrace!.current.translatedAmount,
    ]));
    rows.push([`${entity.companyCode} ${entity.companyName}`, "", "", "", "", ""]);
    for (const line of entityLines) {
      const entityAmount = entityLineAmount(line, entity.entitySnapshotId)!;
      const trace = entityAmount.translationTrace!.current;
      const excelRow = rows.length + 1;
      const derivedFormula = exactDerivedFormula({
        reportType: statement.reportType,
        line,
        lines: entityLines,
        rowByCode,
        valueByCode,
        cachedValue: trace.translatedAmount,
        column: "F",
        consolidated: true,
      });
      const directFormula = trace.rate === null ? null : `ROUND(C${excelRow}*E${excelRow},2)`;
      rows.push([
        line.label,
        entityAmount.translationTrace!.sourceCurrency,
        trace.sourceAmount,
        BASIS_LABELS[trace.basis],
        trace.rate ?? "",
        directFormula || derivedFormula
          ? workbookFormula(directFormula ?? derivedFormula!, trace.translatedAmount)
          : trace.translatedAmount,
      ]);
    }
  }
  if (entities.length === 0) rows.push(["当前合并范围没有需要折算的外币公司", "", "", "", "", ""]);
  const sheet = formulaAwareSheet(rows);
  sheet["!merges"] = [XLSX.utils.decode_range("A1:F1")];
  sheet["!cols"] = [{ wch: 38 }, { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 18 }];
  sheet["!autofilter"] = { ref: `A3:F${rows.length}` };
  for (let row = 4; row <= rows.length; row += 1) {
    for (const column of [3, 6]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell && typeof cell.v === "number") cell.z = AMOUNT_FORMAT;
    }
    const rate = sheet[XLSX.utils.encode_cell({ r: row - 1, c: 4 })];
    if (rate && typeof rate.v === "number") rate.z = RATE_FORMAT;
  }
  return sheet;
}

export function buildFxTranslationWorkpaperWorkbook(report: ConsolidatedReportOutputPackage): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [reportType, sheetName] of SHEETS) {
    const statement = report.statements.find((candidate) => candidate.reportType === reportType);
    if (!statement) throw new Error(`缺少${sheetName}数据`);
    XLSX.utils.book_append_sheet(workbook, buildSheet(report, statement), sheetName);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function fxTranslationWorkpaperFilename(report: ConsolidatedReportOutputPackage) {
  const entity = report.batch.parentCompanyName.replace(/[\\/:*?"<>|]/g, "_");
  return `${entity}-${report.batch.year}.${String(report.batch.month).padStart(2, "0")}-外币报表折算底稿.xlsx`;
}
