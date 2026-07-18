import assert from "node:assert/strict";
import test from "node:test";
import { createWorkSpaceNavigationBody } from "./WorkSpaceSidebar";
import type { WorkPlan, WorkTaskSpace } from "./types";

test("work space navigation keeps monthly and quarterly plans when a stale page size is invalid", () => {
  const space = {
    targetType: "personal",
    targetId: 2,
    name: "个人工作空间",
  } as WorkTaskSpace;
  const plans = [
    plan({ id: 11, title: "2026年07月OKR计划", periodType: "monthly" }),
    plan({ id: 12, title: "2026年第3季度OKR计划", periodType: "quarterly" }),
  ];

  const body = createWorkSpaceNavigationBody({
    spaces: [space],
    active: space,
    activePlanId: null,
    activeRoutineTaskId: null,
    statusFilter: "active",
    routineWorks: [],
    plans,
    loading: false,
    expandedSpaceKeys: new Set(),
    planPageSize: 0.1,
    planPageBySpace: new Map(),
    onSelect: () => undefined,
    onSelectPlan: () => undefined,
    onToggleSpace: () => undefined,
    onPlanPageChange: () => undefined,
  });
  const items = body.selector.items as Array<{ group?: string; value: { kind: string } }>;

  assert.deepEqual(items.map((item) => item.group), ["月度计划", "季度计划"]);
  assert.equal(items.some((item) => item.value.kind === "pager"), false);
});

function plan(overrides: Pick<WorkPlan, "id" | "title" | "periodType">) {
  return {
    targetType: "personal",
    targetId: 2,
    kind: "okr",
    description: "",
    status: "active",
    isArchived: false,
    ownerEmployeeName: "测试用户",
    plannedStartDate: "2026-07-01",
    plannedEndDate: "2026-07-31",
    sourceType: "other",
    itemCount: 0,
    ...overrides,
  } as WorkPlan;
}
