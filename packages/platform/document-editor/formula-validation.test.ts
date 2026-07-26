import assert from "node:assert/strict";
import test from "node:test";
import { formulaDisplayText, validateFormulaSlotDraft, type FormulaDisplayToken } from "./formula-validation";
import type { EditorSlotInline } from "./types";

const context = "氢氯噻嗪片 / 中间体 / 2.3 含量";
const attrs: EditorSlotInline = {
  type: "formulaSlot",
  fieldKey: "intermediate/content/product_08_hplc_content/yang_1_r_d",
  alias: "y14",
  slotKind: "formula",
  formulaText: "RD(x23, x24)",
  metadata: { source: { productName: "氢氯噻嗪片", stageLabel: "中间体", sequence: "2.3", testName: "含量" } },
};
const tokens: FormulaDisplayToken[] = [
  { fieldKey: "sample-1", alias: "x23", labels: ["样1-1"], context },
  { fieldKey: "sample-2", alias: "x24", labels: ["样1-2"], context },
  { fieldKey: "average-rd", alias: "y17", labels: ["RD"], context, formulaText: "RD(x25, x26)" },
];

test("formula labels do not replace supported function calls", () => {
  assert.equal(formulaDisplayText(attrs, tokens), "RD(x23, x24)");
  const result = validateFormulaSlotDraft(attrs, tokens);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.attrs.formulaText, "RD(x23, x24)");
});

test("short labels do not replace part of a longer function name", () => {
  assert.equal(formulaDisplayText({ ...attrs, formulaText: "RSD(x23, x24)" }, tokens), "RSD(x23, x24)");
});
