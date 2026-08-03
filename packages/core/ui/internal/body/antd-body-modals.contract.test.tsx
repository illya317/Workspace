import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BodySurfaceComposedSectionProps, BodySurfaceSectionBodyProps } from "../../BodySurface.types";

const antd = await import("antd");

// antd Modal 经 Portal 渲染,SSR 静态标记下无输出;此处替换为内联渲染器,
// 以断言 open/title/width/footer/content 的契约映射,其余 antd 组件保持真实实现。
mock.module("antd", {
  namedExports: {
    ...antd,
    Modal: ({ open, title, width, footer, children, destroyOnHidden, keyboard, mask }: {
      open?: boolean;
      title?: React.ReactNode;
      width?: number | string;
      footer?: React.ReactNode;
      children?: React.ReactNode;
      destroyOnHidden?: boolean;
      keyboard?: boolean;
      mask?: boolean | { closable?: boolean };
    }) => (open ? (
      <div
        data-antd-modal="true"
        data-destroy-on-hidden={String(destroyOnHidden)}
        data-keyboard={String(keyboard)}
        data-mask-closable={String(typeof mask === "object" ? mask.closable : undefined)}
        data-width={String(width)}
      >
        <h3>{title}</h3>
        <div>{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    ) : null),
  },
} as never);

mock.module("../../CreateSurface", {
  defaultExport: () => <div data-create-surface="true" />,
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

function bodyWithModal(modal: Partial<import("../../BodySurface.types").BodySurfaceModalSpec> & { key: string }): BodySurfaceComposedSectionProps {
  return {
    kind: "section",
    sections: [{ key: "summary", body: { kind: "section", message: { content: "汇总内容" } } }],
    modals: [{
      open: true,
      title: "审计日志",
      onClose: () => undefined,
      sections: [{ key: "detail", body: { kind: "section", message: { content: "弹层内容" } } }],
      ...modal,
    }],
  };
}

test("renders open top-level modals through the antd modal with size and footer contracts", () => {
  const body = bodyWithModal({
    key: "audit-log",
    size: "lg",
    actions: [{ key: "close", label: "关闭弹层" }],
    pagination: { page: 1, totalPages: 3, onPageChange: () => undefined },
  });

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /汇总内容/);
  assert.match(markup, /data-antd-modal="true"/);
  // size lg 对应 legacy max-w-4xl(896px)。
  assert.match(markup, /data-width="896"/);
  assert.match(markup, /data-destroy-on-hidden="true"/);
  // legacy DetailModal neither closed on backdrop click nor installed an Escape listener.
  assert.match(markup, /data-mask-closable="false"/);
  assert.match(markup, /data-keyboard="false"/);
  const source = readFileSync(new URL("./antd-body.tsx", import.meta.url), "utf8");
  assert.match(source, /mask=\{\{ closable: false \}\}/);
  assert.doesNotMatch(source, new RegExp(["mask", "Closable"].join("")));
  assert.match(markup, /审计日志/);
  assert.match(markup, /弹层内容/);
  assert.match(markup, /关闭弹层/);
  assert.doesNotMatch(markup, /data-legacy-body-delegate/);
});

test("keeps closed modals unmounted", () => {
  const body = bodyWithModal({ key: "closed", open: false, title: "隐藏弹层" });

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.doesNotMatch(markup, /data-antd-modal/);
  assert.doesNotMatch(markup, /隐藏弹层/);
});

test("routes create modal content through the governed CreateSurface", () => {
  const body = bodyWithModal({
    key: "create-modal",
    sections: [{
      key: "create-section",
      body: { kind: "create", create: {} } as unknown as BodySurfaceSectionBodyProps,
    }],
  });

  const markup = renderClientSurface(<AntdComposedBody body={body} />);

  assert.match(markup, /data-antd-modal="true"/);
  assert.match(markup, /审计日志/);
  assert.match(markup, /data-create-surface="true"/);
  assert.doesNotMatch(markup, /data-legacy-body-delegate/);
});
