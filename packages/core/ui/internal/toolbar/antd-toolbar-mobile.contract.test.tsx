import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import MobileToolbarContent from "./Toolbar.mobile";
import { groupToolbarItems } from "./Toolbar.layout";
import { executeMobileToolbarAction } from "./Toolbar.mobile-sheetParts";
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

const ITEMS: ToolbarItem[] = [
  { kind: "create", key: "new", onClick: () => undefined },
  { kind: "icon-button", key: "refresh", icon: "refresh", label: "刷新" },
  { kind: "search", key: "q", value: "关键字", onChange: () => undefined },
  {
    kind: "select", key: "status", value: "active",
    options: [{ value: "active", label: "启用" }],
    onChange: () => undefined,
  },
  {
    kind: "page-size", key: "ps", value: "20",
    options: [{ value: "20", label: "20 条/页" }],
    onChange: () => undefined,
  },
];

test("mobile keeps compact trigger dock contract with antd command buttons", () => {
  const markup = renderClientSurface(
    <MobileToolbarContent grouped={groupToolbarItems(ITEMS, "mobile")} size="md" />,
  );
  // 移动端契约:搜索 + command dock(紧凑触发器)+ 筛选/更多 sheet 触发器。
  assert.match(markup, /value="关键字"/);
  assert.match(markup, /data-mobile-toolbar-command-dock="true"/);
  assert.match(markup, /aria-label="筛选"/);
  assert.match(markup, /aria-label="更多"/);
  assert.match(markup, /aria-expanded="false"/);
  // dock 命令按钮走 antd;移动端 create 默认文案为「新增」。
  assert.match(markup, /ant-btn/);
  assert.match(markup, /aria-label="新增"/);
  assert.match(markup, /aria-label="刷新"/);
  // sheet 关闭时不渲染内容(portal 也不存在)。
  assert.doesNotMatch(markup, /data-mobile-toolbar-sheet/);
});

test("mobile create active state stays disabled", () => {
  const items: ToolbarItem[] = [
    { kind: "create", key: "new", active: true, label: "新增员工", onClick: () => undefined },
  ];
  const markup = renderClientSurface(
    <MobileToolbarContent grouped={groupToolbarItems(items, "mobile")} size="md" />,
  );
  assert.match(markup, /aria-label="新增员工"/);
  assert.match(markup, /disabled/);
});

test("mobile keeps a direct file chooser in the command dock", () => {
  const items: ToolbarItem[] = [
    { kind: "file", key: "workbook", label: "上传 Excel", accept: ".xlsx", onChange: () => undefined },
  ];
  const markup = renderClientSurface(
    <MobileToolbarContent grouped={groupToolbarItems(items, "mobile")} size="md" />,
  );
  assert.match(markup, /data-mobile-toolbar-command-dock="true"/);
  assert.match(markup, /type="file"/);
  assert.match(markup, /aria-label="上传 Excel"/);
});

test("mobile sheets use Ant Drawer focus/mask semantics instead of a handwritten portal", () => {
  const sheet = readFileSync(new URL("./Toolbar.mobile-sheetParts.tsx", import.meta.url), "utf8");
  const toolbar = readFileSync(new URL("./Toolbar.mobile.tsx", import.meta.url), "utf8");
  assert.match(sheet, /<Drawer/);
  assert.match(sheet, /mask=\{\{ closable: true \}\}/);
  assert.match(sheet, /size="auto"/);
  assert.doesNotMatch(sheet, /height="auto"|maskClosable/);
  assert.match(sheet, /placement="bottom"/);
  assert.doesNotMatch(sheet, /createPortal|getFocusableElements/);
  assert.doesNotMatch(toolbar, /ActionButton from "\.\.\/action\/ActionControls"/);
});

test("mobile submit actions execute exactly one callback path", () => {
  const calls: string[] = [];
  executeMobileToolbarAction({ kind: "save", label: "保存", type: "submit", onClick: () => calls.push("click") }, () => calls.push("submit"));
  executeMobileToolbarAction({ kind: "save", label: "保存", type: "submit" }, () => calls.push("submit"));
  assert.deepEqual(calls, ["click", "submit"]);
});
