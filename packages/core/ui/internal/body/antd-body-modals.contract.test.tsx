import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BodySurfaceComposedSectionProps } from "../../BodySurface.types";

mock.module("../../BodySurface", {
  exports: {
    default: (props: { modals?: { title: string }[] }) => (
      <div data-legacy-body-delegate="true">{(props.modals ?? []).map((modal) => modal.title).join(",")}</div>
    ),
  },
} as never);

const { AntdComposedBody } = await import("./antd-body");

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

test("delegates top-level modals to the legacy renderer instead of dropping them", () => {
  const body: BodySurfaceComposedSectionProps = {
    kind: "section",
    sections: [{ key: "summary", body: { kind: "section", message: { content: "汇总内容" } } }],
    modals: [{
      key: "audit-log",
      open: true,
      title: "审计日志",
      onClose: () => undefined,
      sections: [],
    }],
  };

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /汇总内容/);
  assert.match(markup, /data-legacy-body-delegate="true"/);
  assert.match(markup, /审计日志/);
});
