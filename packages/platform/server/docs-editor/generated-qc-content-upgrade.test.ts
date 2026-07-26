import assert from "node:assert/strict";
import test from "node:test";
import { upgradeGeneratedQcUserContent } from "./generated-qc-content-upgrade";

test("upgrades user-edited QC content without replacing unrelated edits", () => {
  const document = {
    customNote: "保留人工修改",
    blocks: [{ align: "left", parts: [
      { type: "text", text: "样 1=" },
      { type: "formulaSlot", fieldKey: "intermediate/content/product_12_uv/yang_1_han_liang" },
      { type: "text", text: "×100%=" },
    ] }],
  };
  const fieldModel: { fields: { standard: { fieldKey: string; name: string; unit: string; formulaInputMode?: "percent" } } } = { fields: { standard: { fieldKey: "standard", name: "人工标签", unit: "%" } } };
  const sourceFieldModel = { fields: { standard: { fieldKey: "standard", formulaInputMode: "percent" } } };

  const result = upgradeGeneratedQcUserContent({ productKey: "product_12", document, fieldModel, sourceFieldModel, resultSuffixUpgradeRules: [{ productKey: "product_12", fieldKeyPattern: "/product_12_uv/yang_[12]_han_liang$" }] });

  assert.equal(result.changed, true);
  assert.equal(document.customNote, "保留人工修改");
  assert.equal(document.blocks[0].align, "center");
  assert.equal(document.blocks[0].parts[2].text, "%");
  assert.equal(fieldModel.fields.standard.name, "人工标签");
  assert.equal(fieldModel.fields.standard.formulaInputMode, "percent");
});

test("upgrade is idempotent and keeps formula-process multipliers", () => {
  const document = { blocks: [{ parts: [
    { type: "text", text: "________________" },
    { type: "text", text: "×100%=" },
    { type: "formulaSlot", fieldKey: "finished/related_substances/result" },
  ] }] };
  const fieldModel = { fields: { standard: { fieldKey: "standard", formulaInputMode: "percent" } } };

  const result = upgradeGeneratedQcUserContent({ productKey: "product_12", document, fieldModel, sourceFieldModel: fieldModel, resultSuffixUpgradeRules: [{ productKey: "product_12", fieldKeyPattern: "/product_12_uv/yang_[12]_han_liang$" }] });

  assert.equal(result.changed, false);
  assert.equal(document.blocks[0].parts[1].text, "×100%=");
});

test("centers summary results across QC products but leaves calculation rows aligned", () => {
  const document = { blocks: [
    { align: "left", parts: [{ type: "text", text: "样 1：" }, { type: "formulaSlot", fieldKey: "finished/content/result" }, { type: "text", text: "%" }] },
    { align: "left", parts: [{ type: "text", text: "m=" }, { type: "fieldSlot", fieldKey: "gross" }, { type: "text", text: "-" }, { type: "fieldSlot", fieldKey: "tare" }, { type: "text", text: "=" }, { type: "formulaSlot", fieldKey: "net" }] },
  ] };

  const result = upgradeGeneratedQcUserContent({ productKey: "product_02", document, fieldModel: { fields: {} }, sourceFieldModel: { fields: {} }, resultSuffixUpgradeRules: [] });

  assert.equal(result.changed, true);
  assert.equal(document.blocks[0].align, "center");
  assert.equal(document.blocks[1].align, "left");
});
