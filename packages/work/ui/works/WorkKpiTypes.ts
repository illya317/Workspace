export type WorkKpiDirection = "higher_is_better" | "lower_is_better" | "target_range";
export type WorkKpiDefinitionStatus = "draft" | "active" | "retired";
export type WorkKpiDisplayType = "number" | "percent" | "currency" | "count";

export type WorkKpiScoringRule = {
  kind: "linear";
  targetScore: number;
  floorScore: number;
  capScore: number;
};

export interface WorkKpiDefinition {
  id: number;
  code: string;
  version: number;
  status: WorkKpiDefinitionStatus;
  name: string;
  description: string;
  valueType: "number";
  displayType: WorkKpiDisplayType;
  unit: string;
  direction: WorkKpiDirection;
  scoringRule: WorkKpiScoringRule;
  measurementMode: "manual";
  ownerDepartmentId: number;
  ownerDepartmentCode: string;
  ownerDepartmentName: string;
  referenceCount: number;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkKpiAssignment {
  id: number;
  version: number;
  workPlanId: number;
  definitionId: number;
  definition: WorkKpiDefinition;
  workItemId: number;
  workItemContent: string;
  objectiveWorkItemId: number | null;
  workItemStatus: string | null;
  ownerEmployeeId: number;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  sourceAssignmentId: number | null;
  relationKind: "direct" | "decompose";
  weight: number;
  baselineValue: number | null;
  targetValue: number | null;
  targetLowerBound: number | null;
  targetUpperBound: number | null;
  currentValue: number | null;
  scoringRule: WorkKpiScoringRule;
  evidence: Array<{ taskId: number; content: string; status: string | null; completedAt: string | null; updatedAt: string; note: string }>;
  latestResult: { id: number; version: number; actualValue: number; scoreBeforeAdjustment: number; confirmedScore: number; adjustmentReason: string; approvedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkKpiScorecard {
  plan: {
    id: number;
    title: string;
    targetType: string;
    targetId: number;
    okrCycleId: number | null;
    okrStage: string;
    status: string;
    governanceRevision: number;
  };
  assignments: WorkKpiAssignment[];
  totalWeight: number;
}

export type WorkKpiScorecardEntry = {
  localKey: string;
  id: number | null;
  version: number | null;
  definitionId: number | null;
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  objectiveWorkItemId: number | null;
  sourceAssignmentId: number | null;
  relationKind: "direct" | "decompose";
  weight: number | null;
  baselineValue: number | null;
  targetValue: number | null;
  targetLowerBound: number | null;
  targetUpperBound: number | null;
  currentValue: number | null;
  scoringRule: WorkKpiScoringRule | null;
  latestResult: WorkKpiAssignment["latestResult"];
};

export interface WorkKpiResultPreview {
  assignmentId: number;
  weight: number;
  actualValue: number;
  calculatedScore: number;
  definitionSnapshot: Record<string, unknown>;
  assignmentSnapshot: Record<string, unknown>;
  scoringRule: WorkKpiScoringRule;
  evidence: Record<string, unknown>;
}

export interface WorkKpiResultsResponse {
  results: WorkKpiResultPreview[];
  weightedScore: number;
  workReport: { id: number; periodType: string; periodStart: string; periodEnd: string; submittedAt: string | null } | null;
}

export interface WorkKpiDefinitionDraft {
  id: number | null;
  code: string;
  status: WorkKpiDefinitionStatus;
  name: string;
  description: string;
  displayType: WorkKpiDisplayType;
  unit: string;
  direction: WorkKpiDirection;
  ownerDepartmentId: number | null;
  ownerDepartmentName: string;
  scoringRule: WorkKpiScoringRule;
}
