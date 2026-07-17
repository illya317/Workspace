import assert from "node:assert/strict";
import test from "node:test";
import { annotateEditorSlots } from "./editor-adapter-slots";
import type { EditorBlock, EditorFieldModel } from "./editor-adapter-types";

test("hidden formula expansion excludes its own assignment name", () => {
  const blocks: EditorBlock[] = [{
    id: "formula-row",
    type: "paragraph",
    parts: [
      { type: "fieldSlot", fieldKey: "input", valueType: "number" },
      { type: "formulaSlot", fieldKey: "result", formulaText: "hidden + 1", dependencyFieldKeys: ["hidden"] },
    ],
  }];
  const fieldModel: EditorFieldModel = {
    schemaVersion: 1,
    fields: {
      input: { fieldKey: "input", name: "input", attr: "fillable", valueType: "number" },
      hidden: { fieldKey: "hidden", name: "hidden", attr: "calculated", valueType: "number" },
      result: { fieldKey: "result", name: "result", attr: "calculated", valueType: "number" },
    },
    formulas: {
      hidden: { fieldKey: "hidden", formulaText: "hidden = input * 2", dependencyFieldKeys: ["input"] },
      result: { fieldKey: "result", formulaText: "hidden + 1", dependencyFieldKeys: ["hidden"] },
    },
  };

  annotateEditorSlots(blocks, fieldModel);

  const result = fieldModel.formulas.result.formulaText ?? "";
  assert.ok(result.includes("x1 * 2"));
  assert.ok(!result.includes("hidden"));
  assert.ok(result.length < 100);
});
