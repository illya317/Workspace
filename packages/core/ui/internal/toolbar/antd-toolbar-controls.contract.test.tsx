import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdToolbarItemRenderer } from "./antd-toolbar";
import { listHeightFromVisibleCount } from "./antd-toolbar-shared";
import {
  activateAntdToolbarAccordionTrigger,
  filterToolbarAutocompleteOptions,
  resolveAntdToolbarAccordionModel,
} from "./antd-toolbar-controls";
import type { ToolbarItem } from "./Toolbar.types";

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

function renderItem(item: ToolbarItem) {
  return renderClientSurface(<AntdToolbarItemRenderer item={item} size="md" />);
}

test("search keeps value, placeholder and scope-derived aria-label", () => {
  const full = renderItem({ kind: "search", key: "q", value: "张三", onChange: () => undefined, placeholder: "搜索姓名" });
  assert.match(full, /ant-input/);
  assert.match(full, /aria-label="搜索全部字段"/);
  assert.match(full, /placeholder="搜索姓名"/);
  assert.match(full, /value="张三"/);

  const scoped = renderItem({ kind: "search", key: "q", value: "", onChange: () => undefined, scope: ["姓名", "工号"] });
  assert.match(scoped, /aria-label="搜索姓名、工号"/);

  const custom = renderItem({ kind: "search", key: "q", value: "", onChange: () => undefined, ariaLabel: "检索档案" });
  assert.match(custom, /aria-label="检索档案"/);
});

test("select keeps selected label, placeholder, options and disabled options", () => {
  const selected = renderItem({
    kind: "select", key: "s", value: "active",
    options: [
      { value: "active", label: "启用" },
      { value: "archived", label: "归档", disabled: true },
    ],
    onChange: () => undefined,
  });
  assert.match(selected, /ant-select/);
  assert.match(selected, /启用/);

  const empty = renderItem({
    kind: "select", key: "s", value: "",
    options: [{ value: "active", label: "启用" }],
    onChange: () => undefined,
    placeholder: "选择状态",
    label: "状态",
  });
  assert.match(empty, /选择状态/);
});

test("select maps visibleCount to antd listHeight", () => {
  assert.equal(listHeightFromVisibleCount(8), 256);
  assert.equal(listHeightFromVisibleCount(undefined), undefined);
});

test("autocomplete keeps selected option name and aria-label", () => {
  const markup = renderItem({
    kind: "autocomplete", key: "ac", value: "e1",
    options: [
      { value: "e1", name: "张三", details: "工号 001", searchText: "zhangsan" },
      { value: "e2", name: "李四", disabled: true },
    ],
    onChange: () => undefined,
    placeholder: "选择员工",
    ariaLabel: "员工搜索",
  });
  assert.match(markup, /ant-select/);
  assert.match(markup, /张三/);
  assert.match(markup, /aria-label="员工搜索"/);
});

test("autocomplete uses Core matching and visibleCount limits actual results", () => {
  const options = [
    { value: "e1", label: "张三", searchText: "zhangsan" },
    { value: "e2", label: "李四", searchText: "lisi" },
    { value: "e3", label: "王五", searchText: "wangwu" },
  ];
  assert.deepEqual(filterToolbarAutocompleteOptions(options, "zhangsan", 2).map((option) => option.value), ["e1"]);
  assert.deepEqual(filterToolbarAutocompleteOptions(options, "", 2).map((option) => option.value), ["e1", "e2"]);
});

test("option-group segmented maps to antd Segmented with group aria-label", () => {
  const markup = renderItem({
    kind: "option-group", key: "og", value: "day",
    options: [
      { value: "day", label: "日" },
      { value: "week", label: "周" },
      { value: "month", label: "月", disabled: true },
    ],
    onChange: () => undefined,
    ariaLabel: "统计粒度",
    presentation: "segmented",
  });
  assert.match(markup, /ant-segmented/);
  assert.match(markup, /role="group"/);
  assert.match(markup, /aria-label="统计粒度"/);
  assert.match(markup, /日/);
  assert.match(markup, /月/);
});

test("option-group accordion default trigger keeps the public parent-label mapping", () => {
  // 4 个选项 → resolveToolbarOptionGroupPresentation 判定为 accordion。
  const item: ToolbarItem = {
    kind: "option-group", key: "og", value: "a",
    options: [
      { value: "a", label: "甲" },
      { value: "b", label: "乙" },
      { value: "c", label: "丙" },
      { value: "d", label: "丁" },
    ],
    onChange: () => undefined,
    ariaLabel: "统计粒度",
    accordionTrigger: "default",
  };
  const markup = renderClientSurface(<AntdToolbarItemRenderer item={item} size="md" />);
  assert.match(markup, /ant-dropdown-trigger/);
  assert.match(markup, /data-accordion-trigger="default"/);
  assert.match(markup, /统计粒度/);
  assert.doesNotMatch(markup, /ant-segmented/);
});

test("option-group accordion active trigger displays the active option", () => {
  const markup = renderItem({
    kind: "option-group", key: "og-active", value: "b", accordionTrigger: "active",
    options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }, { value: "c", label: "丙" }, { value: "d", label: "丁" }],
    onChange: () => undefined,
  });
  assert.match(markup, /data-accordion-trigger="active"/);
  assert.match(markup, />乙/);
});

