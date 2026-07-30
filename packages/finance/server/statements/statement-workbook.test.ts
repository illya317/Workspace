import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type { StatementPageData, StatementPageLine } from "./statement-page-data";
import { buildStatementWorkbook, statementWorkbookFilename } from "./statement-workbook";

function line(input: Partial<StatementPageLine> & Pick<StatementPageLine, "lineCode" | "label" | "amount">): StatementPageLine {
  return {
    lineCode: input.lineCode,
    code: input.code ?? null,
    label: input.label,
    amount: input.amount,
    currentMonthAmount: input.currentMonthAmount,
    previousAmount: input.previousAmount ?? 0,
    section: input.section ?? "operating",
    side: input.side ?? "debit",
    direction: input.direction ?? null,
    subtract: input.subtract ?? false,
    isHeader: input.isHeader ?? false,
    isTotal: input.isTotal ?? false,
    isGrandTotal: input.isGrandTotal ?? false,
  };
}

const data: StatementPageData = {
  mode: "standalone",
  scope: {
    companyCode: "ZX01",
    companyName: "示例集团有限公司",
    year: 2025,
    month: 12,
    periodKind: "month",
    batchId: null,
    batchStatus: null,
  },
  statements: [
    {
      reportType: "balanceSheet",
      label: "资产负债表",
      source: "system",
      diagnostics: [],
      lines: [
        line({ lineCode: "cash", label: "货币资金", amount: 120, previousAmount: 100, section: "currentAssets", side: "debit" }),
        line({ lineCode: "totalAssets", label: "资产总计", amount: 120, previousAmount: 100, section: "nonCurrentAssets", side: "debit", isGrandTotal: true }),
        line({ lineCode: "payable", label: "应付账款", amount: 20, previousAmount: 10, section: "currentLiabilities", side: "credit" }),
        line({ lineCode: "totalLiabilities", label: "负债合计", amount: 20, previousAmount: 10, section: "nonCurrentLiabilities", side: "credit", isGrandTotal: true }),
        line({ lineCode: "totalEquity", label: "所有者权益合计", amount: 100, previousAmount: 90, section: "equity", side: "credit", isGrandTotal: true }),
      ],
      totals: {
        totalAssets: 120,
        previousTotalAssets: 100,
        totalLiabilitiesAndEquity: 120,
        previousTotalLiabilitiesAndEquity: 100,
      },
    },
    {
      reportType: "incomeStatement",
      label: "利润表",
      source: "system",
      diagnostics: [],
      lines: [line({ lineCode: "revenue", label: "一、营业收入", amount: 50, currentMonthAmount: 6, previousAmount: 40 })],
      totals: {},
    },
    {
      reportType: "cashFlow",
      label: "现金流量表",
      source: "system",
      diagnostics: [],
      lines: [line({ lineCode: "endingCash", label: "六、期末现金及现金等价物余额", amount: 120, currentMonthAmount: 12, previousAmount: 100, isGrandTotal: true })],
      totals: { endingCash: 120 },
    },
  ],
};

test("statement workbook exports exactly the three statutory statements in order", () => {
  const workbook = XLSX.read(buildStatementWorkbook(data), { type: "buffer", cellNF: true, cellStyles: true });
  assert.deepEqual(workbook.SheetNames, ["资产负债表", "利润表", "现金流量表"]);
  for (const sheetName of workbook.SheetNames) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, raw: true }).flat();
    assert.equal(values.includes("行次"), false);
  }

  const balance = workbook.Sheets["资产负债表"]!;
  assert.equal(balance.A1?.v, "资产负债表");
  assert.equal(balance.A2?.v, "编制单位：示例集团有限公司");
  assert.equal(balance.D2?.v, "2025年12月31日");
  assert.equal(balance.B4?.v, 120);
  assert.equal(balance.C4?.v, 100);
  assert.equal(balance.E6?.v, 100);
  assert.equal(balance.E7?.v, 120);
  assert.equal(balance.E7?.f, "ROUND(SUM(E5,E6),2)");
  assert.equal(balance.B3?.v, "期末余额");
  assert.equal(balance.C3?.v, "上年年末余额");
  assert.equal(balance.E3?.v, "期末余额");
  assert.equal(balance.F3?.v, "上年年末余额");

  const income = workbook.Sheets["利润表"]!;
  assert.equal(income.A1?.v, "利润表");
  assert.equal(income.B2?.v, "2025年12月");
  assert.equal(income.B3?.v, "本期金额");
  assert.equal(income.C3?.v, "上期金额");
  assert.equal(income.B4?.v, 50);
  assert.equal(income.C4?.v, 40);

  const cashFlow = workbook.Sheets["现金流量表"]!;
  assert.equal(cashFlow.A1?.v, "现金流量表");
  assert.equal(cashFlow.B2?.v, "2025年12月");
  assert.equal(cashFlow.B3?.v, "本期金额");
  assert.equal(cashFlow.C3?.v, "上期金额");
  assert.equal(cashFlow.B4?.v, 120);
  assert.equal(cashFlow.B4?.f, undefined);
  assert.equal(cashFlow.C4?.v, 100);
  assert.equal(cashFlow.C4?.f, undefined);
  assert.ok((income["!cols"]?.[0]?.wch ?? 0) >= 50);
  assert.ok((income["!cols"]?.[1]?.wch ?? 0) >= 18);
  assert.equal(statementWorkbookFilename(data), "示例集团有限公司-2025.12-财务报表.xlsx");
});
