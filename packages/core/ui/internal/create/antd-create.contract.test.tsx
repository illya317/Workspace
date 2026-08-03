import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdCreatePanel } from "./antd-create";

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

const base = {
  action: "save" as const,
  canCreate: true,
  disabled: false,
  submitDisabled: false,
  submitVisible: true,
  submitting: false,
  title: "新增员工",
  onCancel: () => undefined,
  onOpen: () => undefined,
  onSubmit: () => undefined,
};

test("surface owns one trigger while toolbar runtime never duplicates it", () => {
  const surface = renderClientSurface(
    <AntdCreatePanel {...base} open={false} presentation="block" trigger="surface">字段</AntdCreatePanel>,
  );
  assert.match(surface, /新增员工/);
  assert.match(surface, /ant-btn/);
  assert.doesNotMatch(surface, /data-create-native-form/);

  const toolbar = renderClientSurface(
    <AntdCreatePanel {...base} open={false} presentation="block" trigger="toolbar">字段</AntdCreatePanel>,
  );
  assert.equal(toolbar, "");
});

test("inline is not carded and owns exactly one native form", () => {
  const markup = renderClientSurface(
    <AntdCreatePanel {...base} open presentation="inline" trigger="toolbar">姓名字段</AntdCreatePanel>,
  );
  assert.match(markup, /data-create-presentation="inline"/);
  assert.doesNotMatch(markup, /ant-card/);
  assert.equal((markup.match(/<form/g) ?? []).length, 1);
  assert.match(markup, /type="submit"/);
  assert.match(markup, /保存/);
  assert.match(markup, /取消/);
});

test("block uses Ant Card and falls back locally when an explicit anchor is missing", () => {
  const markup = renderClientSurface(
    <AntdCreatePanel {...base} anchor="missing-target" open presentation="block" trigger="surface">
      分区字段
    </AntdCreatePanel>,
  );
  assert.match(markup, /data-create-presentation="block"/);
  assert.match(markup, /ant-card/);
  assert.match(markup, /分区字段/);
  assert.equal((markup.match(/<form/g) ?? []).length, 1);
});

test("two-stage first state hides submit but keeps cancellation", () => {
  const markup = renderClientSurface(
    <AntdCreatePanel {...base} open presentation="block" submitVisible={false} trigger="toolbar">
      选择创建类型
    </AntdCreatePanel>,
  );
  assert.doesNotMatch(markup, /type="submit"/);
  assert.doesNotMatch(markup, />保存</);
  assert.match(markup, /取消/);
});

test("pending state disables cancellation and submission", () => {
  const markup = renderClientSurface(
    <AntdCreatePanel
      {...base}
      open
      presentation="block"
      submitDisabled
      submitting
      trigger="toolbar"
    >
      字段
    </AntdCreatePanel>,
  );
  assert.equal((markup.match(/disabled/g) ?? []).length >= 2, true);
  assert.match(markup, /ant-btn-loading/);
});
