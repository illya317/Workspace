import assert from "node:assert/strict";
import test from "node:test";

import { createGenericInputControl } from "./GenericFieldInput";

test("generic Boolean fields use product-language dropdowns and preserve Boolean values", () => {
  const changes: unknown[] = [];
  const control = createGenericInputControl({
    field: {
      key: "isConsolidated",
      label: "并表",
      editable: true,
      type: "boolean",
      booleanLabels: { true: "纳入并表", false: "不纳入并表" },
    },
    value: false,
    onChange: value => changes.push(value),
  });

  assert.deepEqual(control.spec, {
    valueType: "boolean",
    control: "choice",
    options: {
      source: "static",
      items: [
        { label: "纳入并表", value: "true" },
        { label: "不纳入并表", value: "false" },
      ],
      visibleCount: 2,
    },
  });
  assert.equal(control.value, "false");

  assert.ok(control.onChange);
  control.onChange("true");
  control.onChange("false");

  assert.deepEqual(changes, [true, false]);
});