test("option-group accordion interaction model preserves default, active, and disabled trigger semantics", () => {
  const changes: string[] = [];
  const base = {
    kind: "option-group" as const,
    key: "og-model",
    value: "b",
    options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }, { value: "c", label: "丙" }],
    onChange: (value: string) => changes.push(value),
    presentation: "accordion" as const,
  };
  const defaultModel = resolveAntdToolbarAccordionModel(base, "统计粒度");
  assert.deepEqual(defaultModel.menuOptions.map((option) => option.value), ["b", "c"]);
  activateAntdToolbarAccordionTrigger(base, "统计粒度");
  assert.deepEqual(changes, ["a"]);

  const active = { ...base, accordionTrigger: "active" as const };
  const activeModel = resolveAntdToolbarAccordionModel(active);
  assert.equal(activeModel.triggerOption?.value, "b");
  assert.deepEqual(activeModel.menuOptions.map((option) => option.value), ["a", "c"]);
  activateAntdToolbarAccordionTrigger(active);
  assert.deepEqual(changes, ["a"]);

  const disabled = { ...base, options: [{ value: "a", label: "甲", disabled: true }, ...base.options.slice(1)] };
  assert.equal(resolveAntdToolbarAccordionModel(disabled).disabled, true);
  activateAntdToolbarAccordionTrigger(disabled);
  assert.deepEqual(changes, ["a"]);
});

test("grouped-select keeps the dedicated two-stage searchable protocol", () => {
  const markup = renderItem({
    kind: "grouped-select",
    key: "grouped",
    value: "a2",
    groups: [
      { key: "g1", label: "华东", options: [{ value: "a1", label: "上海" }] },
      { key: "g2", label: "华南", options: [{ value: "a2", label: "深圳" }, { value: "a3", label: "广州", disabled: true }] },
    ],
    groupLabel: "区域",
    optionLabel: "城市",
    visibleCount: 7,
    onChange: () => undefined,
  });
  assert.match(markup, /华南：深圳/);
  assert.doesNotMatch(markup, /ant-cascader/);
});

test("page-size keeps aria-label, value and options", () => {
  const markup = renderItem({
    kind: "page-size", key: "ps", value: "20",
    options: [
      { value: "10", label: "10 条/页" },
      { value: "20", label: "20 条/页" },
    ],
    onChange: () => undefined,
  });
  assert.match(markup, /ant-select/);
  assert.match(markup, /aria-label="每页条数"/);
  assert.match(markup, /20 条\/页/);
});

test("column-toggle keeps count summary, placeholder and empty-optional guard", () => {
  const markup = renderItem({
    kind: "column-toggle", key: "ct",
    columns: [
      { key: "code", label: "编码", required: true },
      { key: "name", label: "名称" },
      { key: "dept", label: "部门" },
    ],
    visible: ["code", "name"],
    onChange: () => undefined,
  });
  assert.match(markup, /ant-select/);
  assert.match(markup, /aria-label="显示列"/);
  // 与 legacy summaryMode="count" 一致的 "n/m" 汇总。
  assert.match(markup, /2\/3/);

  const empty = renderItem({
    kind: "column-toggle", key: "ct",
    columns: [{ key: "code", label: "编码", required: true }, { key: "name", label: "名称" }],
    visible: [],
    onChange: () => undefined,
  });
  assert.match(empty, /未选择/);

  const allRequired = renderItem({
    kind: "column-toggle", key: "ct",
    columns: [{ key: "code", label: "编码", required: true }],
    visible: ["code"],
    onChange: () => undefined,
  });
  assert.equal(allRequired, "");
});

test("period date mode keeps value, placeholder and disabled via DatePicker", () => {
  const markup = renderItem({ kind: "period", key: "p", mode: "date", value: "2026-08-03", onChange: () => undefined });
  assert.match(markup, /ant-picker/);
  assert.match(markup, /2026-08-03/);
  assert.match(markup, /aria-label="选择日期"/);

  const empty = renderItem({ kind: "period", key: "p", mode: "date", value: null, onChange: () => undefined, placeholder: "选择凭证日期", disabled: true });
  assert.match(empty, /placeholder="选择凭证日期"/);
  assert.match(empty, /disabled/);
});

test("period month mode keeps month format value", () => {
  const markup = renderItem({ kind: "period", key: "p", mode: "month", value: "2026-08", onChange: () => undefined });
  assert.match(markup, /ant-picker/);
  assert.match(markup, /2026-08/);
  assert.match(markup, /aria-label="选择月份"/);
});

test("period nav mode remains a dedicated Ant-dispatched navigation leaf", () => {
  const item: ToolbarItem = {
    kind: "period", key: "p", mode: "nav", label: "2026 年 8 月",
    onPrevious: () => undefined, onNext: () => undefined,
    picker: { precision: "month", value: "2026-08", onChange: () => undefined },
  };
  const markup = renderClientSurface(<AntdToolbarItemRenderer item={item} size="md" />);
  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /上一周期/);
  assert.match(markup, /下一周期/);
});
