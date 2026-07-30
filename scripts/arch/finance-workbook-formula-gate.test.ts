import assert from "node:assert/strict";
import test from "node:test";

import { analyzeFinanceWorkbookFormulaSource } from "./finance-workbook-formula-gate";

test("finance workbook formula gate permits the shared formula contract", () => {
  const violations = analyzeFinanceWorkbookFormulaSource(
    "packages/finance/server/workbook-formula-contract.ts",
    `
      function assertFinanceWorkbookFormula(formula: string) { return formula; }
      export function workbookFormula(formula: string) {
        assertFinanceWorkbookFormula(formula);
        return { kind: "formula", formula };
      }
    `,
  );
  assert.deepEqual(violations, []);
});

test("finance workbook formula gate blocks raw XLSX formula injection paths", () => {
  const violations = analyzeFinanceWorkbookFormulaSource(
    "packages/finance/server/ledger/example-workbook.ts",
    `
      const raw = { t: "n", v: 1, f: "A1+0.01" };
      const forged = { kind: "formula", formula: "A1+0.01", cachedValue: 1 };
      target.f = "A1+0.01";
      target["f"] = "A1+0.01";
    `,
  );
  assert.equal(violations.length, 4);
  assert.ok(violations.every((violation) => violation.reason.includes("不得绕过 workbookFormula")));
});

test("finance workbook formula gate fails when the shared constructor stops enforcing policy", () => {
  const violations = analyzeFinanceWorkbookFormulaSource(
    "packages/finance/server/workbook-formula-contract.ts",
    "export function workbookFormula(formula: string) { return formula; }",
  );
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.reason, /assertFinanceWorkbookFormula/);
});
