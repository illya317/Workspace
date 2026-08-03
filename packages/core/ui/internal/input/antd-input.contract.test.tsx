import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import InputSurface from "../../InputSurface";
import { resolveAntdInputKind } from "./antd-input";
import type { InputFieldSpec } from "./InputSurfaceTypes";

function renderClientSurface(node: React.ReactNode) {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  try {
    return renderToStaticMarkup(node);
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
}

test("the Ant input resolver is total for every declared renderer", () => {
  for (const kind of ["segmentedText", "file", "remoteReference", "tags", "autocompleteChoice", "text"] as const) {
    assert.equal(resolveAntdInputKind(kind), kind);
  }
});

test("text kind maps value, placeholder, aria, data-field-key, and native constraints", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text", validation: { required: true } }}
    value="张三"
    placeholder="姓名"
    ariaLabel="员工姓名"
    dataFieldKey="name"
    maxLength={10}
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("value=\"张三\""));
  assert.ok(markup.includes("placeholder=\"姓名\""));
  assert.ok(markup.includes("aria-label=\"员工姓名\""));
  assert.ok(markup.includes("data-field-key=\"name\""));
  assert.ok(markup.includes("maxLength=\"10\""));
  assert.ok(markup.includes("required"));
});

test("template masks derive their placeholder once at the InputSurface facade", () => {
  const source = readFileSync(new URL("../../InputSurface.tsx", import.meta.url), "utf8");
  assert.match(source, /props\.placeholder \?\? inputMaskPlaceholder\(props\.spec\.mask\)/);

  const markup = renderClientSurface(<InputSurface
    spec={{
      valueType: "string",
      control: "text",
      mask: { kind: "template", placeholder: "AA-0000" },
    }}
    value=""
  />);

  assert.ok(markup.includes('placeholder="AA-0000"'));
});

test("text kind maps disabled and readOnly interaction states", () => {
  const disabled = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text", state: "disabled" }}
    value="冻结"
  />);
  assert.ok(disabled.includes("disabled"));

  const readonly = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text" }}
    value="只读"
    readOnly
  />);
  assert.ok(readonly.includes("readOnly"));
});

test("number kind keeps native number semantics with validation bounds", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "number", control: "number", validation: { min: 1, max: 10 } }}
    value={3}
    step="0.5"
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("type=\"number\""));
  assert.ok(markup.includes("min=\"1\""));
  assert.ok(markup.includes("max=\"10\""));
  assert.ok(markup.includes("step=\"0.5\""));
  assert.ok(markup.includes("value=\"3\""));
});

test("textarea kind maps rows and value", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text", multiline: true }}
    value="第一行"
    rows={3}
    placeholder="备注"
  />);

  assert.ok(markup.includes("<textarea"));
  assert.ok(markup.includes("rows=\"3\""));
  assert.ok(markup.includes("第一行"));
  assert.ok(markup.includes("placeholder=\"备注\""));
});

test("percent kind maps numeric value and percent suffix", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "number", control: "number", format: "percent" }}
    value={42}
  />);

  assert.ok(markup.includes("ant-input-number"));
  assert.ok(markup.includes("aria-valuenow=\"42\""));
  assert.ok(markup.includes("%"));
});

test("date kind maps value and disabled state; month precision keeps YYYY-MM contract", () => {
  const day = renderClientSurface(<InputSurface
    spec={{ valueType: "date", control: "temporal" }}
    value="2026-08-03"
  />);
  assert.ok(day.includes("ant-picker"));
  assert.ok(day.includes("value=\"2026-08-03\""));

  const month = renderClientSurface(<InputSurface
    spec={{ valueType: "date", control: "temporal", precision: "month" }}
    value="2026-08"
  />);
  assert.ok(month.includes("value=\"2026-08\""));

  const disabled = renderClientSurface(<InputSurface
    spec={{ valueType: "date", control: "temporal", state: "disabled" }}
    value="2026-08-03"
  />);
  assert.ok(disabled.includes("ant-picker-disabled"));
});

test("time kind keeps HH:mm value contract", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "time", control: "temporal", precision: "time" }}
    value="09:30"
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("value=\"09:30\""));
});

test("checkbox kind maps checked and disabled", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "boolean", control: "boolean" }}
    value={true}
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("type=\"checkbox\""));
  assert.ok(markup.includes("checked"));
});

test("choiceGroup radio maps options and selected value", () => {
  const spec: InputFieldSpec = {
    valueType: "boolean",
    control: "boolean",
    presentation: "choice",
    options: { source: "static", items: [{ value: "是", label: "是" }, { value: "否", label: "否" }] },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value="否" />);

  assert.ok(markup.includes("type=\"radio\""));
  assert.ok(markup.includes("是"));
  assert.ok(markup.includes("否"));
  assert.ok(markup.includes("checked"));
});

test("choiceGroup checkbox maps multiple selection", () => {
  const spec: InputFieldSpec = {
    valueType: "array",
    control: "choice",
    presentation: "choice",
    multiple: true,
    options: { source: "static", items: [{ value: "甲", label: "甲" }, { value: "乙", label: "乙" }] },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value="甲,乙" />);

  assert.ok(markup.includes("type=\"checkbox\""));
  assert.ok(markup.includes("甲"));
  assert.ok(markup.includes("乙"));
});

