import { buildFinancePeriodScopeCommand } from "../../domain/finance-validation";
import { CASH_FLOW_LINES, type CashFlowLineConfig } from "./cash-flow-lines";
import { INCOME_STATEMENT_LINES, type IncomeLineConfig } from "./income-statement-lines";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export interface IncomeStatementLineRow {
  lineCode: string;
  label: string;
  section: string;
  side: "debit" | "credit";
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
  prefixes: string[];
  direction: "debit" | "credit";
  subtract: boolean;
}

export interface CashFlowLineRow {
  lineCode: string;
  label: string;
  section: string;
  side: "debit" | "credit";
  direction: "in" | "out" | "net";
  isSubtotal: boolean;
  isGrandTotal: boolean;
  isHeader: boolean;
  prefixes: string[];
}

/** Report layouts are statutory product configuration and are not tenant-editable. */
export async function loadIncomeStatementConfig(
  companyCode: string,
  year: number,
): Promise<IncomeStatementLineRow[]> {
  validateScope(companyCode, year);
  return INCOME_STATEMENT_LINES.map((line) => ({
    lineCode: line.lineCode,
    label: line.label,
    section: incomeLineSection(line),
    side: line.direction,
    isHeader: !!line.isHeader,
    isTotal: !!line.isTotal,
    isGrandTotal: !!line.isGrandTotal,
    prefixes: pickReportPrefixes(line, companyCode),
    direction: line.direction,
    subtract: !!line.subtract,
  }));
}

export async function loadCashFlowConfig(
  companyCode: string,
  year: number,
): Promise<CashFlowLineRow[]> {
  validateScope(companyCode, year);
  return CASH_FLOW_LINES.map((line) => ({
    lineCode: line.lineCode,
    label: line.label,
    section: line.section,
    side: cashFlowLineSide(line),
    direction: line.direction,
    isSubtotal: !!line.isSubtotal,
    isGrandTotal: !!line.isGrandTotal,
    isHeader: !!line.isHeader,
    prefixes: pickReportPrefixes(line, companyCode),
  }));
}

function validateScope(companyCode: string, year: number): void {
  const command = buildFinancePeriodScopeCommand({ companyCode, year });
  if (!command.ok) throw new Error(command.issue.message);
}

function pickReportPrefixes(
  line: IncomeLineConfig | CashFlowLineConfig,
  companyCode: string,
): string[] {
  const prefixSet = getTenantProfile().finance.countryReportProfiles.find((profile) => profile.companyCodes.includes(companyCode))?.prefixSet ?? "chn";
  return [...(prefixSet === "can" ? line.canPrefixes ?? [] : line.chnPrefixes ?? [])];
}

function incomeLineSection(line: IncomeLineConfig): string {
  return line.lineCode === "nonRev" || line.lineCode === "nonExp"
    ? "nonOperating"
    : "operating";
}

function cashFlowLineSide(line: CashFlowLineConfig): "debit" | "credit" {
  return line.direction === "out" ? "credit" : "debit";
}
