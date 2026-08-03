import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdPageBody, AntdPageTabBar, buildAntdPageMobileSelections } from "./antd-page";
import type { BodySurfaceProps } from "../../BodySurface.types";
import type { PageSurfaceTabBarSpec } from "../../PageSurface.types";

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

test("preserves active child navigation for accordion tabbar contracts", () => {
  const tabbar: PageSurfaceTabBarSpec = {
    kind: "tabs",
    active: "department-position",
    activeChild: "active",
    items: [
      { key: "employee", label: "员工资料", compactLabel: "员工" },
      {
        key: "department-position",
        label: "部门岗位",
        compactLabel: "岗位",
        children: [
          { key: "active", label: "在用岗位" },
          { key: "archived", label: "已归档" },
        ],
      },
    ],
    onChange: () => undefined,
    onChildChange: () => undefined,
  };

  const markup = renderClientSurface(<AntdPageTabBar tabbar={tabbar} />);

  assert.match(markup, /员工资料/);
  assert.match(markup, /部门岗位/);
  assert.match(markup, /在用岗位/);
  assert.match(markup, /已归档/);
  assert.match(markup, /岗位 · 在用岗位/);
});

test("keeps two or three simple mobile tabs in the compact segmented control", () => {
  const tabbar: PageSurfaceTabBarSpec = {
    kind: "tabs",
    active: "roster",
    items: [
      { key: "roster", label: "员工资料" },
      { key: "positions", label: "部门岗位" },
    ],
    onChange: () => undefined,
  };
  const markup = renderClientSurface(<AntdPageTabBar tabbar={tabbar} />);
  assert.match(markup, /ant-segmented/);
  assert.match(markup, /员工资料/);
  assert.match(markup, /部门岗位/);
});

test("keeps parent tabs selectable and does not encode contract keys into menu keys", () => {
  const tabbar: PageSurfaceTabBarSpec = {
    kind: "tabs",
    active: "parent:one",
    items: [{
      key: "parent:one",
      label: "岗位",
      children: [{ key: "child:active", label: "在用岗位" }],
    }],
    onChange: () => undefined,
    onChildChange: () => undefined,
  };
  assert.deepEqual(buildAntdPageMobileSelections(tabbar), [
    { key: "parent-0", label: "岗位", parentKey: "parent:one", childKey: undefined },
    { key: "child-0-0", label: "岗位 · 在用岗位", parentKey: "parent:one", childKey: "child:active" },
  ]);
});

test("preserves table row activation and declared row actions", () => {
  const body: BodySurfaceProps = {
    kind: "section",
    sections: [{
      key: "employees",
      body: {
        kind: "data",
        data: {
          kind: "table",
          rows: [{ id: 1, employeeId: "employee-1", name: "员工一" }],
          columns: [{ key: "name", label: "姓名", cell: (row) => row.name }],
          rowKey: (row) => row.id,
          onRowClick: () => undefined,
          rowActions: () => [{
            key: "view",
            label: "查看员工资料",
            kind: "view",
            onClick: () => undefined,
          }],
        },
      },
    }],
  };

  const markup = renderClientSurface(<AntdPageBody body={body} />);

  assert.match(markup, /role="button"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /查看员工资料/);
});

test("preserves expanded rows, edit actions, and interactive cell content", () => {
  const body: BodySurfaceProps = {
    kind: "section",
    sections: [{
      key: "editable-table",
      body: {
        kind: "data",
        data: {
          kind: "table",
          rows: [{ id: 7 }],
          columns: [{
            key: "control",
            label: "交互列",
            required: true,
            cell: () => ({
              kind: "action",
              action: {
                key: "cell-action",
                label: "单元格动作",
                onClick: () => undefined,
              },
            }),
          }],
          rowKey: (row) => row.id,
          expandedRowKey: 7,
          expandedRow: () => ({ kind: "text", value: "展开详情" }),
          rowEditActions: () => ({
            editing: false,
            canEdit: true,
            editLabel: "编辑此行",
            saveLabel: "保存此行",
            cancelLabel: "取消编辑",
            onEdit: () => undefined,
            onSave: () => undefined,
            onCancel: () => undefined,
          }),
        },
      },
    }],
  };

  const markup = renderClientSurface(<AntdPageBody body={body} />);

  assert.match(markup, /单元格动作/);
  assert.match(markup, /编辑此行/);
  assert.match(markup, /展开详情/);
});

test("preserves structured table spans, interactions, and embedded controls", () => {
  const body: BodySurfaceProps = {
    kind: "section",
    sections: [{
      key: "structured-table",
      body: {
        kind: "data",
        data: {
          kind: "structured",
          presentation: { grid: "cells" },
          rows: [
            [
              { header: true, content: { kind: "text", value: "员工" } },
              { header: true, content: { kind: "text", value: "岗位" } },
            ],
            [
              { rowSpan: 2, content: { kind: "text", value: "员工一" } },
              { content: { kind: "text", value: "主岗" } },
            ],
            [
              { content: { kind: "action", action: { key: "edit", label: "编辑兼岗", onClick: () => undefined } } },
            ],
          ],
          rowInteractions: [null, { ariaLabel: "打开员工一", onClick: () => undefined }, null],
        },
      },
    }],
  };

  const markup = renderClientSurface(<AntdPageBody body={body} />);

  assert.match(markup, /row[Ss]pan="2"/);
  assert.match(markup, /打开员工一/);
  assert.match(markup, /编辑兼岗/);
});
