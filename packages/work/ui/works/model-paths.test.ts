import assert from "node:assert/strict";
import test from "node:test";
import type { WorkTaskSpace } from "./types";
import { getWorkSpaceHomePath, getWorkSpaceWorkbenchPath, getWorkTargetFromPath } from "./space-paths";

test("space home and workbench paths stay distinct for every workspace type", () => {
  assert.equal(getWorkSpaceHomePath("personal", 7), "/work/me");
  assert.equal(getWorkSpaceWorkbenchPath("personal", 7), "/work/me/space");

  assert.equal(getWorkSpaceHomePath("department", 12), "/work/department/12");
  assert.equal(getWorkSpaceWorkbenchPath("department", 12), "/work/department/12/space");

  assert.equal(getWorkSpaceHomePath("project", 21), "/work/project/21");
  assert.equal(getWorkSpaceWorkbenchPath("project", 21), "/work/project/21/space");
});

test("space routes resolve the owning home instead of falling back to the agent", () => {
  const spaces = [
    { targetType: "personal", targetId: 7 },
    { targetType: "department", targetId: 12 },
    { targetType: "project", targetId: 21 },
  ] as WorkTaskSpace[];

  assert.equal(getWorkTargetFromPath("/workspace/work/me/space", spaces), spaces[0]);
  assert.equal(getWorkTargetFromPath("/workspace/work/department/12/space", spaces), spaces[1]);
  assert.equal(getWorkTargetFromPath("/workspace/work/project/21/space", spaces), spaces[2]);
  assert.equal(getWorkTargetFromPath("/workspace/work", spaces), null);
});
