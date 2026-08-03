import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSION_ACTION_KEYS, type PermissionActionKey } from "@workspace/platform/permission-actions";
import {
  createPermissionActionMatrixSurface,
  type PermissionMatrixActionState,
} from "./PermissionActionMatrixGrid";

test("permission summary grids bubble clicks to the expandable row", () => {
  let expanded = 0;
  const actionStates = Object.fromEntries(PERMISSION_ACTION_KEYS.map((actionKey) => [actionKey, {
    actionKey,
    has: actionKey === "entry",
    source: actionKey === "entry" ? "direct" : null,
    sourceActionKey: null,
    sourceResourceKey: null,
    directGrantable: true,
    pendingResourceMapping: false,
  }])) as Record<PermissionActionKey, PermissionMatrixActionState>;
  const surface = createPermissionActionMatrixSurface({
    subjects: [{ id: 1 }],
    subjectColumnLabel: "姓名",
    getSubjectKey: (subject) => String(subject.id),
    renderSubject: () => ({ kind: "text", value: "测试用户" }),
    getRecord: () => ({ actionStates }),
    expandedKeys: new Set(),
    onToggleExpand: () => { expanded += 1; },
  });

  assert.equal(surface.kind, "structured");
  if (surface.kind !== "structured") return;
  const summary = surface.rows[1]?.[1]?.content;
  assert.equal(typeof summary, "object");
  if (!summary || typeof summary !== "object" || !("kind" in summary)) return;
  assert.equal(summary.kind, "interactive");
  if (summary.kind !== "interactive") return;
  assert.equal(summary.content.kind, "selectionGrid");
  if (summary.content.kind !== "selectionGrid") return;
  assert.equal(summary.content.stopPropagation, false);
  summary.onClick();
  assert.equal(expanded, 1);
  assert.equal(typeof surface.rowInteractions?.[1]?.onClick, "function");
  surface.rowInteractions?.[1]?.onClick();
  assert.equal(expanded, 2);
});
