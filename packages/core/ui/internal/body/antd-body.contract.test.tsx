import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdComposedBody } from "./antd-body";
import type { BodySurfaceComposedSectionProps } from "../../BodySurface.types";
import type { FormSurfaceProps } from "../../FormSurface.types";

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

function messageBody(content: string): BodySurfaceComposedSectionProps {
  return { kind: "section", message: { content } };
}

test("renders section header badges, actions, and row create controls", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{
      key: "roster",
      header: {
        title: "员工名册",
        badges: [{ key: "count", label: "3 条", tone: "info" }],
        actions: [{ key: "export", label: "导出名册" }],
        create: { id: "create-employee", title: "新增员工", presentation: "row", onCreate: () => undefined },
      },
      body: messageBody("名册内容"),
    }],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /员工名册/);
  assert.match(markup, /3 条/);
  assert.match(markup, /导出名册/);
  assert.match(markup, /新增员工/);
  assert.match(markup, /名册内容/);
});

test("keeps disclosure sections collapsed until the contract expands them", () => {
  const body = (expanded: boolean): BodySurfaceComposedSectionProps => ({
    kind: "section",
    sections: [{
      key: "collapsible",
      header: { title: "可折叠区块" },
      disclosure: { expanded, onExpandedChange: () => undefined },
      body: messageBody("折叠内容"),
    }],
  });

  const collapsed = renderClientSurface(<AntdComposedBody body={body(false)} />);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.doesNotMatch(collapsed, /折叠内容/);

  const expanded = renderClientSurface(<AntdComposedBody body={body(true)} />);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /折叠内容/);
});

test("maps gridColumns 3 to a three-column grid", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    layout: "grid",
    gridColumns: 3,
    sections: [
      { key: "a", body: messageBody("栏目甲") },
      { key: "b", body: messageBody("栏目乙") },
    ],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /md:grid-cols-3/);
  assert.match(markup, /栏目甲/);
  assert.match(markup, /栏目乙/);
});

test("renders empty status content instead of dropping it", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    status: { kind: "empty", content: "暂无分析数据" },
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /暂无分析数据/);
});

test("renders message links declared by the contract", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    message: {
      content: "同步失败",
      tone: "warning",
      link: { label: "查看审计日志", href: "/audit-log" },
    },
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /同步失败/);
  assert.match(markup, /查看审计日志/);
  assert.match(markup, /href="\/audit-log"/);
});

test("renders filters form header and commands", () => {
  const form: FormSurfaceProps = {
    kind: "filters",
    header: { title: "绩效筛选", description: "按考核周期过滤" },
    commands: [{ key: "refresh", label: "刷新" }],
    content: {
      items: [{
        kind: "field",
        key: "keyword",
        label: "关键词",
        spec: { valueType: "string", control: "text" },
      }],
    },
  };
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{ key: "filters", body: { kind: "form", form } }],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /绩效筛选/);
  assert.match(markup, /按考核周期过滤/);
  assert.match(markup, /刷新/);
  assert.match(markup, /关键词/);
});
