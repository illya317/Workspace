import assert from "node:assert/strict";
import test from "node:test";

import type { WorkTaskSpace } from "./task-spaces";
import { intersectWorkSpaces } from "./agent-work-overview-model";

const permissions = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
  canArchive: false,
  canSubmit: true,
  canApprove: false,
  canManagePermissions: false,
};

function space(targetType: WorkTaskSpace["targetType"], targetId: number, overrides = {}) {
  return {
    targetType,
    targetId,
    name: `${targetType}-${targetId}`,
    subtitle: null,
    lifecycleStatus: "active",
    actionPermissions: { ...permissions, ...overrides },
    actionRuntimes: {} as WorkTaskSpace["actionRuntimes"],
    counts: { objective: 1, keyResult: 2, task: 3, archived: 0 },
  } satisfies WorkTaskSpace;
}

test("delegated Work context only keeps spaces visible to requester and actor", () => {
  const result = intersectWorkSpaces(
    [space("department", 1), space("project", 9)],
    [space("department", 1), space("project", 12)],
  );

  assert.deepEqual(result.map((item) => `${item.targetType}:${item.targetId}`), ["department:1"]);
});

test("delegated Work context intersects scoped actions", () => {
  const result = intersectWorkSpaces(
    [space("department", 1)],
    [space("department", 1, { canUpdate: false, canSubmit: false })],
  );

  assert.equal(result[0]?.actionPermissions.canRead, true);
  assert.equal(result[0]?.actionPermissions.canUpdate, false);
  assert.equal(result[0]?.actionPermissions.canSubmit, false);
});
