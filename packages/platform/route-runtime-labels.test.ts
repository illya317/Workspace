import assert from "node:assert/strict";
import test from "node:test";
import { getRouteRuntimeMeta } from "./route-runtime-labels";

const workDefinition = {
  moduleDef: {
    href: "/work",
    label: "工作管理",
    children: [
      { href: "/work/me", label: "工作空间", enabled: true, hidden: false },
    ],
  },
  routes: [
    { path: "/work/performance", gatePath: "/work/me" },
  ],
};

test("registered page routes inherit runtime visibility from their gate route", () => {
  assert.deepEqual(getRouteRuntimeMeta("/work/performance", [workDefinition]), {
    baseLabel: "工作空间",
    label: "工作空间",
  });
});

test("registered page routes disappear when their gate route is disabled", () => {
  const disabledDefinition = {
    ...workDefinition,
    moduleDef: {
      ...workDefinition.moduleDef,
      children: workDefinition.moduleDef.children.map((child) => ({ ...child, enabled: false })),
    },
  };
  assert.equal(getRouteRuntimeMeta("/work/performance", [disabledDefinition]), null);
});
