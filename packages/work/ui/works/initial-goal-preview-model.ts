import type { WorkItem, WorkPlan, WorkTarget } from "./types";

export type InitialGoalCycleKey = "q1" | "h1" | "q3" | "year";
export type InitialGoalAlignedKind = "department" | "project" | "collaboration";

export type InitialGoalCycle = {
  key: InitialGoalCycleKey;
  label: string;
  start: string;
  end: string;
};

export type InitialGoalSource = {
  kind: InitialGoalAlignedKind;
  badgeLabel: string;
  badgeTone: "blue" | "green" | "amber";
  summary: string;
};

export type InitialGoalPreviewModel = {
  routineWorks: WorkItem[];
  objectiveWorks: WorkItem[];
  alignedWorks: Record<InitialGoalAlignedKind, WorkItem[]>;
  sourceByWorkId: ReadonlyMap<number, InitialGoalSource>;
};

export function createInitialGoalCycles(year: number): InitialGoalCycle[] {
  return [
    { key: "q1", label: "Q1", start: `${year}-01-01`, end: `${year}-03-31` },
    { key: "h1", label: "H1", start: `${year}-01-01`, end: `${year}-06-30` },
    { key: "q3", label: "Q3", start: `${year}-07-01`, end: `${year}-09-30` },
    { key: "year", label: String(year), start: `${year}-01-01`, end: `${year}-12-31` },
  ];
}

export function defaultInitialGoalCycleKey(date = new Date()): InitialGoalCycleKey {
  const month = date.getMonth() + 1;
  if (month <= 3) return "q1";
  if (month <= 6) return "h1";
  if (month <= 9) return "q3";
  return "year";
}

export function createInitialGoalPreviewModel(input: {
  target: WorkTarget;
  plans: WorkPlan[];
  works: WorkItem[];
  cycle: InitialGoalCycle;
}): InitialGoalPreviewModel {
  const { target, plans, works, cycle } = input;
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const workById = new Map(works.map((work) => [work.id, work]));
  const routinePlanIds = new Set(plans.filter((plan) => plan.kind === "routine").map((plan) => plan.id));
  const cyclePlanIds = new Set(plans.filter((plan) => plan.kind === "okr" && planMatchesCycle(plan, cycle)).map((plan) => plan.id));
  const routineWorks = works.filter((work) => work.planId !== null && routinePlanIds.has(work.planId));
  const cycleWorks = works.filter((work) => work.planId !== null && cyclePlanIds.has(work.planId));
  const sourceByWorkId = new Map<number, InitialGoalSource>();

  function sourceForWork(work: WorkItem, visiting = new Set<number>()): InitialGoalSource | null {
    const existing = sourceByWorkId.get(work.id);
    if (existing) return existing;
    if (visiting.has(work.id)) return null;
    visiting.add(work.id);
    const plan = work.planId ? planById.get(work.planId) : undefined;
    const direct = directSource(work, plan, target);
    const parent = work.parentWorkItemId ? workById.get(work.parentWorkItemId) : undefined;
    const inherited = direct ?? (parent ? sourceForWork(parent, visiting) : null);
    if (inherited) sourceByWorkId.set(work.id, inherited);
    return inherited;
  }

  for (const work of works) sourceForWork(work);
  const classifiedWorks = cycleWorks
    .filter((work) => work.itemType !== "task")
    .map((work) => ({ work, source: sourceForWork(work) }));
  const objectiveWorks = classifiedWorks.filter((entry) => !entry.source).map((entry) => entry.work);
  const alignedWorks: InitialGoalPreviewModel["alignedWorks"] = {
    department: classifiedWorks.filter((entry) => entry.source?.kind === "department").map((entry) => entry.work),
    project: classifiedWorks.filter((entry) => entry.source?.kind === "project").map((entry) => entry.work),
    collaboration: classifiedWorks.filter((entry) => entry.source?.kind === "collaboration").map((entry) => entry.work),
  };
  return { routineWorks, objectiveWorks, alignedWorks, sourceByWorkId };
}

function planMatchesCycle(plan: WorkPlan, cycle: InitialGoalCycle) {
  const start = dateOnly(plan.plannedStartDate);
  const end = dateOnly(plan.plannedEndDate);
  return start === cycle.start && end === cycle.end;
}

function directSource(work: WorkItem, plan: WorkPlan | undefined, target: WorkTarget): InitialGoalSource | null {
  const parentCrossesTarget = targetDiffers(work.parentPeriodWorkItemTargetType, work.parentPeriodWorkItemTargetId, target);
  const planSourceType = plan?.alignmentSourceWorkItemTargetType ?? plan?.alignmentSourcePlanTargetType;
  const planSourceId = plan?.alignmentSourceWorkItemTargetId ?? plan?.alignmentSourcePlanTargetId;
  const planCrossesTarget = targetDiffers(planSourceType, planSourceId, target);
  if (work.linkedProjectId || plan?.linkedProjectId || planSourceType === "project") return projectSource(work, plan);
  if (work.sourceDepartmentId || plan?.sourceDepartmentId || planSourceType === "department") return departmentSource(work, plan);
  if (!parentCrossesTarget && !planCrossesTarget) return null;
  return collaborationSource(work, plan);
}

function departmentSource(work: WorkItem, plan: WorkPlan | undefined): InitialGoalSource {
  const name = work.sourceDepartmentName ?? plan?.sourceDepartmentName ?? "外部部门";
  return source("department", "部门", "blue", `对齐到：${sourceSummary(name, work, plan)}`);
}

function projectSource(work: WorkItem, plan: WorkPlan | undefined): InitialGoalSource {
  const code = work.linkedProjectCode ?? plan?.linkedProjectCode;
  const name = work.linkedProjectName ?? plan?.linkedProjectName ?? "外部项目";
  return source("project", "项目", "green", `项目：${[code, name].filter(Boolean).join(" · ")}`);
}

function collaborationSource(work: WorkItem, plan: WorkPlan | undefined): InitialGoalSource {
  return source("collaboration", "协作", "amber", `协作：${sourceSummary("外部协作", work, plan)}`);
}

function sourceSummary(prefix: string, work: WorkItem, plan: WorkPlan | undefined) {
  const cycle = work.parentPeriodWorkItemCycleLabel
    ?? plan?.alignmentSourceWorkItemCycleLabel
    ?? plan?.alignmentSourcePlanCycleLabel;
  const title = work.parentPeriodWorkItemContent
    ?? plan?.alignmentSourceWorkItemContent
    ?? plan?.alignmentSourcePlanTitle;
  return [prefix, cycle, title].filter(Boolean).join(" · ");
}

function source(kind: InitialGoalAlignedKind, badgeLabel: string, badgeTone: InitialGoalSource["badgeTone"], summary: string): InitialGoalSource {
  return { kind, badgeLabel, badgeTone, summary };
}

function targetDiffers(sourceType: WorkTarget["targetType"] | null | undefined, sourceId: number | null | undefined, target: WorkTarget) {
  return Boolean(sourceType && sourceId !== null && sourceId !== undefined && (sourceType !== target.targetType || sourceId !== target.targetId));
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}
