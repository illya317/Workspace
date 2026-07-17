import assert from "node:assert/strict";
import test from "node:test";
import { createSimpleFormulaEngine } from "./factory";

test("explicit percent inputs contribute ratio values to formulas", () => {
  const engine = createSimpleFormulaEngine();
  const result = engine.evaluate({
    model: {
      fields: [
        { fieldKey: "standard", aliases: ["x1"], valueType: "number", formulaInputMode: "percent", value: 95.4 },
        { fieldKey: "result", aliases: ["y1"], valueType: "number", formula: "x1 * 100" },
      ],
    },
    targetFieldKeys: ["result"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.standard, 0.954);
  assert.ok(Math.abs(Number(result.values.result) - 95.4) < 1e-10);
});

test("percent input mode accepts values carrying a percent sign", () => {
  const engine = createSimpleFormulaEngine();
  const result = engine.evaluate({
    model: {
      fields: [
        { fieldKey: "standard", valueType: "number", formulaInputMode: "percent", value: "95.4%" },
        { fieldKey: "result", valueType: "number", formula: "standard" },
      ],
    },
    targetFieldKeys: ["result"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.standard, 0.954);
  assert.equal(result.values.result, 0.954);
});

test("unmarked percentage-point values remain backward compatible", () => {
  const engine = createSimpleFormulaEngine();
  const result = engine.evaluate({
    model: {
      fields: [
        { fieldKey: "legacy", valueType: "number", value: 95.4 },
        { fieldKey: "result", valueType: "number", formula: "legacy" },
      ],
    },
    targetFieldKeys: ["result"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.values.legacy, 95.4);
  assert.equal(result.values.result, 95.4);
});
