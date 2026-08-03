import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAntdDataValue } from "./antd-data-value";

test("Ant DataSurface meter keeps the label authoritative and clamps its visual width", () => {
  const previousReact = Reflect.get(globalThis, "React");
  Reflect.set(globalThis, "React", React);
  try {
    const ordinary = renderToStaticMarkup(<>{renderAntdDataValue({
      kind: "meter",
      value: 60,
      max: 100,
      label: "0.60",
    })}</>);
    const overflow = renderToStaticMarkup(<>{renderAntdDataValue({
      kind: "meter",
      value: 120,
      max: 100,
      label: "1.20",
    })}</>);
    assert.match(ordinary, />0\.60</);
    assert.match(ordinary, /width:60%/);
    assert.match(overflow, /width:100%/);
  } finally {
    if (previousReact === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previousReact);
  }
});
