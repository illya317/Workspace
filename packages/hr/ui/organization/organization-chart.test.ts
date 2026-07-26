import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrganizationChartVisual,
  type OrganizationChartDepartment,
} from "./organization-chart";

const departments: OrganizationChartDepartment[] = [
  { id: 1, code: "BOD", name: "董事会", hierarchyKind: "G", level: 1, parentId: null, isArchived: false },
  { id: 2, code: "EXC", name: "执行委员会", hierarchyKind: "G", level: 2, parentId: 1, isArchived: false },
  { id: 3, code: "GOV-X", name: "治理委员会", hierarchyKind: "G", level: 3, parentId: 2, isArchived: false },
  { id: 4, code: "FUN001", name: "职能事业部平台", hierarchyKind: "M", level: 1, parentId: 3, isArchived: false },
  { id: 5, code: "ADM-X0", name: "行政人事部", hierarchyKind: "M", level: 2, parentId: 4, isArchived: false },
  { id: 6, code: "ADM-X1", name: "行政部", hierarchyKind: "M", level: 3, parentId: 5, isArchived: false },
  { id: 7, code: "OLD100", name: "历史部门", hierarchyKind: "M", level: 2, parentId: 4, isArchived: true },
  { id: 8, code: "LOST001", name: "未接入董事会的组织", hierarchyKind: "M", level: 1, parentId: null, isArchived: false },
  { id: 9, code: "CHM001", name: "化药事业部", hierarchyKind: "M", level: 1, parentId: 3, isArchived: false },
  { id: 10, code: "CHM100", name: "化药市场部", hierarchyKind: "M", level: 2, parentId: 9, isArchived: false },
];

const copy = {
  missingRootText: "missing root",
  emptyText: "empty chart",
};

test("organization chart keeps functional level two but hides business level two and every level three", () => {
  const visual = buildOrganizationChartVisual(departments, copy);
  assert.equal(visual.focusNodeKey, "organization:1");
  assert.deepEqual(
    visual.nodes.map((node) => node.label),
    ["董事会", "执行委员会", "治理委员会", "职能事业部平台", "化药事业部", "行政人事部"],
  );
  assert.equal(visual.edges.length, 5);
  assert.equal(visual.layout?.kind, "hierarchy");
  assert.equal(visual.layout?.nodeAspect, "adaptive");
  assert.equal(
    visual.nodes.find((node) => node.label === "职能事业部平台")?.layoutOrder,
    undefined,
  );
  assert.equal(
    visual.nodes.find((node) => node.label === "化药事业部")?.layoutOrder,
    9,
  );
});

test("organization chart preserves an explicit sibling order and leaves missing order to layout", () => {
  const visual = buildOrganizationChartVisual([
    departments[0] as OrganizationChartDepartment,
    { ...departments[1] as OrganizationChartDepartment, id: 20, code: "A01", sortOrder: 20 },
    { ...departments[1] as OrganizationChartDepartment, id: 21, code: "A02", sortOrder: 10 },
    { ...departments[1] as OrganizationChartDepartment, id: 22, code: "A03" },
  ], copy);
  assert.deepEqual(
    visual.nodes.slice(1).map((node) => [node.key, node.layoutOrder]),
    [["organization:21", 10], ["organization:20", 20], ["organization:22", undefined]],
  );
});
