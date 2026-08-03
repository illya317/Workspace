import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdToolbarItemRenderer } from "./antd-toolbar";
import Toolbar from "../../Toolbar";
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

test("icon-button maps variant, disabled, aria-label and submit type", () => {
  const primary = renderItem({ kind: "icon-button", key: "refresh", icon: "refresh", label: "刷新列表", variant: "primary" });
  assert.match(primary, /ant-btn/);
  assert.match(primary, /aria-label="刷新列表"/);
  assert.match(primary, /type="button"/);

  const danger = renderItem({ kind: "icon-button", key: "remove", icon: "delete", label: "删除所选", variant: "danger", disabled: true });
  assert.match(danger, /aria-label="删除所选"/);
  assert.match(danger, /disabled/);

  const submit = renderItem({ kind: "icon-button", key: "submit", icon: "check", label: "提交表单", type: "submit" });
  assert.match(submit, /type="submit"/);

  const callbackSubmit = renderItem({ kind: "icon-button", key: "submit-callback", icon: "check", label: "回调提交", type: "submit", onClick: () => undefined });
  assert.match(callbackSubmit, /type="button"/);
  assert.match(callbackSubmit, /!h-9 !w-9/);
  assert.match(callbackSubmit, /max-sm:!h-11 max-sm:!w-11/);
});

test("panel-toggle keeps icon, label and disabled state", () => {
  const markup = renderItem({ kind: "panel-toggle", key: "panel", icon: "panel-open", label: "展开侧栏", disabled: true });
  assert.match(markup, /ant-btn/);
  assert.match(markup, /aria-label="展开侧栏"/);
  assert.match(markup, /disabled/);
});

test("action-group keeps glyph ordering and per-action variants", () => {
  const markup = renderItem({
    kind: "action-group",
    key: "actions",
    actions: [
      { key: "delete", label: "删除记录", kind: "delete", variant: "danger" },
      { key: "save", label: "保存记录", kind: "save", variant: "primary" },
    ],
  });
  assert.match(markup, /aria-label="保存记录"/);
  assert.match(markup, /aria-label="删除记录"/);
  // legacy getOrderedActions 排序:save(order 11100) 在 delete(order 13100) 之前。
  assert.ok(markup.indexOf("保存记录") < markup.indexOf("删除记录"));
});

test("action-group joined renders compact group without losing actions", () => {
  const markup = renderItem({
    kind: "action-group",
    key: "joined",
    joined: true,
    actions: [
      { key: "edit", label: "编辑", kind: "edit" },
      { key: "save", label: "保存", kind: "save" },
    ],
  });
  assert.match(markup, /aria-label="编辑"/);
  assert.match(markup, /aria-label="保存"/);
});

test("edit-group derives edit/save/cancel/history/download states", () => {
  const idle = renderItem({
    kind: "edit-group", key: "eg", editMode: false,
    onStartEdit: () => undefined, onSave: () => undefined, onCancel: () => undefined,
  });
  assert.match(idle, /aria-label="编辑"/);
  assert.doesNotMatch(idle, /aria-label="保存"/);

  const editing = renderItem({
    kind: "edit-group", key: "eg", editMode: true, dirty: false, saving: false,
    editLabel: "修改", saveLabel: "保存修改",
    onStartEdit: () => undefined, onSave: () => undefined, onCancel: () => undefined,
    onShowHistory: () => undefined, onDownload: () => undefined,
  });
  assert.match(editing, /aria-label="保存修改"/);
  // dirty=false → 保存禁用,与 legacy getEditGroupActions 一致。
  const saveButton = editing.slice(editing.indexOf("保存修改"));
  assert.match(saveButton, /disabled/);
  assert.match(editing, /aria-label="取消"/);
  assert.match(editing, /aria-label="最近改动"/);
  assert.match(editing, /aria-label="下载"/);
});

test("create keeps primary styling and active disabled semantics", () => {
  const markup = renderItem({ kind: "create", key: "new", onClick: () => undefined });
  assert.match(markup, /aria-label="新建"/);

  const active = renderItem({ kind: "create", key: "new", label: "新增凭证", active: true, onClick: () => undefined });
  assert.match(active, /aria-label="新增凭证"/);
  assert.match(active, /disabled/);
});

test("label and text items keep legacy markup semantics", () => {
  const label = renderItem({ kind: "label", key: "l", label: "筛选条件" });
  assert.match(label, /筛选条件/);
  const text = renderItem({ kind: "text", key: "t", content: "共 3 条" });
  assert.match(text, /共 3 条/);
});

test("grouped-select maps group/option labels and disabled state to the dedicated two-stage leaf", () => {
  const item: ToolbarItem = {
    kind: "grouped-select", key: "gs", value: "",
    groups: [{ key: "g1", label: "分组一", options: [{ value: "a", label: "选项A" }] }],
    onChange: () => undefined,
    placeholder: "选择分组选项",
    groupLabel: "业务分类",
    optionLabel: "业务选项",
    disabled: true,
  };
  const markup = renderClientSurface(<AntdToolbarItemRenderer item={item} size="md" />);
  assert.match(markup, /选择分组选项/);
  assert.match(markup, /disabled/);
  assert.doesNotMatch(markup, /ant-cascader/);
});

test("field-filter remains a dedicated leaf inside the Ant item dispatcher", () => {
  const item: ToolbarItem = {
    kind: "field-filter", key: "ff", fieldKey: "status",
    onFieldKeyChange: () => undefined, value: "", onValueChange: () => undefined,
    fields: [{ value: "status", label: "状态" }],
    valueOptions: { status: [{ value: "active", label: "启用" }] },
  };
  const markup = renderClientSurface(<AntdToolbarItemRenderer item={item} size="md" />);
  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /状态/);
});

test("facade routes every desktop item through the Ant dispatcher", () => {
  const items: ToolbarItem[] = [
    { kind: "search", key: "q", value: "", onChange: () => undefined },
    { kind: "icon-button", key: "refresh", icon: "refresh", label: "刷新" },
    {
      kind: "field-filter", key: "ff", fieldKey: "status",
      onFieldKeyChange: () => undefined, value: "", onValueChange: () => undefined,
      fields: [{ value: "status", label: "状态" }],
      valueOptions: { status: [] },
    },
  ];
  const markup = renderClientSurface(<Toolbar items={items} onSubmit={() => undefined} />);
  // onSubmit → form 包装语义保留。
  assert.match(markup, /<form/);
  // icon-button 走 antd。
  assert.match(markup, /ant-btn/);
  assert.match(markup, /data-ui-renderer="antd"/);
});

test("facade still rejects multiple search items", () => {
  const search: ToolbarItem = { kind: "search", key: "q", value: "", onChange: () => undefined };
  assert.throws(
    () => renderClientSurface(<Toolbar items={[search, { ...search, key: "q2" }]} />),
    /只允许声明一个 search/,
  );
});
