"use client";

import { useEffect, useMemo, useState } from "react";
import type { SurfaceToolbarItem } from "@workspace/core/ui";
import { sameTarget } from "./works-client-helpers";
import { workSpaceKey } from "./WorkSpaceSidebar";
import type { WorkPlan, WorkTaskSpace } from "./types";
import {
  DEFAULT_WORK_PLAN_PAGE_SIZE,
  normalizeWorkPlanPageSize,
  WORK_PLAN_PAGE_SIZE_OPTIONS,
} from "./work-plan-pagination";

export function useWorkPlanPagination(activePlan: WorkPlan | null, plans: WorkPlan[]) {
  const [planPageSize, setPlanPageSize] = useState(DEFAULT_WORK_PLAN_PAGE_SIZE);
  const [planPageBySpace, setPlanPageBySpace] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    if (!activePlan) return;
    const planIndex = plans.filter((plan) => sameTarget(plan, activePlan)).findIndex((plan) => plan.id === activePlan.id);
    if (planIndex < 0) return;
    const page = Math.floor(planIndex / normalizeWorkPlanPageSize(planPageSize));
    setPlanPageBySpace((current) => new Map(current).set(workSpaceKey(activePlan), page));
  }, [activePlan, plans, planPageSize]);

  const toolbarItem = useMemo<SurfaceToolbarItem>(() => ({
    kind: "page-size",
    key: "plan-page-size",
    label: "工作计划",
    value: String(planPageSize),
    options: WORK_PLAN_PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size}条/页` })),
    onChange: (value: string) => {
      setPlanPageSize(normalizeWorkPlanPageSize(value));
      setPlanPageBySpace(new Map());
    },
  }), [planPageSize]);

  function setPlanPage(space: WorkTaskSpace, page: number) {
    setPlanPageBySpace((current) => new Map(current).set(workSpaceKey(space), Math.max(0, page)));
  }

  return { planPageSize, planPageBySpace, setPlanPage, toolbarItem };
}
