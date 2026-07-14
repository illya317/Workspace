import * as XLSX from "xlsx";
import { BALANCE_SHEET_LINES } from "@workspace/finance/server/statements/config/balance-sheet-lines";
import { INCOME_STATEMENT_LINES } from "@workspace/finance/server/statements/config/income-statement-lines";
import { CASH_FLOW_LINES } from "@workspace/finance/server/statements/config/cash-flow-lines";

export type StatementReportType = "balanceSheet" | "incomeStatement" | "cashFlow";

export interface ImportedStatementLine {
  lineCode: string;
  previousAmount: number;
  currentAmount: number;
  sourceLabel: string;
  sortOrder: number;
}

export interface ImportedStatementSheet {
  reportType: StatementReportType;
  previousYear: number;
  currentYear: number;
  lines: ImportedStatementLine[];
}

export interface ImportedStatementWorkbook {
  companyText: string;
  sheets: ImportedStatementSheet[];
}

type Row = unknown[];

function amount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizedLabel(value: unknown): string {
  return text(value)
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/^[一二三四五六七八九十]+、/, "")
    .replace(/[\s　:："“”'‘’－-]/g, "")
    .replace(/其它/g, "其他")
    .replace(/收到的/g, "收到")
    .replace(/支付的/g, "支付")
    .replace(/所收到/g, "收到")
    .replace(/所收回/g, "收回")
    .replace(/所支付/g, "支付")
    .replace(/现金及现金等价物/g, "现金");
}

function yearFromWorkbook(rows: Row[], fallback: number): number {
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      const match = text(cell).match(/(20\d{2})年/);
      if (match) return Number(match[1]);
    }
  }
  return fallback;
}

function findCompanyText(rows: Row[]): string {
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      const value = text(cell);
      if (/^(编制)?单位[：:]/.test(value)) return value.replace(/^(编制)?单位[：:]/, "").trim();
    }
  }
  return "";
}

function lineLookup(lines: { lineCode: string; label: string }[]) {
  return new Map(lines.map((line) => [normalizedLabel(line.label), line.lineCode]));
}

const BALANCE_LOOKUP = lineLookup(BALANCE_SHEET_LINES);
const INCOME_LOOKUP = lineLookup(INCOME_STATEMENT_LINES);
const CASH_FLOW_LOOKUP = lineLookup(CASH_FLOW_LINES);

const BALANCE_ALIASES = new Map<string, string>([
  [normalizedLabel("可供出售金融资产"), "otherEquityInvest"],
  [normalizedLabel("持有至到期投资"), "debtInvest"],
  [normalizedLabel("工程物资"), "constructionInProgress"],
]);

function resolveBalanceLine(label: unknown) {
  const normalized = normalizedLabel(label);
  return BALANCE_LOOKUP.get(normalized) ?? BALANCE_ALIASES.get(normalized);
}

function resolveCashFlowLine(label: unknown, section: "operating" | "investing" | "financing" | null) {
  const normalized = normalizedLabel(label);
  const direct = CASH_FLOW_LOOKUP.get(normalized);
  if (direct) return direct;
  if (normalized === normalizedLabel("现金流入小计") && section) return `${section}InSubtotal`;
  if (normalized === normalizedLabel("现金流出小计") && section) return `${section}OutSubtotal`;
  const aliases = new Map<string, string>([
    [normalizedLabel("借款所收到的现金"), "loanReceipt"],
    [normalizedLabel("投资所支付的现金"), "investPayment"],
    [normalizedLabel("四、汇率变动对现金的影响"), "fxEffect"],
  ]);
  return aliases.get(normalized);
}

function parsedLine(
  lineCode: string | undefined,
  row: Row,
  labelColumn: number,
  previousColumn: number,
  currentColumn: number,
  sortOrder: number,
): ImportedStatementLine | null {
  if (!lineCode) return null;
  return {
    lineCode,
    previousAmount: amount(row[previousColumn]),
    currentAmount: amount(row[currentColumn]),
    sourceLabel: text(row[labelColumn]),
    sortOrder,
  };
}

function uniqueLines(lines: ImportedStatementLine[]): ImportedStatementLine[] {
  const byLineCode = new Map<string, ImportedStatementLine>();
  for (const line of lines) if (!byLineCode.has(line.lineCode)) byLineCode.set(line.lineCode, line);
  return [...byLineCode.values()];
}

function parseBalance(rows: Row[], currentYear: number): ImportedStatementSheet {
  const lines: ImportedStatementLine[] = [];
  for (const [index, row] of rows.entries()) {
    const asset = parsedLine(resolveBalanceLine(row[0]), row, 0, 1, 2, index);
    const liabilityEquity = parsedLine(resolveBalanceLine(row[3]), row, 3, 4, 5, index + 100);
    if (asset) lines.push(asset);
    if (liabilityEquity) lines.push(liabilityEquity);
  }
  return { reportType: "balanceSheet", previousYear: currentYear - 1, currentYear, lines: uniqueLines(lines) };
}

function parseIncome(rows: Row[], currentYear: number): ImportedStatementSheet {
  const lines = rows.flatMap((row, index) => {
    const parsed = parsedLine(INCOME_LOOKUP.get(normalizedLabel(row[0])), row, 0, 1, 2, index);
    return parsed ? [parsed] : [];
  });
  return { reportType: "incomeStatement", previousYear: currentYear - 1, currentYear, lines: uniqueLines(lines) };
}

function parseCashFlow(rows: Row[], currentYear: number): ImportedStatementSheet {
  let section: "operating" | "investing" | "financing" | null = null;
  const lines: ImportedStatementLine[] = [];
  for (const [index, row] of rows.entries()) {
    const label = normalizedLabel(row[0]);
    if (label.includes("经营活动产生")) section = "operating";
    if (label.includes("投资活动产生")) section = "investing";
    if (label.includes("筹资活动产生")) section = "financing";
    const parsed = parsedLine(resolveCashFlowLine(row[0], section), row, 0, 1, 2, index);
    if (parsed) lines.push(parsed);
  }
  return { reportType: "cashFlow", previousYear: currentYear - 1, currentYear, lines: uniqueLines(lines) };
}

export function readFinancialStatementWorkbook(filePath: string): ImportedStatementWorkbook {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const balanceRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets["资产负债表"], { header: 1, raw: true, defval: null });
  const incomeRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets["利润表"], { header: 1, raw: true, defval: null });
  const cashFlowRows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets["现金流量表"], { header: 1, raw: true, defval: null });
  const filenameYear = Number(filePath.match(/20\d{2}/)?.[0] ?? new Date().getFullYear());
  const currentYear = yearFromWorkbook(incomeRows, filenameYear);
  return {
    companyText: findCompanyText(balanceRows) || findCompanyText(incomeRows),
    sheets: [
      parseBalance(balanceRows, currentYear),
      parseIncome(incomeRows, currentYear),
      parseCashFlow(cashFlowRows, currentYear),
    ],
  };
}
