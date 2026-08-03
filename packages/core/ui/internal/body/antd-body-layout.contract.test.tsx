import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BodySurfaceComposedSectionProps, BodySurfaceProps } from "../../BodySurface.types";
import type { FormSurfaceProps } from "../../FormSurface.types";
import FeedbackProvider from "../../services/FeedbackProvider";
import { AntdPageBody } from "../page/antd-page";
import { AntdBodySurface, AntdComposedBody, resolveAntdSplitMobileBack } from "./antd-body";

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

function message(content: string): BodySurfaceComposedSectionProps {
  return { kind: "section", message: { content } };
}

test("joined root cards keep first/last chrome and lg grid breakpoints", () => {
  const stack: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [
      {
        key: "first",
        header: { title: "第一段完整标题", badges: [{ key: "count", label: "3 条", tone: "info" }] },
        body: message("甲"),
      },
      { key: "last", header: { title: "第二段" }, body: message("乙") },
    ],
  };
  const stackMarkup = renderClientSurface(<AntdComposedBody body={stack} />);
  assert.match(stackMarkup, /rounded-t-md rounded-b-none/);
  assert.match(stackMarkup, /-mt-px rounded-b-md rounded-t-none/);
  assert.match(stackMarkup, /class="truncate text-base font-semibold text-slate-900" title="第一段完整标题"/);
  assert.match(stackMarkup, /flex min-w-0 flex-wrap items-center gap-3/);
  assert.match(stackMarkup, /3 条/);

  const gridMarkup = renderClientSurface(<AntdComposedBody body={{ ...stack, layout: "grid", gridColumns: 3 }} />);
  assert.match(gridMarkup, /lg:grid-cols-3/);
  assert.doesNotMatch(gridMarkup, /md:grid-cols-3/);
});

test("nested sections use divider and joined nested spacing without a second primary frame", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{
      key: "outer",
      header: { title: "外层" },
      body: {
        kind: "section",
        sections: [
          { key: "nested-first", header: { title: "内层一" }, body: message("一") },
          { key: "nested-last", header: { title: "内层二" }, body: message("二") },
        ],
      },
    }],
  };
  const markup = renderClientSurface(<AntdComposedBody body={body} />);
  assert.equal((markup.match(/data-surface-frame="primary"/g) ?? []).length, 1);
  assert.match(markup, /border-b border-slate-200 pb-3/);
  assert.match(markup, /space-y-4 pb-4/);
  assert.match(markup, /space-y-4 border-t border-slate-200 pt-4/);
});

test("visibility uses the shared sm breakpoint classes", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [
      { key: "mobile", visibility: "mobile", body: message("移动端") },
      { key: "desktop", visibility: "desktop", body: message("桌面端") },
    ],
  };
  const markup = renderClientSurface(<AntdComposedBody body={body} />);
  assert.match(markup, /body-surface-mobile-only sm:hidden/);
  assert.match(markup, /body-surface-desktop-only max-sm:hidden/);
  assert.doesNotMatch(markup, /max-md:hidden/);
});

test("card table sections retain mobile flush header and body spacing", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{
      key: "table",
      header: { title: "员工表" },
      body: {
        kind: "data",
        data: { kind: "table", rows: [], columns: [], rowKey: (_row: unknown, index: number) => index },
      },
    }],
  };
  const markup = renderClientSurface(<AntdComposedBody body={body} />);
  assert.match(markup, /max-sm:!space-y-0 max-sm:!p-0/);
  assert.match(markup, /px-3 pb-3 pt-3/);
});

test("block create source order is header, anchor, body under the anchor provider", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{
      key: "create",
      header: {
        title: "HEADER_MARK",
        create: {
          id: "employee-create",
          title: "新增员工",
          presentation: "block",
          trigger: "surface",
          open: true,
          content: { kind: "form", form: { items: [] } },
          submission: { action: "save", execute: () => undefined },
          onOpenChange: () => undefined,
        },
      },
      body: message("BODY_MARK"),
    }],
  };
  const markup = renderClientSurface(
    <FeedbackProvider><AntdComposedBody body={body} /></FeedbackProvider>,
  );
  const headerIndex = markup.indexOf("HEADER_MARK");
  const anchorIndex = markup.indexOf('class="contents"');
  const bodyIndex = markup.indexOf("BODY_MARK");
  assert.ok(headerIndex >= 0 && headerIndex < anchorIndex);
  assert.ok(anchorIndex < bodyIndex);

  const source = readFileSync(new URL("./antd-body.tsx", import.meta.url), "utf8");
  assert.match(source, /<CreateSurfaceAnchorProvider><BodySurfaceRevealProvider>/);
});

test("split mobile back closes an open page create before navigating to the list", () => {
  const events: string[] = [];
  const closeCreate = (open: boolean) => events.push(`create:${String(open)}`);
  const navigate = () => events.push("list");
  const whileCreating = resolveAntdSplitMobileBack({ open: true, onOpenChange: closeCreate }, navigate);
  whileCreating?.();
  assert.deepEqual(events, ["create:false", "list"]);

  events.length = 0;
  const withoutCreate = resolveAntdSplitMobileBack({ open: false, onOpenChange: closeCreate }, navigate);
  withoutCreate?.();
  assert.deepEqual(events, ["list"]);
});

test("Page Ant body entry is layout-neutral and keeps explanatory-text governance", () => {
  const markup = renderClientSurface(<AntdPageBody body={message("正文")} />);
  assert.match(markup, /class="contents text-slate-900"/);
  assert.throws(
    () => renderClientSurface(<AntdPageBody body={{ kind: "section", description: "禁止说明" } as unknown as BodySurfaceProps} />),
    /description is not allowed/,
  );
});

test("direct and nested form bodies share the complete Ant FormSurface route", () => {
  const form: FormSurfaceProps = {
    kind: "filters",
    header: { title: "统一筛选", description: "完整表单契约" },
    content: {
      layout: { flow: "grid", columns: 2 },
      items: [{
        key: "keyword",
        label: "关键词",
        spec: { valueType: "string", control: "text" },
        hint: "请输入查询条件",
        error: "查询条件无效",
      }],
    },
    submit: { onSubmit: () => undefined },
  };
  const direct = renderClientSurface(<AntdBodySurface body={{ kind: "form", form }} />);
  const nested = renderClientSurface(<AntdComposedBody body={{
    kind: "section",
    sections: [{ key: "filters", body: { kind: "form", form } }],
  }} />);
  for (const markup of [direct, nested]) {
    assert.match(markup, /data-antd-form-surface="true"/);
    assert.match(markup, /data-form-flow="grid"/);
    assert.match(markup, /完整表单契约/);
    assert.match(markup, /查询条件无效/);
    assert.doesNotMatch(markup, /请输入查询条件/);
    assert.equal((markup.match(/<form/g) ?? []).length, 1);
  }

  const source = readFileSync(new URL("./antd-body.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /AntdFiltersForm|renderControl|isFormSurfaceFieldRequired/);
  assert.equal((source.match(/body\.kind === "form"\) return <FormSurface \{\.\.\.body\.form\} \/>/g) ?? []).length, 2);
});
