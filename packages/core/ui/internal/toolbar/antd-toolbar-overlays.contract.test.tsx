import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdToolbarItemRenderer } from "./antd-toolbar";
import { buildAntdToolbarMenuItems } from "./antd-toolbar-overlays";
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

test("menu item builder keeps danger, disabled, href and separatorBefore", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  let items: ReturnType<typeof buildAntdToolbarMenuItems>;
  try {
    items = buildAntdToolbarMenuItems([
      { key: "export", label: "导出", onSelect: () => undefined },
      { key: "delete", label: "删除", tone: "danger", separatorBefore: true, onSelect: () => undefined },
      { key: "docs", label: "帮助文档", href: "/help" },
      { key: "locked", label: "不可用", disabled: true },
    ]);
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
  assert.equal(items.length, 5);
  // separatorBefore → 前置 divider 项,保证分组语义不丢。
  assert.equal((items[1] as { type?: string }).type, "divider");
  assert.equal((items[2] as { danger?: boolean }).danger, true);
  // 纯 href 项渲染为 <a>,由锚点自身导航。
  const hrefLabel = (items[3] as { label: React.ReactNode }).label;
  assert.ok(React.isValidElement(hrefLabel));
  assert.equal((hrefLabel as React.ReactElement<{ href: string }>).props.href, "/help");
  assert.equal((items[4] as { disabled?: boolean }).disabled, true);
});

test("menu trigger keeps aria-label, avatar initials and disabled state", () => {
  const markup = renderItem({
    kind: "menu", key: "user",
    trigger: { label: "张三", initials: "张" },
    items: [{ key: "profile", label: "个人资料" }],
  });
  assert.match(markup, /aria-label="张三"/);
  assert.match(markup, /张/);
  assert.match(markup, /title="张三"/);

  const disabled = renderItem({
    kind: "menu", key: "user",
    trigger: { label: "李四", ariaLabel: "账号菜单" },
    items: [{ key: "profile", label: "个人资料" }],
    disabled: true,
  });
  assert.match(disabled, /aria-label="账号菜单"/);
  assert.match(disabled, /disabled/);
});

test("filter-panel trigger keeps active count label, badge and removable tags", () => {
  const markup = renderItem({
    kind: "filter-panel", key: "fp",
    fields: [
      { key: "status", label: "状态", value: "active", options: [{ value: "active", label: "启用" }], onChange: () => undefined },
      { key: "type", label: "类型", value: "", options: [{ value: "a", label: "甲" }], onChange: () => undefined },
    ],
  });
  assert.match(markup, /ant-btn/);
  // 与 legacy 一致的触发器文案:label + 已选数量。
  assert.match(markup, /aria-label="筛选，已选 1 项"/);
  assert.match(markup, /aria-haspopup="dialog"/);
  // 已选字段以可移除标签外置展示(沿用 legacy RemovableTag)。
  assert.match(markup, /清除状态筛选/);
  assert.match(markup, /状态：启用/);
});

test("filter-panel without active fields keeps plain trigger label", () => {
  const markup = renderItem({
    kind: "filter-panel", key: "fp", label: "高级筛选",
    fields: [{ key: "status", label: "状态", value: "", options: [], onChange: () => undefined }],
  });
  assert.match(markup, /aria-label="高级筛选"/);
  assert.doesNotMatch(markup, /已选/);
});
