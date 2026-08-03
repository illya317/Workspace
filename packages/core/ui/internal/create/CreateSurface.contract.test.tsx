import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CreateSurface from "../../CreateSurface";
import FeedbackProvider from "../../services/FeedbackProvider";
import type { PageSurfaceCreateRuntimeProps } from "../../CreateSurface.types";

function renderCreate(props: PageSurfaceCreateRuntimeProps) {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  try {
    return renderToStaticMarkup(
      <FeedbackProvider><CreateSurface {...props} /></FeedbackProvider>,
    );
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
}

function inlineProps(overrides: Partial<PageSurfaceCreateRuntimeProps> = {}): PageSurfaceCreateRuntimeProps {
  return {
    id: "employee-create",
    title: "新增员工",
    presentation: "inline",
    trigger: "toolbar",
    open: true,
    content: {
      kind: "form",
      form: { items: [{ kind: "note", key: "main", content: "正式字段" }] },
    },
    submission: { action: "save", execute: () => undefined },
    onOpenChange: () => undefined,
    ...overrides,
  } as PageSurfaceCreateRuntimeProps;
}

test("closed inline runtime renders neither a second trigger nor a panel", () => {
  assert.equal(renderCreate(inlineProps({ open: false })), "");
});

test("inline form delegates content and keeps one native form", () => {
  const markup = renderCreate(inlineProps());
  assert.match(markup, /正式字段/);
  assert.match(markup, /data-create-presentation="inline"/);
  assert.equal((markup.match(/<form/g) ?? []).length, 1);
});

test("two-stage first renders only first items and hides submit", () => {
  const markup = renderCreate(inlineProps({
    content: {
      kind: "form",
      form: { items: [{ kind: "note", key: "main", content: "第二阶段字段" }] },
      flow: {
        kind: "two-stage",
        stage: "first",
        first: { items: [{ kind: "note", key: "first", content: "先选择类型" }] },
      },
    },
  }));
  assert.match(markup, /先选择类型/);
  assert.doesNotMatch(markup, /第二阶段字段/);
  assert.doesNotMatch(markup, /type="submit"/);
});

test("surface disabled OR submission disabled disables submit", () => {
  const surfaceDisabled = renderCreate(inlineProps({
    disabled: true,
    submission: { action: "save", disabled: false, execute: () => undefined },
  }));
  assert.match(surfaceDisabled.slice(surfaceDisabled.indexOf('type="submit"')), /disabled/);

  const submissionDisabled = renderCreate(inlineProps({
    disabled: false,
    submission: { action: "save", disabled: true, execute: () => undefined },
  }));
  assert.match(submissionDisabled.slice(submissionDisabled.indexOf('type="submit"')), /disabled/);
});

test("block sections retain titles and grid content", () => {
  const markup = renderCreate({
    id: "asset-create",
    title: "新增资产",
    presentation: "block",
    trigger: "toolbar",
    open: true,
    content: {
      kind: "sections",
      sections: [
        { key: "base", title: "基础信息", items: [{ kind: "note", key: "code", content: "资产编码" }] },
        { key: "finance", title: "财务信息", items: [{ kind: "note", key: "value", content: "资产原值" }] },
      ],
    },
    submission: { action: "submit", execute: () => undefined },
    onOpenChange: () => undefined,
  });
  assert.match(markup, /基础信息/);
  assert.match(markup, /财务信息/);
  assert.match(markup, /资产编码/);
  assert.match(markup, /资产原值/);
  assert.match(markup, />提交</);
  assert.equal((markup.match(/<form/g) ?? []).length, 1);
});
