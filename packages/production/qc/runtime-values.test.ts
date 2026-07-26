import assert from "node:assert/strict";
import test from "node:test";
import type { EditorDocument, FieldModel } from "@workspace/platform/document-editor";
import { validateQcRuntimeMutation } from "./runtime-values";

const document: EditorDocument = {
  schemaVersion: 1,
  kind: "qc-editor-document",
  id: "qc-runtime-validation",
  title: "QC runtime validation",
  blocks: [{
    id: "record",
    type: "paragraph",
    parts: [
      { type: "fieldSlot", fieldKey: "sample/value", label: "样品值", valueType: "number" },
      { type: "fieldSlot", fieldKey: "sample/result", label: "结论", inputType: "select", options: ["符合", "不符合"] },
      { type: "formulaSlot", fieldKey: "sample/double", label: "计算值", formulaText: "sample_value * 2", slotKind: "formula" },
    ],
  }],
};

const fieldModel: FieldModel = {
  schemaVersion: 1,
  fields: {
    "sample/value": { fieldKey: "sample/value", alias: "sample_value", valueType: "number", attr: "fillable" },
    "sample/result": { fieldKey: "sample/result", options: ["符合", "不符合"] },
    "sample/double": { fieldKey: "sample/double", valueType: "number", attr: "calculated" },
  },
  formulas: {
    "sample/double": { fieldKey: "sample/double", formulaText: "sample_value * 2", valueType: "number" },
  },
};

test("QC server validation rejects invalid typed and option values", () => {
  const result = validateQcRuntimeMutation({
    fieldModel,
    document,
    blocks: document.blocks,
    currentValues: {},
    submittedValues: { "sample/value": "abc", "sample/result": "未知" },
  });
  assert.ok(result.errors.some((error) => error.includes("必须是数字")));
  assert.ok(result.errors.some((error) => error.includes("不是允许的选项")));
});

test("QC server validation evaluates and returns formula values", () => {
  const result = validateQcRuntimeMutation({
    fieldModel,
    document,
    blocks: document.blocks,
    currentValues: {},
    submittedValues: { "sample/value": "2.5", "sample/result": "符合" },
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.formulaValues["sample/double"], "5.0000");
});

test("QC precheck validation requires every writable field", () => {
  const result = validateQcRuntimeMutation({
    fieldModel,
    document,
    blocks: document.blocks,
    currentValues: {},
    submittedValues: { "sample/value": "2.5" },
    requireAllWritable: true,
  });
  assert.ok(result.errors.some((error) => error.includes("结论不能为空")));
});
