import type { WorkItem, WorkOkrPeriodType, WorkPlan } from "./types";

export interface WorkPeriodCollectionCycle {
  id: number;
  code: string;
  label: string;
  periodType: WorkOkrPeriodType;
  startDate: string;
  endDate: string;
  workdayOverlapCount: number;
}

export interface WorkPeriodCollectionPlan {
  plan: WorkPlan;
  overlapCycleIds: number[];
}

export interface WorkPeriodCollectionItem {
  item: WorkItem;
  planId: number | null;
  planTitle: string | null;
  planCycleId: number | null;
  planCycleLabel: string | null;
  overlapCycleIds: number[];
}

export interface WorkPeriodCollectionResponse {
  rootCycle: WorkPeriodCollectionCycle;
  displayPeriodType: WorkOkrPeriodType | null;
  cycles: WorkPeriodCollectionCycle[];
  plans: WorkPeriodCollectionPlan[];
  items: WorkPeriodCollectionItem[];
}
