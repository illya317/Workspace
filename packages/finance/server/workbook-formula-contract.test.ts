import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFinanceWorkbookFormula,
  financeWorkbookFormulaHardcodedNumbers,
  formulaFromVisibleCalculation,
  workbookFormula,
} from "./workbook-formula-contract";

test("finance workbook formula gate allows cell coordinates and structural integers", () => {
  for (const formula of [
    "ROUND(SUM(A2:A12),2)",
    "ROUND(MAX(D2-E2,0),2)",
    "ROUND((A2+B2)*2,2)",
    "ROUND(A2/3,2)",
    "ROUND(2*A2,2)",
    "IF(A2=0,B2,C2)",
  ]) {
    assert.doesNotThrow(() => assertFinanceWorkbookFormula(formula));
  }
});

test("finance workbook formula gate rejects business amounts, rates, and residual plugs", () => {
  for (const formula of [
    "ROUND(A2+0.01,2)",
    "ROUND(A2-2901.17,2)",
    "ROUND(A2*4.7847,2)",
    "ROUND(A2*2901,2)",
    "ROUND(A2^2,2)",
    "120.00",
    "IF(A2>100,B2,C2)",
  ]) {
    assert.notEqual(financeWorkbookFormulaHardcodedNumbers(formula).length, 0, formula);
    assert.throws(() => workbookFormula(formula, 1), /禁止硬编码数字/);
  }
});

test("visible calculation formula fails closed instead of plugging a difference", () => {
  assert.equal(formulaFromVisibleCalculation("A2+B2", 100, 100), "ROUND(A2+B2,2)");
  assert.throws(
    () => formulaFromVisibleCalculation("A2+B2", 100, 99.99, "测试合计"),
    /测试合计的可见公式与后台金额相差 -0.01/,
  );
});