test("rating kind preserves label, count, and value", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "number", control: "rating" }}
    value={3}
    ratingMax={5}
    ratingLabel="满意度"
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("满意度"));
  assert.ok(markup.includes("ant-rate"));
});

test("tags kind keeps joined string contract and renders existing tags", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "array", control: "collection" }}
    value="甲、乙"
    placeholder="添加别名"
  />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("甲"));
  assert.ok(markup.includes("乙"));
});

test("autocompleteChoice maps static options, selection label, and placeholder", () => {
  const spec: InputFieldSpec = {
    valueType: "string",
    control: "choice",
    options: {
      source: "static",
      items: [
        { value: "emp-1", label: "员工一" },
        { value: "emp-2", label: "员工二", disabled: true },
      ],
    },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value="emp-1" />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("员工一"));
  assert.ok(markup.includes("role=\"combobox\""));

  const empty = renderClientSurface(<InputSurface spec={spec} value="" />);
  assert.ok(empty.includes("未设置"));
});

test("autocompleteChoice resolves a selected label from all static options beyond visibleCount", () => {
  const spec: InputFieldSpec = {
    valueType: "string",
    control: "choice",
    options: {
      source: "static",
      visibleCount: 5,
      items: Array.from({ length: 7 }, (_, index) => ({ value: `emp-${index + 1}`, label: `员工${index + 1}` })),
    },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value="emp-7" />);
  assert.ok(markup.includes("员工7"));
  assert.ok(!markup.includes(">emp-7<"));
});

test("autocompleteChoice clears local search and uses the dedicated document-flow leaf for inline presentation", () => {
  const source = readFileSync(new URL("./antd-input-choice.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!open\) setSearch\(""\)/);
  assert.match(source, /onChange=\{\(next, option\) => \{\s*setSearch\(""\)/);
  assert.match(source, /autocompletePresentation === "inline"/);
  assert.match(source, /presentation: "inline" as const/);
  assert.doesNotMatch(source, /open=\{autocompletePresentation === "inline"/);
});

test("autocompleteChoice multiple renders every selected label", () => {
  const spec: InputFieldSpec = {
    valueType: "array",
    control: "choice",
    multiple: true,
    options: {
      source: "static",
      items: [
        { value: "emp-1", label: "员工一" },
        { value: "emp-2", label: "员工二" },
      ],
    },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value={["emp-1", "emp-2"]} />);

  assert.ok(markup.includes("员工一"));
  assert.ok(markup.includes("员工二"));
});

test("autocompleteChoice grouped renders option groups", () => {
  const spec: InputFieldSpec = {
    valueType: "string",
    control: "choice",
    options: {
      source: "grouped",
      groups: [{ key: "g1", label: "部门", options: [{ value: "emp-1", label: "员工一" }] }],
    },
  };
  const markup = renderClientSurface(<InputSurface spec={spec} value="emp-1" />);

  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("员工一"));
});

test("specialized input protocols remain inside the total Ant dispatcher", () => {
  const file = renderClientSurface(<InputSurface spec={{ valueType: "file", control: "file" }} />);
  assert.ok(file.includes("选择文件"));
  assert.ok(file.includes("data-ui-renderer=\"antd\""));

  const remote = renderClientSurface(<InputSurface
    spec={{ valueType: "reference", control: "reference", options: { source: "remote", fkKey: "dept", endpoint: "/api/dept" } }}
  />);
  assert.ok(remote.includes("data-ui-renderer=\"antd\""));

  const segmented = renderClientSurface(<InputSurface
    spec={{
      valueType: "string",
      control: "text",
      mask: { kind: "editableSegment", extract: (full: string) => full, compose: (segment: string) => segment },
    }}
    value="ABC"
  />);
  assert.ok(segmented.includes("data-ui-renderer=\"antd\""));

  const confirmedTags = renderClientSurface(<InputSurface
    spec={{ valueType: "array", control: "collection" }}
    value="甲"
    confirmRemove
  />);
  assert.ok(confirmedTags.includes("data-ui-renderer=\"antd\""));
});

test("readonly state stays inside the Ant display path", () => {
  const markup = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text", state: "readonly" }}
    value="展示值"
  />);

  assert.ok(markup.includes("展示值"));
  assert.ok(markup.includes("data-ui-renderer=\"antd\""));
  assert.ok(markup.includes("truncate"));

  const empty = renderClientSurface(<InputSurface
    spec={{ valueType: "string", control: "text", state: "readonly" }}
    value=""
    textAlign="right"
  />);
  assert.ok(empty.includes("未设置"));
  assert.ok(empty.includes("text-right"));
});

test("date and time keep the public clear-to-null contract", () => {
  const source = readFileSync(new URL("./antd-input-temporal.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/allowClear=\{!interaction\.readOnly\}/g)?.length, 2);
  assert.doesNotMatch(source, /allowClear=\{false\}/);
  assert.match(source, /date \? date\.format\(formatString\) : null/);
  assert.match(source, /time \? time\.format\("HH:mm"\) : null/);
});
