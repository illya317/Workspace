"use client";

import { useEffect, useMemo, useState } from "react";
import type { SurfaceToolbarItem } from "@workspace/core/ui";
import { sameTarget } from "./works-client-helpers";
import { workSpaceKey } from "./WorkSpaceSidebar";
import type { WorkPlan, WorkTaskSpace } from "./types";

const PLAN_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function useWorkPlanPagination(activePlan: WorkPlan | null, plans: WorkPlan[]) {
  const [planPageSize, setPlanPageSize] = useState(50);
  const [planPageBySpace, setPlanPageBySpace] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    if (!activePlan) return;
    const page = Math.floor(plans.filter((plan) => sameTarget(plan, activePlan)).findIndex((plan) => plan.id === activePlan.id) / planPageSize);
    if (page < 0) return;
    setPlanPageBySpace((current) => new Map(current).set(workSpaceKey(activePlan), page));
  }, [activePlan, plans, planPageSize]);

  const toolbarItem = useMemo<SurfaceToolbarItem>(() => ({
    kind: "page-size",
    key: "plan-page-size",
    label: "OKR 计划",
    value: String(planPageSize),
    options: PLAN_PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size}条/页` })),
    onChange: (value: string) => {
      setPlanPageSize(Number(value));
      setPlanPageBySpace(new Map());
    },
  }), [planPageSize]);

  function setPlanPage(space: WorkTaskSpace, page: number) {
    setPlanPageBySpace((current) => new Map(current).set(workSpaceKey(space), Math.max(0, page)));
  }

  return { planPageSize, planPageBySpace, setPlanPage, toolbarItem };
}
