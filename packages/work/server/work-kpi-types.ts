export const WORK_KPI_DIRECTIONS = [
  "higher_is_better",
  "lower_is_better",
  "target_range",
] as const;

export type WorkKpiDirection = typeof WORK_KPI_DIRECTIONS[number];
export type WorkKpiDisplayType = "number" | "percent" | "currency" | "count";
export type WorkKpiDefinitionStatus = "draft" | "active" | "retired";

export type WorkKpiLinearScoringRule = {
  kind: "linear";
  targetScore: number;
  floorScore: number;
  capScore: number;
};

export type WorkKpiScoringRule = WorkKpiLinearScoringRule;

export type WorkKpiScorecardEntryInput = {
  id?: number | null;
  version?: number | null;
  definitionId: number;
  ownerEmployeeId: number;
  objectiveWorkItemId?: number | null;
  sourceAssignmentId?: number | null;
  relationKind?: "direct" | "decompose";
  weight: number;
  baselineValue?: number | null;
  targetValue?: number | null;
  targetLowerBound?: number | null;
  targetUpperBound?: number | null;
  scoringRule?: WorkKpiScoringRule | null;
};

export type WorkKpiMeasurementInput = {
  assignmentId: number;
  version: number;
  currentValue: number;
};

export type WorkKpiResultAdjustmentInput = {
  assignmentId: number;
  confirmedScore?: number | null;
  adjustmentReason?: string | null;
};
