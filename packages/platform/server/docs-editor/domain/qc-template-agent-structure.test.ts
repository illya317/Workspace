import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQcTemplateStructurePatches,
  inspectQcTemplateStructure,
} from "./qc-template-agent-structure";

const document = {
  schemaVersion: 1,
  kind: "qc-editor-document",
  id: "qc-demo",
  title: "QC 模板",
  blocks: [
    { id: "heading-1", type: "heading", level: 1, text: "第一章" },
    {
      id: "table-1",
      type: "table",
      rows: [{ id: "row-1", cells: [{ id: "cell-1", rawText: "检验项目", parts: [{ type: "text", text: "检验项目" }] }] }],
    },
  ],
};

const fieldModel = {
  schemaVersion: 1,
  fields: {
    result: { fieldKey: "result", label: "检验结果", type: "text" },
  },
  formulas: {},
};

test("QC structure inspection outlines and reads exact subtrees", () => {
  const outline = inspectQcTemplateStructure({ document, fieldModel, path: "/document/blocks", view: "outline" });
  assert.equal(outline.ok, true);
  if (!outline.ok) return;
  assert.equal(outline.kind, "array");
  assert.equal(outline.size, 2);
  assert.deepEqual(outline.children.map((item) => item.path), ["/document/blocks/0", "/document/blocks/1"]);

  const value = inspectQcTemplateStructure({ document, fieldModel, path: "/document/blocks/1/rows/0", view: "value" });
  assert.equal(value.ok, true);
  if (!value.ok) return;
  assert.deepEqual(value.value, document.blocks[1]?.rows?.[0]);
});

test("QC structure patches edit tables, fields, and formulas atomically", () => {
  const result = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [
      { op: "test", path: "/document/blocks/1/id", value: "table-1" },
      {
        op: "add",
        path: "/document/blocks/1/rows/-",
        value: { id: "row-2", cells: [{ id: "cell-2", rawText: "结论", parts: [{ type: "text", text: "结论" }] }] },
      },
      { op: "replace", path: "/fieldModel/fields/result/label", value: "检测结论" },
      {
        op: "add",
        path: "/fieldModel/formulas/score",
        value: { fieldKey: "score", rule: "result == '合格' ? 1 : 0" },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const nextDocument = result.document as typeof document;
  const nextFieldModel = result.fieldModel as typeof fieldModel & { formulas: Record<string, unknown> };
  assert.equal(nextDocument.blocks[1]?.rows?.length, 2);
  assert.equal(nextFieldModel.fields.result.label, "检测结论");
  assert.deepEqual(nextFieldModel.formulas.score, { fieldKey: "score", rule: "result == '合格' ? 1 : 0" });
  assert.equal(document.blocks[1]?.rows?.length, 1);
});

test("QC structure patches support copy, move, and remove", () => {
  const result = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [
      { op: "copy", from: "/document/blocks/0", path: "/document/blocks/-" },
      { op: "replace", path: "/document/blocks/2/id", value: "heading-copy" },
      { op: "move", from: "/document/blocks/0", path: "/document/blocks/1" },
      { op: "remove", path: "/document/blocks/0" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const blocks = (result.document as typeof document).blocks;
  assert.deepEqual(blocks.map((block) => block.id), ["heading-1", "heading-copy"]);
});

test("QC structure patches reject stale tests and unsafe paths", () => {
  const stale = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [{ op: "test", path: "/document/title", value: "旧标题" }, { op: "replace", path: "/document/title", value: "新标题" }],
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.error, /test 预期不一致/);

  const unsafe = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [{ op: "add", path: "/document/__proto__/polluted", value: true }],
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.match(unsafe.error, /不安全字段/);

  const metadata = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [{ op: "replace", path: "/status", value: "archived" }],
  });
  assert.equal(metadata.ok, false);
  if (!metadata.ok) assert.match(metadata.error, /document 或 fieldModel/);

  const invalidShape = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [{ op: "replace", path: "/document/blocks", value: "not-an-array" }],
  });
  assert.equal(invalidShape.ok, false);
  if (!invalidShape.ok) assert.match(invalidShape.error, /document\.blocks 必须是数组/);

  const invalidField = applyQcTemplateStructurePatches({
    document,
    fieldModel,
    patches: [{ op: "add", path: "/fieldModel/fields/broken", value: "not-an-object" }],
  });
  assert.equal(invalidField.ok, false);
  if (!invalidField.ok) assert.match(invalidField.error, /字段必须是对象/);
});
