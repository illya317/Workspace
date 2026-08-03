import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdComposedBody } from "./antd-body";
import { AntdPageBody } from "../page/antd-page";
import type { BodySurfaceComposedSectionProps, BodySurfaceProps } from "../../BodySurface.types";

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

function drilldownBody(): BodySurfaceComposedSectionProps {
  return {
    kind: "section",
    mobilePresentation: "drilldown",
    sections: [
      {
        key: "roster",
        header: {
          title: "员工名册",
          badges: [{ key: "count", label: "3 条", tone: "info" }],
        },
        body: { kind: "section", message: { content: "名册内容" } },
      },
      {
        key: "positions",
        label: "岗位列表",
        body: { kind: "section", message: { content: "岗位内容" } },
      },
    ],
  };
}

test("renders the mobile drilldown directory with ordering, numbering, and badges", () => {
  const markup = renderClientSurface(<AntdComposedBody body={drilldownBody()} />);

  assert.match(markup, /data-mobile-section-view="directory"/);
  // 初始为目录视图:无激活章节,不渲染返回导航。
  assert.doesNotMatch(markup, /返回章节目录/);
  // 桌面 stack 仍渲染,仅在移动端隐藏。
  assert.match(markup, /max-sm:hidden/);
  // 目录保留章节顺序、编号与徽章。
  assert.ok(markup.indexOf("员工名册") < markup.indexOf("岗位列表"), "directory order follows section order");
  assert.match(markup, /3 条/);
  assert.match(markup, />1</);
  assert.match(markup, />2</);
});

test("falls back to a plain stack when a section lacks a navigation title", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    mobilePresentation: "drilldown",
    sections: [
      { key: "titled", header: { title: "有标题" }, body: { kind: "section", message: { content: "甲" } } },
      { key: "untitled", body: { kind: "section", message: { content: "乙" } } },
    ],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.doesNotMatch(markup, /data-mobile-section-view/);
  assert.doesNotMatch(markup, /max-sm:hidden/);
  assert.match(markup, /甲/);
  assert.match(markup, /乙/);
});

test("keeps page-level drilldown bodies on the antd renderer instead of delegating", () => {
  const markup = renderClientSurface(<AntdPageBody body={drilldownBody() as BodySurfaceProps} />);

  assert.match(markup, /data-ui-renderer="antd"/);
  assert.match(markup, /data-mobile-section-view="directory"/);
  assert.match(markup, /名册内容/);
  assert.match(markup, /岗位内容/);
});
