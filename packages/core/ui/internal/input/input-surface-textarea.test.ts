import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InputSurfaceRenderer } from "../../InputSurface";

const multilineSpec = {
  valueType: "string",
  control: "text",
  multiline: true,
} as const;

function renderInputSurface(props: React.ComponentProps<typeof InputSurfaceRenderer>) {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  try {
    return renderToStaticMarkup(React.createElement(InputSurfaceRenderer, props));
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
}

test("InputSurface multiline text grows with content by default", () => {
  const markup = renderInputSurface({
    spec: multilineSpec,
    value: "用于生产经营、预计使用超过一个会计年度且成本能够可靠计量；出租或持有增值的房产需先复核投资性房地产分类。",
  });

  assert.match(markup, /rows="1"/);
  assert.match(markup, /resize-none/);
  assert.match(markup, /overflow-y-hidden/);
});

test("InputSurface multiline text can explicitly disable content growth", () => {
  const markup = renderInputSurface({
    spec: multilineSpec,
    value: "固定高度文本",
    autoGrow: false,
  });

  assert.doesNotMatch(markup, /overflow-y-hidden/);
});
