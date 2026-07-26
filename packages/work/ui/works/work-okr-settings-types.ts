import type { WorkReportingSettings } from "@workspace/platform/work-reporting-policy";

export type {
  WorkReportingPeriodSettings,
  WorkReportingPolicy,
  WorkReportingSettings,
} from "@workspace/platform/work-reporting-policy";

export type WorkOkrControlRuleAnchor = "periodStart" | "periodEnd";
export type WorkOkrControlAutoLock = "off" | "afterObjectiveDeadline" | "afterKrDeadline";
export type WorkOkrPeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";
export type WorkOkrPeriodTypeRuleMode = "inherit" | "custom" | "disabled" | "report_only";

export interface WorkOkrControlCycleOption {
  id: number;
  name: string;
  periodType: WorkOkrPeriodType;
  startDate: string;
  endDate: string;
  subtitle?: string;
  lifecycleStatus: "active";
}

export interface WorkOkrControlPolicy {
  id: number;
  cycleId: number;
  scopeType: "global" | "company" | "committee" | "department";
  scopeId: string;
  isLocked: boolean;
  objectiveSubmitDeadline: string | null;
  krReviewOpensAt: string | null;
  krSubmitDeadline: string | null;
  version: number;
  updatedAt: string;
}

export interface WorkOkrWorkflowActionState {
  businessActionKey: string;
  targetType: "department" | "personal";
  kind: "objective_submit" | "objective_revise" | "report_submit" | "report_correct";
  label: string;
  enabled: boolean;
  mode: "direct" | "optional" | "required" | "permission_only";
  policyId: number | null;
  policyVersion: number | null;
  actionContractVersion: number | null;
  whenDisabled: "direct_write" | "unavailable";
}

export interface WorkOkrControlRule {
  anchor: WorkOkrControlRuleAnchor;
  offsetDays: number;
}

export interface WorkOkrPeriodTypeRule {
  mode: WorkOkrPeriodTypeRuleMode;
  objectiveOpensAt?: WorkOkrControlRule;
  objectiveSubmitDeadline?: WorkOkrControlRule;
  krReviewOpensAt?: WorkOkrControlRule;
  krSubmitDeadline?: WorkOkrControlRule;
}

export interface WorkOkrControlSettings {
  enabled: boolean;
  objectiveOpensAt: WorkOkrControlRule;
  objectiveSubmitDeadline: WorkOkrControlRule;
  krReviewOpensAt: WorkOkrControlRule;
  krSubmitDeadline: WorkOkrControlRule;
  autoLock: WorkOkrControlAutoLock;
  periodTypes: Record<WorkOkrPeriodType, WorkOkrPeriodTypeRule>;
  reporting: WorkReportingSettings;
}

export interface WorkOkrControlResponse {
  settings: WorkOkrControlSettings;
  settingsVersion: number;
  workflowActions: WorkOkrWorkflowActionState[];
  governance: {
    groups: Array<{ mode: string; source: string; count: number }>;
    inFlightRequests: number;
  };
  cycles: WorkOkrControlCycleOption[];
  policies: WorkOkrControlPolicy[];
}
