import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SelectorSurface from "../../SelectorSurface";
import type {
  SelectorSurfaceStructuredListSpec,
  SelectorSurfaceStructuredTreeSpec,
} from "../../SelectorSurface.types";

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

function listProps(overrides: Partial<SelectorSurfaceStructuredListSpec<string>>): SelectorSurfaceStructuredListSpec<string> {
  return {
    kind: "list",
    selectedId: null,
    onSelect: () => undefined,
    items: [
      { key: "a", value: "a", card: { title: "成员甲" } },
      { key: "b", value: "b", card: { title: "成员乙" } },
    ],
    ...overrides,
  };
}

function treeProps(overrides: Partial<SelectorSurfaceStructuredTreeSpec<string>>): SelectorSurfaceStructuredTreeSpec<string> {
  return {
    kind: "tree",
    selectedId: null,
    onSelect: () => undefined,
    items: [
      {
        key: "root",
        value: "root",
        card: { title: "根节点", levelLabel: "集团" },
        children: [
          {
            key: "child",
            value: "child",
            card: { title: "子节点" },
            children: [{ key: "grand", value: "grand", card: { title: "孙节点" } }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("list: renders antd list with groups, commands, and selected-key state", () => {
  const markup = renderClientSurface(<SelectorSurface {...listProps({
    title: "选择成员",
    commands: [{ key: "create", label: "新建成员", onClick: () => undefined }],
    selectedId: "b",
    items: [
      { key: "a", value: "a", group: "在职", card: { title: "成员甲", code: "M01", status: { label: "启用", tone: "success" } } },
      { key: "b", value: "b", group: "离职", card: { title: "成员乙", meta: ["部门一", "岗位一"] } },
    ],
  })} />);

  assert.match(markup, /data-ui-renderer="antd"/);
  // antd 6.5.3 废弃 List 组件，列表项为纯 div：断言契约语义而非组件类名
  assert.match(markup, /role="button"/);
  assert.match(markup, /选择成员/);
  assert.match(markup, /新建成员/);
  assert.match(markup, /成员甲/);
  assert.match(markup, /成员乙/);
  assert.match(markup, /在职/);
  assert.match(markup, /离职/);
  // code/status 走 antd Tag
  assert.match(markup, /ant-tag/);
  assert.match(markup, /启用/);
  // selectedId 契约为单选：仅 b 标记选中
  assert.match(markup, /data-selector-key="b"[^>]*data-selected="true"/);
  assert.ok(!/data-selector-key="a"[^>]*data-selected="true"/.test(markup));
});

test("list: maps loading and empty contracts to antd Skeleton and Empty", () => {
  const loading = renderClientSurface(<SelectorSurface {...listProps({ loading: true, loadingText: "加载成员中..." })} />);
  assert.match(loading, /ant-skeleton/);
  assert.match(loading, /加载成员中\.\.\./);

  const empty = renderClientSurface(<SelectorSurface {...listProps({ items: [], emptyText: "暂无成员" })} />);
  assert.match(empty, /ant-empty/);
  assert.match(empty, /暂无成员/);
});

test("list: renders inline edit inside the Ant selector without row activation", () => {
  const markup = renderClientSurface(<SelectorSurface {...listProps({
    items: [{
      key: "a",
      value: "a",
      card: {
        title: "成员甲",
        inlineEdit: { value: "成员甲", onChange: () => undefined, onSave: () => undefined, onCancel: () => undefined },
      },
    }],
  })} />);

  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /data-selector-inline-edit="true"/);
  assert.doesNotMatch(markup, /cursor-pointer/);
  assert.match(markup, /保存/);
});

test("list: preserves per-card size, desktop gaps, mobile dividers, and nested key boundaries", () => {
  const markup = renderClientSurface(<SelectorSurface {...listProps({
    items: [
      { key: "a", value: "a", card: { title: "紧凑项", size: "sm", status: { label: "可点", onClick: () => undefined } } },
      { key: "b", value: "b", card: { title: "标准项", size: "md" } },
    ],
  })} />);
  assert.match(markup, /px-2\.5 py-2/);
  assert.match(markup, /px-3 py-3/);
  assert.match(markup, /space-y-2 max-sm:space-y-0 max-sm:divide-y/);
  const source = readFileSync(new URL("./antd-selection-shared.tsx", import.meta.url), "utf8");
  assert.match(source, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("tree: renders antd tree with defaultExpandedLevel semantics and selected key", () => {
  const markup = renderClientSurface(<SelectorSurface {...treeProps({
    defaultExpandedLevel: 1,
    selectedId: "child",
    items: [
      {
        key: "root",
        value: "root",
        card: { title: "根节点", levelLabel: "集团" },
        children: [
          {
            key: "child",
            value: "child",
            card: { title: "选中子节点", code: "B1", codeTone: "danger" },
            children: [{ key: "grand", value: "grand", card: { title: "孙节点" } }],
          },
        ],
      },
    ],
  })} />);

  assert.match(markup, /ant-tree/);
  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /根节点/);
  // 层级徽标 label 契约
  assert.match(markup, /集团/);
  // defaultExpandedLevel=1：根展开、子可见、孙隐藏
  assert.match(markup, /选中子节点/);
  assert.ok(!markup.includes("孙节点"));
  // selectedId 单选契约
  assert.match(markup, /data-tree-node-key="child"[^>]*data-selected="true"/);
  assert.ok(!/data-tree-node-key="root"[^>]*data-selected="true"/.test(markup));
  assert.match(markup, /!border-red-200 !bg-red-50 !text-red-700/);
  assert.doesNotMatch(markup, /data-color="red"/);
});

test("tree: controlled expandedIds lock expansion", () => {
  const collapsed = renderClientSurface(<SelectorSurface {...treeProps({
    expandedIds: [],
    onToggle: () => undefined,
  })} />);
  assert.ok(!collapsed.includes("子节点"));

  const expanded = renderClientSurface(<SelectorSurface {...treeProps({
    expandedIds: ["root"],
    onToggle: () => undefined,
  })} />);
  assert.match(expanded, /子节点/);
});

test("tree: collapsible=false stays Ant and expands every level without a switcher", () => {
  const markup = renderClientSurface(<SelectorSurface {...treeProps({ collapsible: false })} />);
  assert.match(markup, /ant-tree/);
  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /孙节点/);
});

test("tree: keeps every level on one baseline with the expanded branch guide", () => {
  const markup = renderClientSurface(<SelectorSurface {...treeProps({ collapsible: false })} />);
  assert.match(markup, /data-tree-indent-mode="flat-guided"/);
  assert.match(markup, /style="--ant-tree-indent-size:0px;/);
  assert.match(markup, /workspace-tree-branch-line/);
  assert.match(markup, /border-inline-start:3px solid #10b981;margin-bottom:0;padding-bottom:4px/);
});

test("tree: selected but collapsed node does not show an expanded branch guide", () => {
  const markup = renderClientSurface(<SelectorSurface {...treeProps({ expandedIds: [], selectedId: "root" })} />);
  assert.doesNotMatch(markup, /workspace-tree-branch-line/);
  assert.match(markup, /border-inline-start:3px solid transparent/);
});

test("tree: nested inline edit stays inside the Ant tree", () => {
  const markup = renderClientSurface(<SelectorSurface {...treeProps({
    defaultExpandedLevel: 1,
    items: [{
      key: "root",
      value: "root",
      card: { title: "根节点" },
      children: [{
        key: "child",
        value: "child",
        card: {
          title: "子节点",
          inlineEdit: { value: "子节点", onChange: () => undefined, onSave: () => undefined, onCancel: () => undefined },
        },
      }],
    }],
  })} />);

  assert.match(markup, /ant-tree/);
  assert.match(markup, /data-selector-inline-edit="true"/);
  assert.match(markup, /保存/);
});
