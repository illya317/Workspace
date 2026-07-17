export type PlanItemKind = "project" | "task";

export type ProjectPlanPermission = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
};

export type ProjectPlanPhaseItem = {
  id: number;
  version: number;
  projectId: number;
  sequenceNo: number;
  name: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  note: string | null;
};

export type ProjectPlanItem = {
  kind: PlanItemKind;
  id: number;
  name: string;
  parentKind: PlanItemKind | null;
  parentId: number | null;
  phaseId: number | null;
  status: string | null;
  projectLevel: string | null;
  isMilestone: boolean;
  ownerNames: string[];
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
};

export type ProjectPlanDependency = {
  id?: number;
  predecessorKind: PlanItemKind;
  predecessorId: number;
  successorKind: PlanItemKind;
  successorId: number;
  dependencyType?: string;
  lagDays: number;
};

export type ProjectPlanBaselineItem = {
  id: number;
  itemKind: PlanItemKind | "phase";
  itemId: number;
  parentKind: PlanItemKind | null;
  parentId: number | null;
  phaseId: number | null;
  name: string;
  status: string | null;
  isMilestone: boolean;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
};

export type ProjectPlanBaseline = {
  id: number;
  name: string;
  note: string | null;
  createdAt: string;
  items: ProjectPlanBaselineItem[];
};

export type ProjectPlanGanttData = {
  projectId: number;
  permissions: ProjectPlanPermission;
  phases: ProjectPlanPhaseItem[];
  items: ProjectPlanItem[];
  dependencies: ProjectPlanDependency[];
  activeBaseline: ProjectPlanBaseline | null;
};

export type ProjectPlanBaselineSummary = {
  id: number;
  name: string;
  note: string | null;
  isActive: boolean;
  createdAt: string;
};

export function planItemKey(kind: PlanItemKind, id: number) {
  return `${kind}:${id}`;
}
