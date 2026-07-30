import assert from "node:assert/strict";
import test from "node:test";

import type { BodySurfaceSectionProps, BodySurfaceSectionSpec } from "../../BodySurface.types";
import {
  bodySurfaceRootOwnsFrame,
  resolveBodySurfaceSectionChrome,
  resolveBodySurfaceSectionStackPosition,
} from "./body-surface-section-chrome";

function section(input: Partial<BodySurfaceSectionSpec>): BodySurfaceSectionSpec {
  return {
    key: "section",
    body: { kind: "section" },
    ...input,
  };
}

function rootSection(input: Partial<BodySurfaceSectionProps>): BodySurfaceSectionProps {
  return { kind: "section", ...input } as BodySurfaceSectionProps;
}

test("top-level root sections with a title or actions own the standard frame", () => {
  assert.equal(bodySurfaceRootOwnsFrame(rootSection({ title: "页面内容" })), true);
  assert.equal(bodySurfaceRootOwnsFrame(rootSection({ commands: [{ key: "refresh", label: "刷新" }] })), true);
});

test("structural, split, and already nested root sections stay transparent", () => {
  assert.equal(bodySurfaceRootOwnsFrame(rootSection({ sections: [] })), false);
  assert.equal(bodySurfaceRootOwnsFrame(rootSection({ layout: "split" } as Partial<BodySurfaceSectionProps>)), false);
  assert.equal(bodySurfaceRootOwnsFrame(rootSection({ title: "内层标题" }), 1), false);
});

test("top-level titled sections own the standard frame", () => {
  assert.equal(resolveBodySurfaceSectionChrome(section({
    header: { title: "协作事项" },
  })), "card");
});

test("headerless structural containers stay transparent", () => {
  assert.equal(resolveBodySurfaceSectionChrome(section({
    body: { kind: "section", sections: [] },
  })), "plain");
});

test("nested titled sections use a divider instead of another frame", () => {
  assert.equal(resolveBodySurfaceSectionChrome(section({
    header: { title: "详情" },
  }), 1), "divider");
});

test("nested siblings receive segmented spacing even when their chrome differs", () => {
  const sections = [
    section({ body: { kind: "data", data: { kind: "summary", metrics: [] } } }),
    section({ header: { title: "职责分布" } }),
  ];

  assert.equal(resolveBodySurfaceSectionChrome(sections[0], 1), "plain");
  assert.equal(resolveBodySurfaceSectionChrome(sections[1], 1), "divider");
  assert.equal(resolveBodySurfaceSectionStackPosition(sections, 0, 1), "first");
  assert.equal(resolveBodySurfaceSectionStackPosition(sections, 1, 1), "last");
});

test("create bodies never add a second frame around CreateSurface", () => {
  assert.equal(resolveBodySurfaceSectionChrome(section({
    body: {
      kind: "create",
      create: {
        id: "create",
        trigger: "surface",
        presentation: "modal",
        title: "新建",
        open: false,
        content: { kind: "form", form: { items: [] } },
        submission: { action: "save", execute: () => undefined },
        onOpenChange: () => undefined,
      },
    },
  })), "plain");
});
