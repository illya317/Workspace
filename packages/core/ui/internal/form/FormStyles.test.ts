import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";

import {
  getFieldGridHelperRowClassName,
  getFieldGridLabelClassName,
  getFieldGridMainRowClassName,
} from "./FormStyles";
import { FieldGridCell } from "../input/FieldGrid";

test("FieldGrid compacts short desktop labels and lets values fill the row", () => {
  const mainRow = getFieldGridMainRowClassName();
  assert.match(mainRow, /minmax\(5rem,max-content\)/);
  assert.match(mainRow, /minmax\(0,1fr\)/);
  assert.match(getFieldGridLabelClassName(), /sm:max-w-32/);
  assert.match(getFieldGridHelperRowClassName(), /sm:col-start-2/);
});

test("FieldGrid keeps the helper inside the main grid after the value", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let cell: ReturnType<typeof FieldGridCell>;
  try {
    cell = FieldGridCell({ label: "Label", children: "Value", hint: "Hint" });
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
  assert.ok(React.isValidElement<{ children?: React.ReactNode }>(cell));

  const [mainRow] = React.Children.toArray(cell.props.children);
  assert.ok(React.isValidElement<{ children?: React.ReactNode }>(mainRow));

  const mainRowChildren = React.Children.toArray(mainRow.props.children);
  assert.equal(mainRowChildren.length, 3);
  const helper = mainRowChildren[2];
  assert.ok(React.isValidElement<{ className?: string }>(helper));
  assert.match(helper.props.className ?? "", /sm:col-start-2/);
});
