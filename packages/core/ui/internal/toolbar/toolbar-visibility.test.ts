import assert from "node:assert/strict";
import test from "node:test";
import { filterToolbarItemsByViewport } from "./toolbar-item-visibility";
import type { ToolbarItem } from "./Toolbar.types";

const items: ToolbarItem[] = [
  { kind: "create", key: "mobile-create", visibility: "mobile", onClick: () => undefined },
  { kind: "action-group", key: "desktop-edit", visibility: "desktop", actions: [] },
  { kind: "text", key: "shared-status", content: "状态" },
];

test("toolbar viewport visibility removes unusable commands before mobile modeling", () => {
  const mobile = filterToolbarItemsByViewport(items, "mobile");
  const desktop = filterToolbarItemsByViewport(items, "desktop");

  assert.deepEqual(mobile.map((item) => item.key), ["mobile-create", "shared-status"]);
  assert.deepEqual(desktop.map((item) => item.key), ["desktop-edit", "shared-status"]);
});
