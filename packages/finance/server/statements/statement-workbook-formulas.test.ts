import assert from "node:assert/strict";
import test from "node:test";

import { statementLineFormula } from "./statement-workbook-formulas";

const base = {
  section: "operating",
  side: "debit" as const,
  subtract: false,
  isHeader: false,
  isTotal: false,
  isGrandTotal: false,
};

test("exports reconciled visible precedents and rejects numeric plugs", () => {
  const lines = [
    { ...base, lineCode: "operatingNet" },
    { ...base, lineCode: "investingNet" },
    { ...base, lineCode: "financingNet" },
    { ...base, lineCode: "fxEffect" },
    { ...base, lineCode: "netIncrease", isGrandTotal: true },
  ];
  const rowByCode = new Map(lines.map((line, index) => [line.lineCode, index + 4]));
  const valueByCode = new Map(lines.map((line, index) => [line.lineCode, [10, 20, 30, 40, 100][index]!]));
  assert.equal(statementLineFormula({
    reportType: "cashFlow",
    line: lines[4]!,
    lines,
    rowByCode,
    valueByCode,
    cachedValue: 100,
    column: "B",
    consolidated: true,
  }), "ROUND(SUM(B4,B5,B6,B7),2)");

  assert.throws(() => statementLineFormula({
      reportType: "cashFlow",
      line: lines[4]!,
      lines,
      rowByCode,
      valueByCode,
      cachedValue: 99.99,
      column: "B",
      consolidated: true,
    }), /禁止用数字常量补差/);

  rowByCode.delete("fxEffect");
  assert.equal(statementLineFormula({
    reportType: "cashFlow",
    line: lines[4]!,
    lines,
    rowByCode,
    valueByCode,
    cachedValue: 100,
    column: "B",
    consolidated: true,
  }), null);
});

test("keeps standalone ending cash as a source fact and formulas the reconciled consolidated line", () => {
  const lines = [
    { ...base, lineCode: "netIncrease" },
    { ...base, lineCode: "openingCash" },
    { ...base, lineCode: "endingCash", isGrandTotal: true },
  ];
  const rowByCode = new Map(lines.map((line, index) => [line.lineCode, index + 4]));
  const valueByCode = new Map([["netIncrease", 30], ["openingCash", 70], ["endingCash", 100]]);
  assert.equal(statementLineFormula({
    reportType: "cashFlow",
    line: lines[2]!,
    lines,
    rowByCode,
    valueByCode,
    cachedValue: 100,
    column: "B",
    consolidated: false,
  }), null);
  assert.equal(statementLineFormula({
    reportType: "cashFlow",
    line: lines[2]!,
    lines,
    rowByCode,
    valueByCode,
    cachedValue: 100,
    column: "B",
    consolidated: true,
  }), "ROUND(SUM(B5,B4),2)");
});

test("keeps a derived row frozen when no precedent is visible", () => {
  const line = { ...base, lineCode: "netProfit", isGrandTotal: true };
  assert.equal(statementLineFormula({
    reportType: "incomeStatement",
    line,
    lines: [line],
    rowByCode: new Map([[line.lineCode, 4]]),
    valueByCode: new Map([[line.lineCode, 123.45]]),
    cachedValue: 123.45,
    column: "B",
    consolidated: true,
  }), null);
});
