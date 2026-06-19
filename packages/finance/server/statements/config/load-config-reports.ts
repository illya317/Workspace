/** P3 Batch 1: line config loaders for income + cash flow. */
import { prisma } from "@workspace/platform/server/prisma";
import { INCOME_STATEMENT_LINES, type IncomeLineConfig } from "./income-statement-lines";
import { CASH_FLOW_LINES, type CashFlowLineConfig } from "./cash-flow-lines";

/** Pick the prefix list for an income / cash flow line, given the company. */
function pickReportPrefixes(
  line: IncomeLineConfig | CashFlowLineConfig,
  companyCode: string,
): string[] {
  if (companyCode === "05") return line.canPrefixes ?? [];
  return line.chnPrefixes ?? [];
}

/** Map income line's direction to the DB side field. */
function incomeLineSide(line: IncomeLineConfig): "debit" | "credit" {
  return line.direction;
}

/** Map cash flow line's direction to the DB side field. */
function cashFlowLineSide(line: CashFlowLineConfig): "debit" | "credit" {
  if (line.direction === "in") return "debit";
  if (line.direction === "out") return "credit";
  return "debit"; // net → default; compute will derive the actual sign
}

/** Income line → section (operating / nonOperating). */
function incomeLineSection(line: IncomeLineConfig): string {
  if (line.lineCode === "nonRev" || line.lineCode === "nonExp") return "nonOperating";
  return "operating";
}

// ─── Income statement config loader ─────────────────────────

export interface IncomeStatementLineRow {
  lineCode: string;
  label: string;
  section: string;
  side: "debit" | "credit";
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
  /**
   * Account code prefixes for this line. For company 05 (加拿大) this is
   * canPrefixes from the TS default; for all others it is chnPrefixes.
   * Sourced from FinanceStatementLineConfig.prefixesJson.
   */
  prefixes: string[];
  direction: "debit" | "credit";
  subtract: boolean;
}

export async function loadIncomeStatementConfig(
  companyCode: string,
  year: number,
): Promise<IncomeStatementLineRow[]> {
  // 1. Try DB config
  const dbLines = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "incomeStatement", enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  if (dbLines.length > 0) {
    return dbLines.map(toIncomeRow);
  }
  // 2. Inherit from previous year
  if (year > 2024) {
    const prevLines = await prisma.financeStatementLineConfig.findMany({
      where: { companyCode, year: year - 1, reportType: "incomeStatement", enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    if (prevLines.length > 0) {
      for (const pl of prevLines) {
        await prisma.financeStatementLineConfig.upsert({
          where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "incomeStatement", lineCode: pl.lineCode } },
          create: {
            companyCode, year, reportType: "incomeStatement",
            lineCode: pl.lineCode, label: pl.label, displayCode: pl.displayCode,
            section: pl.section, side: pl.side, sortOrder: pl.sortOrder,
            prefixesJson: pl.prefixesJson, subtractPrefixesJson: pl.subtractPrefixesJson,
            formulaJson: pl.formulaJson,
            reclassSource: pl.reclassSource, reclassTarget: pl.reclassTarget,
            isHeader: pl.isHeader, isTotal: pl.isTotal, isGrandTotal: pl.isGrandTotal,
          },
          update: {},
        });
      }
      const copied = await prisma.financeStatementLineConfig.findMany({
        where: { companyCode, year, reportType: "incomeStatement", enabled: true },
        orderBy: { sortOrder: "asc" },
      });
      return copied.map(toIncomeRow);
    }
  }
  // 3. Seed from TS default
  let order = 0;
  for (const line of INCOME_STATEMENT_LINES) {
    const chnPrefixes = pickReportPrefixes(line, companyCode);
    await prisma.financeStatementLineConfig.upsert({
      where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "incomeStatement", lineCode: line.lineCode } },
      create: {
        companyCode, year, reportType: "incomeStatement",
        lineCode: line.lineCode, label: line.label, displayCode: "",
        section: incomeLineSection(line), side: incomeLineSide(line),
        sortOrder: order++,
        prefixesJson: JSON.stringify(chnPrefixes),
        subtractPrefixesJson: "[]", formulaJson: "{}",
        reclassSource: false, reclassTarget: false,
        isHeader: false, isTotal: !!line.isTotal, isGrandTotal: !!line.isGrandTotal,
      },
      update: {},
    });
  }
  const seeded = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "incomeStatement", enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  return seeded.map(toIncomeRow);
}

function toIncomeRow(db: {
  lineCode: string; label: string; section: string; side: string;
  isHeader: boolean; isTotal: boolean; isGrandTotal: boolean;
  prefixesJson: string;
}): IncomeStatementLineRow {
  return {
    lineCode: db.lineCode, label: db.label, section: db.section,
    side: db.side as "debit" | "credit",
    isHeader: db.isHeader, isTotal: db.isTotal, isGrandTotal: db.isGrandTotal,
    prefixes: parsePrefixesJson(db.prefixesJson),
    direction: db.side as "debit" | "credit", subtract: false,
  };
}

function parsePrefixesJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ─── Cash flow config loader ───────────────────────────────

export interface CashFlowLineRow {
  lineCode: string;
  label: string;
  section: string;
  side: "debit" | "credit";
  direction: "in" | "out" | "net";
  isSubtotal: boolean;
  isGrandTotal: boolean;
  /**
   * Account code prefixes for this line. For company 05 (加拿大) this is
   * canPrefixes from the TS default; for all others it is chnPrefixes.
   * Sourced from FinanceStatementLineConfig.prefixesJson.
   */
  prefixes: string[];
}

const CASH_FLOW_NET_LINE_CODES = new Set([
  "operatingInSubtotal", "operatingOutSubtotal", "operatingNet",
  "investingInSubtotal", "investingOutSubtotal", "investingNet",
  "financingInSubtotal", "financingOutSubtotal", "financingNet",
  "netIncrease", "endingCash",
]);
const CASH_FLOW_OUT_LINE_CODES = new Set([
  "purchasePayment", "staffPayment", "taxPayment", "otherOpOut",
  "fixedAssetPurchase", "investPayment", "otherInvOut",
  "loanRepayment", "dividendPayment", "otherFinOut",
]);

export async function loadCashFlowConfig(
  companyCode: string,
  year: number,
): Promise<CashFlowLineRow[]> {
  // 1. Try DB config
  const dbLines = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "cashFlow", enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  if (dbLines.length > 0) {
    return dbLines.map((db) => deriveCashFlowRow(db));
  }
  // 2. Inherit from previous year
  if (year > 2024) {
    const prevLines = await prisma.financeStatementLineConfig.findMany({
      where: { companyCode, year: year - 1, reportType: "cashFlow", enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    if (prevLines.length > 0) {
      for (const pl of prevLines) {
        await prisma.financeStatementLineConfig.upsert({
          where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "cashFlow", lineCode: pl.lineCode } },
          create: {
            companyCode, year, reportType: "cashFlow",
            lineCode: pl.lineCode, label: pl.label, displayCode: pl.displayCode,
            section: pl.section, side: pl.side, sortOrder: pl.sortOrder,
            prefixesJson: pl.prefixesJson, subtractPrefixesJson: pl.subtractPrefixesJson,
            formulaJson: pl.formulaJson,
            reclassSource: pl.reclassSource, reclassTarget: pl.reclassTarget,
            isHeader: pl.isHeader, isTotal: pl.isTotal, isGrandTotal: pl.isGrandTotal,
          },
          update: {},
        });
      }
      const copied = await prisma.financeStatementLineConfig.findMany({
        where: { companyCode, year, reportType: "cashFlow", enabled: true },
        orderBy: { sortOrder: "asc" },
      });
      return copied.map(deriveCashFlowRow);
    }
  }
  // 3. Seed from TS default
  let order = 0;
  for (const line of CASH_FLOW_LINES) {
    const chnPrefixes = pickReportPrefixes(line, companyCode);
    await prisma.financeStatementLineConfig.upsert({
      where: { companyCode_year_reportType_lineCode: { companyCode, year, reportType: "cashFlow", lineCode: line.lineCode } },
      create: {
        companyCode, year, reportType: "cashFlow",
        lineCode: line.lineCode, label: line.label, displayCode: "",
        section: line.section, side: cashFlowLineSide(line),
        sortOrder: order++,
        prefixesJson: JSON.stringify(chnPrefixes),
        subtractPrefixesJson: "[]", formulaJson: "{}",
        reclassSource: false, reclassTarget: false,
        isHeader: false,
        isTotal: !!line.isSubtotal, isGrandTotal: !!line.isGrandTotal,
      },
      update: {},
    });
  }
  const seeded = await prisma.financeStatementLineConfig.findMany({
    where: { companyCode, year, reportType: "cashFlow", enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  return seeded.map(deriveCashFlowRow);
}

function deriveCashFlowRow(db: {
  lineCode: string; label: string; section: string; side: string;
  isTotal: boolean; isGrandTotal: boolean;
  prefixesJson: string;
}): CashFlowLineRow {
  let direction: "in" | "out" | "net";
  if (CASH_FLOW_NET_LINE_CODES.has(db.lineCode)) direction = "net";
  else if (CASH_FLOW_OUT_LINE_CODES.has(db.lineCode)) direction = "out";
  else direction = "in";
  return {
    lineCode: db.lineCode, label: db.label, section: db.section,
    side: db.side as "debit" | "credit", direction,
    isSubtotal: db.isTotal, isGrandTotal: db.isGrandTotal,
    prefixes: parsePrefixesJson(db.prefixesJson),
  };
}
