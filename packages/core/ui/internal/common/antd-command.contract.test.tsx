import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AntdCommandList } from "./antd-command";

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

test("callback submit commands stay button type while native submit remains submit", () => {
  const callback = renderClientSurface(<AntdCommandList commands={[{
    key: "save-callback", label: "保存并回调", type: "submit", onClick: () => undefined,
  }]} />);
  assert.match(callback, /type="button"/);
  assert.doesNotMatch(callback, /type="submit"/);

  const native = renderClientSurface(<AntdCommandList commands={[{
    key: "save-native", label: "原生保存", type: "submit",
  }]} />);
  assert.match(native, /type="submit"/);
});

test("semantic danger inference is reflected by the Ant button", () => {
  const markup = renderClientSurface(<AntdCommandList commands={[{
    key: "delete", label: "删除记录",
  }]} />);
  assert.match(markup, /ant-btn-dangerous/);
});
