import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";

import {
  getFieldGridHelperRowClassName,
  getFieldGridLabelClassName,
  getFieldGridMainRowClassName,
} from "./FormStyles";
import {
  createTagAppendFieldChangeHandler,
  resolveFormSurfaceFieldSpan,
} from "./FormSurface.controls";
import { FieldGridCell } from "../input/FieldGrid";

test("FieldGrid uses one section-owned adaptive desktop label track", () => {
  const mainRow = getFieldGridMainRowClassName();
  assert.match(mainRow, /var\(--field-grid-label-width\)/);
  assert.match(mainRow, /minmax\(8rem,1fr\)/);
  assert.match(getFieldGridLabelClassName(), /sm:overflow-hidden/);
  assert.match(getFieldGridLabelClassName(), /sm:whitespace-nowrap/);
  assert.match(getFieldGridHelperRowClassName(), /sm:col-start-2/);
});

test("FieldGrid preserves complete label text for section-level overflow measurement", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let cell: ReturnType<typeof FieldGridCell>;
  try {
    cell = FieldGridCell({
      label: React.createElement("span", null, "累计折旧/摊销科目"),
      children: "累计折旧",
      required: true,
    });
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
  assert.ok(React.isValidElement<{ children?: React.ReactNode }>(cell));

  const [mainRow] = React.Children.toArray(cell.props.children);
  assert.ok(React.isValidElement<{ children?: React.ReactNode }>(mainRow));
  const [label] = React.Children.toArray(mainRow.props.children);
  assert.ok(React.isValidElement<{ children?: React.ReactNode; "data-field-grid-label-title"?: string }>(label));
  assert.equal(label.props["data-field-grid-label-title"], "累计折旧/摊销科目");

  const [labelText, requiredMarker] = React.Children.toArray(label.props.children);
  assert.ok(React.isValidElement<{ className?: string }>(labelText));
  assert.match(labelText.props.className ?? "", /sm:truncate/);
  assert.ok(React.isValidElement<{ className?: string }>(requiredMarker));
  assert.match(requiredMarker.props.className ?? "", /shrink-0/);
});

test("FieldGrid stack layout applies the same vertical template to labels, values, and helpers", () => {
  const mainRow = getFieldGridMainRowClassName("", "mixed", "stack");
  assert.match(mainRow, /grid-cols-1/);
  assert.doesNotMatch(mainRow, /field-grid-label-width/);
  assert.match(getFieldGridLabelClassName("", "stack"), /whitespace-normal/);
  assert.doesNotMatch(getFieldGridHelperRowClassName("", "mixed", "stack"), /col-start-2/);
});

test("FormSurface multiline fields always span the complete field grid", () => {
  assert.equal(resolveFormSurfaceFieldSpan({
    key: "classificationRule",
    label: "分类判断",
    span: 2,
    spec: { valueType: "string", control: "text", multiline: true },
  }), "full");
  assert.equal(resolveFormSurfaceFieldSpan({
    key: "category",
    label: "资产分类",
    span: 2,
    spec: { valueType: "string", control: "text" },
  }), 2);
});

test("tag append fields commit once and collapse immediately after selection", () => {
  const events: string[] = [];
  const onChange = createTagAppendFieldChangeHandler({
    key: "department",
    label: "部门",
    spec: { valueType: "string", control: "text" },
    onChange: (value, option) => events.push(`change:${String(value)}:${String(option)}`),
  }, () => events.push("collapse"));

  onChange("finance", "财务部");
  assert.deepEqual(events, ["change:finance:财务部", "collapse"]);
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
