import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdComposedBody } from "./antd-body";
import { AntdPageBody } from "../page/antd-page";
import type { BodySurfaceComposedSectionProps, BodySurfaceProps, BodySurfaceSplitSectionProps } from "../../BodySurface.types";

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

test("renders top-level title and commands with primary frame ownership", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    title: "员工档案",
    commands: [{ key: "export", label: "导出档案" }],
    sections: [{ key: "summary", body: { kind: "section", message: { content: "档案内容" } } }],
  };

  const markup = renderClientSurface(<AntdPageBody body={body as BodySurfaceProps} />);

  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /data-surface-frame="primary"/);
  assert.match(markup, /员工档案/);
  assert.match(markup, /导出档案/);
  assert.match(markup, /档案内容/);
});

test("renders title/commands inside the frame without nesting a second frame", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    title: "外层标题",
    sections: [{ key: "inner", body: { kind: "section", message: { content: "内部内容" } } }],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.equal(markup.match(/data-surface-frame="primary"/g)?.length, 1);
  assert.match(markup, /外层标题/);
  assert.match(markup, /内部内容/);
});

test("keeps nested title/commands inside a card section from owning a frame", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{
      key: "card",
      header: { title: "外层章节" },
      body: {
        kind: "section",
        title: "嵌套标题",
        commands: [{ key: "nested", label: "嵌套命令" }],
        message: { content: "嵌套内容" },
      },
    }],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.equal(markup.match(/data-surface-frame="primary"/g)?.length, 1);
  assert.match(markup, /嵌套标题/);
  assert.match(markup, /嵌套命令/);
  assert.match(markup, /嵌套内容/);
});

test("split sections render through Ant Splitter while keeping mobile list-detail navigation", () => {
  const body: BodySurfaceSplitSectionProps = {
    kind: "section",
    layout: "split",
    master: {
      label: "员工列表",
      body: {
        kind: "selector",
        selector: {
          kind: "list",
          selectedId: null,
          items: [{ key: "a", value: "a", card: { title: "成员甲" } }],
          onSelect: () => undefined,
        },
      },
    },
    detail: { kind: "section", message: { content: "员工详情" } },
    desktop: { ratio: [3, 7] },
  };
  const markup = renderClientSurface(<AntdPageBody body={body} />);
  assert.match(markup, /ant-splitter/);
  assert.match(markup, /data-desktop-split-workspace="true"/);
  assert.match(markup, /data-mobile-split-pane="list"/);
  assert.match(markup, /成员甲/);
  assert.match(markup, /员工详情/);
});
