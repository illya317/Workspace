import assert from "node:assert/strict";
import test from "node:test";
import { numberDisplay, numberDisplayPatch } from "./slot-input-semantics";
import type { EditorSlotInline, FieldDefinition } from "./types";

const numericInput: EditorSlotInline = {
  type: "fieldSlot",
  fieldKey: "standard",
  valueType: "number",
};

test("percentage display marks numeric inputs for ratio formula evaluation", () => {
  assert.deepEqual(numberDisplayPatch("percent", numericInput, "fieldSlot"), {
    numberDisplayMode: "percent",
    unit: "%",
    formulaInputMode: "percent",
  });
});

test("plain display overrides an inherited percentage unit", () => {
  const field: FieldDefinition = { fieldKey: "standard", valueType: "number", unit: "%" };
  const attrs = { ...numericInput, ...numberDisplayPatch("plain", numericInput, "fieldSlot") } as EditorSlotInline;

  assert.equal(numberDisplay(attrs, field), "plain");
});

test("percentage formula outputs do not rescale their own values", () => {
  const formula: EditorSlotInline = { type: "formulaSlot", fieldKey: "result", slotKind: "formula", valueType: "number" };

  assert.deepEqual(numberDisplayPatch("percent", formula, "formulaSlot"), {
    numberDisplayMode: "percent",
    unit: "%",
    formulaInputMode: null,
  });
});
