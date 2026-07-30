import type { StatementReportType } from "@workspace/finance/types";
import { formulaFromVisibleCalculation } from "../workbook-formula-contract";

interface FormulaLine {
  lineCode: string;
  section: string;
  side: "debit" | "credit";
  subtract: boolean;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
}

interface StatementFormulaInput {
  reportType: StatementReportType;
  line: FormulaLine;
  lines: readonly FormulaLine[];
  rowByCode: ReadonlyMap<string, number>;
  valueByCode: ReadonlyMap<string, number>;
  cachedValue: number;
  column: string;
  consolidated: boolean;
}

const INCOME_RELATIONSHIPS: Record<string, { add: string[]; subtract?: string[] }> = {
  operatingProfit: {
    add: ["revenue", "fairValueGain", "invest", "associateJointVentureIncome", "otherIncome"],
    subtract: ["cost", "tax", "sales", "admin", "rd", "finance", "assetLoss", "creditLoss"],
  },
  totalProfit: {
    add: ["operatingProfit", "nonRev"],
    subtract: ["nonExp", "nonCurrentAssetDisposalLoss"],
  },
  netProfit: { add: ["totalProfit"], subtract: ["incomeTax"] },
  netProfitAttributableToParent: {
    add: ["netProfit"],
    subtract: ["netProfitAttributableToNci"],
  },
};

const CASH_FLOW_RELATIONSHIPS: Record<string, { add: string[]; subtract?: string[] }> = {
  operatingInSubtotal: { add: ["salesReceipt", "taxRefund", "otherOpIn"] },
  operatingOutSubtotal: { add: ["purchasePayment", "staffPayment", "taxPayment", "otherOpOut"] },
  operatingNet: { add: ["operatingInSubtotal"], subtract: ["operatingOutSubtotal"] },
  investingInSubtotal: { add: ["investRecovery", "investIncome", "fixedAssetDisposal", "subsidiaryDisposal", "otherInvIn"] },
  investingOutSubtotal: { add: ["fixedAssetPurchase", "investPayment", "subsidiaryAcquisition", "otherInvOut"] },
  investingNet: { add: ["investingInSubtotal"], subtract: ["investingOutSubtotal"] },
  financingInSubtotal: { add: ["capitalInjection", "loanReceipt", "otherFinIn"] },
  financingOutSubtotal: { add: ["loanRepayment", "dividendPayment", "otherFinOut"] },
  financingNet: { add: ["financingInSubtotal"], subtract: ["financingOutSubtotal"] },
  netIncrease: { add: ["operatingNet", "investingNet", "financingNet", "fxEffect"] },
  endingCash: { add: ["openingCash", "netIncrease"] },
};

export function statementLineFormula(input: StatementFormulaInput): string | null {
  if (input.line.isHeader) return null;
  if (input.reportType === "balanceSheet") return balanceFormula(input);
  const relationships = input.reportType === "incomeStatement"
    ? INCOME_RELATIONSHIPS
    : CASH_FLOW_RELATIONSHIPS;
  if (input.reportType === "cashFlow" && input.line.lineCode === "endingCash" && !input.consolidated) {
    return null;
  }
  return relationshipFormula(
    relationships[input.line.lineCode],
    input.rowByCode,
    input.valueByCode,
    input.cachedValue,
    input.column,
  );
}

function balanceFormula(input: StatementFormulaInput) {
  let dependencyCodes: string[] = [];
  if (input.line.isTotal) {
    dependencyCodes = input.lines
      .filter((line) => line.section === input.line.section)
      .filter((line) => !line.isHeader && !line.isTotal && !line.isGrandTotal)
      .map((line) => line.lineCode);
  } else if (input.line.lineCode === "totalAssets") {
    dependencyCodes = ["totalCurrentAssets", "totalNonCurrentAssets"];
  } else if (input.line.lineCode === "totalLiabilities") {
    dependencyCodes = ["totalCurrentLiabilities", "totalNonCurrentLiabilities"];
  } else if (input.line.lineCode === "totalLiabilitiesAndEquity") {
    dependencyCodes = ["totalLiabilities", "totalEquity"];
  }
  return relationshipFormula(
    dependencyCodes.length ? { add: dependencyCodes } : undefined,
    input.rowByCode,
    input.valueByCode,
    input.cachedValue,
    input.column,
  );
}

function relationshipFormula(
  relationship: { add: string[]; subtract?: string[] } | undefined,
  rowByCode: ReadonlyMap<string, number>,
  valueByCode: ReadonlyMap<string, number>,
  cachedValue: number,
  column: string,
) {
  if (!relationship) return null;
  const add = references(relationship.add, rowByCode, column);
  const subtract = references(relationship.subtract ?? [], rowByCode, column);
  if (add.length !== relationship.add.length || subtract.length !== (relationship.subtract?.length ?? 0)) {
    return null;
  }
  const dependencyCodes = [...relationship.add, ...(relationship.subtract ?? [])];
  if (dependencyCodes.some((code) => !valueByCode.has(code))) return null;
  const visibleCalculatedValue = money(
    sumVisibleValues(relationship.add, valueByCode)
      - sumVisibleValues(relationship.subtract ?? [], valueByCode),
  );
  const addExpression = sumExpression(add);
  const expression = subtract.length
    ? `${addExpression}-${sumExpression(subtract)}`
    : addExpression;
  return formulaFromVisibleCalculation(
    expression,
    visibleCalculatedValue,
    cachedValue,
    "报表派生行",
  );
}

function sumVisibleValues(
  codes: readonly string[],
  valueByCode: ReadonlyMap<string, number>,
) {
  return codes.reduce((sum, code) => sum + valueByCode.get(code)!, 0);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function references(codes: readonly string[], rowByCode: ReadonlyMap<string, number>, column: string) {
  return codes.flatMap((code) => {
    const row = rowByCode.get(code);
    return row === undefined ? [] : [`${column}${row}`];
  });
}

function sumExpression(references: readonly string[]) {
  if (references.length === 1) return references[0]!;
  return `SUM(${references.join(",")})`;
}
