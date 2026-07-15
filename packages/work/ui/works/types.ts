export interface WorkParticipant {
  id: number;
  workItemId: number;
  name: string;
  wxUserId: string | null;
  createdAt: string;
}
export type WorkTargetType = "personal" | "company" | "committee" | "department" | "project";
export type WorkItemCategory = "routine" | "non-routine";
export type WorkItemType = "objective" | "key_result" | "task";
export type RoutineTaskType = "standing" | "task";
export type RoutineRecurrenceType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type WorkItemStatus = "active" | "paused" | "done";
export type WorkPeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "half_year" | "yearly";
export type WorkSourceType = "department" | "project" | "meeting" | "other";
export type WorkSourceKind = "project" | "project_phase";
export type WorkOkrStage = "objective_draft" | "objective_submitted" | "executing" | "kr_open" | "kr_submitted" | "closed";
export type WorkPlanKind = "okr" | "routine";
export type WorkPlanAlignmentSourceType = "plan" | "objective" | "key_result";
export type WorkAlignmentRelationKind = "upper" | "external";
export type WorkItemParentPeriodRelationKind = "upper" | "external";

export interface WorkResponsibilityFields {
  responsibilityReferenceId: number | null;
  responsibilityNodeId: number | null;
  responsibilityLabel: string | null;
  responsibilityPathLabel: string | null;
  responsibilityTitle: string | null; responsibilityContent: string | null;
  responsibilityLockedEmployeeId: number | null;
  responsibilityPositionId: number | null; responsibilityPositionName: string | null;
}

export interface WorkTarget {
  targetType: WorkTargetType;
  targetId: number;
}

export interface WorkTaskActionPermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canManagePermissions: boolean;
}

export interface WorkTaskSpace extends WorkTarget {
  name: string;
  subtitle: string | null;
  lifecycleStatus?: "active" | "archived" | "inactive";
  actionPermissions: WorkTaskActionPermissions;
  actionRuntimes: { itemCreate: import("@workspace/platform/workflow-action-runtime").ActionRuntime; itemUpdate: import("@workspace/platform/workflow-action-runtime").ActionRuntime };
  counts: {
    objective: number;
    keyResult: number;
    task: number;
    archived: number;
  };
}

export interface WorkPlan extends WorkTarget {
  id: number;
  kind: WorkPlanKind;
  title: string;
  description: string;
  status: "active" | "done"; isArchived: boolean;
  okrStage: WorkOkrStage; maintenance: WorkPlanMaintenance;
  objectiveSubmittedAt: string | null;
  objectiveApprovedAt: string | null;
  objectiveApprovedByUserId: number | null;
  krReviewOpensAt: string | null;
  krSubmittedAt: string | null;
  krApprovedAt: string | null;
  krApprovedByUserId: number | null;
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null; isSystemGenerated: boolean;
  collaborationId: number | null;
  collaborationTitle: string | null;
  collaborationResponsibleDepartmentId: number | null;
  collaborationResponsibleDepartmentName: string | null;
  okrCycleId: number | null; okrCycleCode: string | null; okrCycleLabel: string | null;
  okrControlScopeType: string | null; okrControlScopeId: string | null;
  sourcePlanId: number | null; sourcePlanTitle: string | null; sourcePlanCycleLabel: string | null;
  parentPeriodPlanId: number | null; parentPeriodPlanTitle: string | null; parentPeriodPlanCycleLabel: string | null;
  alignmentSourceType: WorkPlanAlignmentSourceType | null;
  alignmentSourcePlanId: number | null; alignmentSourcePlanTitle: string | null;
  alignmentSourcePlanTargetType: WorkTargetType | null; alignmentSourcePlanTargetId: number | null; alignmentSourcePlanCycleLabel: string | null;
  alignmentSourceWorkItemId: number | null; alignmentSourceWorkItemContent: string | null;
  alignmentSourceWorkItemTargetType: WorkTargetType | null; alignmentSourceWorkItemTargetId: number | null; alignmentSourceWorkItemCycleLabel: string | null;
  alignmentSourceWorkItemPlanTitle: string | null; alignmentSourceWorkItemKrTargetValue: number | null; alignmentSourceWorkItemKrUnit: string | null;
  previousPeriodPlanId: number | null; previousPeriodPlanTitle: string | null; previousPeriodPlanCycleLabel: string | null;
  objectiveApprovalSnapshotJson: string;
  krApprovalSnapshotJson: string;
  periodType: WorkPeriodType | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  isMilestone: boolean;
  milestoneDate: string | null;
  sourceType: WorkSourceType;
  sourceKind: WorkSourceKind | null;
  sourceMeetingId: number | null;
  sourceMeetingTitle: string | null;
  sourceMeetingStartAt: string | null;
  sourceMeetingDecisionId: number | null;
  sourceMeetingDecisionTitle: string | null;
  sourceMeetingDecisionKind: string | null;
  sourceMeetingActionCandidateId: number | null;
  sourceMeetingActionCandidateTitle: string | null;
  sourceDepartmentId: number | null;
  sourceDepartmentName: string | null;
  sourceDepartmentCode: string | null;
  linkedProjectId: number | null;
  linkedProjectName: string | null;
  linkedProjectCode: string | null;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string | null;
  itemCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkPlanMaintenance = { plan: boolean; objective: boolean; task: boolean; keyResult: boolean };
export interface WorkPlanDraft {
  id: number | null;
  kind: WorkPlanKind;
  title: string;
  description: string;
  status: WorkPlan["status"];
  ownerEmployeeId: number | null;
  ownerEmployeeName: string; isSystemGenerated: boolean;
  collaborationId: number | null;
  collaborationTitle: string;
  okrCycleId: number | null;
  okrCycleLabel: string;
  sourcePlanId: number | null;
  sourcePlanTitle: string;
  sourcePlanCycleLabel: string;
  parentPeriodPlanId: number | null;
  parentPeriodPlanTitle: string;
  parentPeriodPlanCycleLabel: string;
  alignmentSourceType: WorkPlanAlignmentSourceType | null;
  alignmentSourcePlanId: number | null;
  alignmentSourcePlanTitle: string;
  alignmentSourcePlanTargetType: WorkTargetType | null;
  alignmentSourcePlanTargetId: number | null;
  alignmentSourcePlanCycleLabel: string;
  alignmentSourceWorkItemId: number | null;
  alignmentSourceWorkItemContent: string;
  alignmentSourceWorkItemTargetType: WorkTargetType | null;
  alignmentSourceWorkItemTargetId: number | null;
  alignmentSourceWorkItemCycleLabel: string;
  alignmentSourceWorkItemPlanTitle: string;
  alignmentSourceWorkItemKrTargetValue: number | null;
  alignmentSourceWorkItemKrUnit: string;
  alignmentRelationKind: WorkAlignmentRelationKind | null;
  previousPeriodPlanId: number | null;
  previousPeriodPlanTitle: string;
  previousPeriodPlanCycleLabel: string;
  periodType: WorkPeriodType | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  isMilestone: boolean;
  milestoneDate: string | null;
  sourceType: WorkSourceType;
  sourceKind: WorkSourceKind | null;
  sourceMeetingId: number | null;
  sourceMeetingTitle: string;
  sourceMeetingDecisionId: number | null;
  sourceMeetingDecisionTitle: string;
  sourceMeetingActionCandidateId: number | null;
  sourceMeetingActionCandidateTitle: string;
  sourceDepartmentId: number | null;
  sourceDepartmentName: string;
  sourceDepartmentCode: string;
  linkedProjectId: number | null;
  linkedProjectName: string;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string;
  sortOrder: number;
}

export interface WorkItem {
  id: number;
  planId: number | null;
  targetType: WorkTargetType;
  targetId: number;
  category: WorkItemCategory;
  itemType: WorkItemType;
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: WorkItemStatus | null;
  krStartValue: number | null;
  krTargetValue: number | null;
  krCurrentValue: number | null;
  krUnit: string | null;
  routineTaskType: RoutineTaskType | null;
  routineRecurrenceType: RoutineRecurrenceType | null;
  routineRecurrenceTime: string | null;
  routineRecurrenceWeekday: number | null;
  routineRecurrenceMonthDay: number | null;
  routineRecurrenceQuarterDay: number | null;
  routineRecurrenceYearMonth: number | null;
  routineRecurrenceYearDay: number | null;
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  collaborationId: number | null;
  collaborationTitle: string | null;
  collaborationResponsibleDepartmentId: number | null;
  collaborationResponsibleDepartmentName: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  isMilestone: boolean;
  milestoneDate: string | null;
  completedAt: string | null;
  periodType: WorkPeriodType | null;
  periodStart: string | null;
  periodEnd: string | null;
  sourceType: WorkSourceType;
  sourceKind: WorkSourceKind | null;
  sourceMeetingId: number | null;
  sourceMeetingTitle: string | null;
  sourceMeetingStartAt: string | null;
  sourceMeetingDecisionId: number | null;
  sourceMeetingDecisionTitle: string | null;
  sourceMeetingDecisionKind: string | null;
  sourceMeetingActionCandidateId: number | null;
  sourceMeetingActionCandidateTitle: string | null;
  sourceDepartmentId: number | null;
  sourceDepartmentName: string | null;
  sourceDepartmentCode: string | null;
  linkedProjectId: number | null;
  linkedProjectName: string | null;
  linkedProjectCode: string | null;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string | null;
  parentWorkItemId: number | null;
  parentWorkItemContent: string | null;
  parentPeriodWorkItemId: number | null;
  parentPeriodWorkItemContent: string | null;
  parentPeriodWorkItemType: WorkItemType | null;
  parentPeriodWorkItemCycleLabel: string | null;
  parentPeriodWorkItemTargetType: WorkTargetType | null;
  parentPeriodWorkItemTargetId: number | null;
  parentPeriodWorkItemKrTargetValue: number | null;
  parentPeriodWorkItemKrCurrentValue: number | null;
  parentPeriodWorkItemKrUnit: string | null;
  previousPeriodWorkItemId: number | null;
  previousPeriodWorkItemContent: string | null;
  previousPeriodWorkItemCycleLabel: string | null;
  responsibilityReferenceId: number | null;
  responsibilityNodeId: number | null;
  responsibilityLabel: string | null;
  responsibilityPathLabel: string | null;
  responsibilityTitle: string | null;
  responsibilityContent: string | null;
  responsibilityLockedEmployeeId: number | null;
  responsibilityPositionId: number | null;
  responsibilityPositionName: string | null;
  evidenceTaskIds: number[];
  evidenceTasks?: Array<{
    taskWorkItemId: number;
    note: string;
    sortOrder: number;
  }>;
  isArchived: boolean;
  isPrivate: boolean;
  participants: WorkParticipant[];
  sortOrder: number;
  createdAt: string;
}

export interface WorkAssignedPlanGroup { plan: WorkPlan; works: WorkItem[]; assignedWorks: WorkItem[]; assignedWorkIds: number[]; arrangerEmployeeName?: string | null; assignerSpaceName?: string | null }

export interface WorkItemDraft {
  id: number | null;
  planId: number | null;
  category: WorkItemCategory;
  itemType: WorkItemType;
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: WorkItemStatus | null;
  krStartValue: number | null;
  krTargetValue: number | null;
  krCurrentValue: number | null;
  krUnit: string;
  routineTaskType: RoutineTaskType | null;
  routineRecurrenceType: RoutineRecurrenceType | null;
  routineRecurrenceTime: string;
  routineRecurrenceWeekday: number | null;
  routineRecurrenceMonthDay: number | null;
  routineRecurrenceQuarterDay: number | null;
  routineRecurrenceYearMonth: number | null;
  routineRecurrenceYearDay: number | null;
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  collaborationId: number | null;
  collaborationTitle: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  isMilestone: boolean;
  milestoneDate: string | null;
  periodType: WorkPeriodType | null;
  periodStart: string | null;
  periodEnd: string | null;
  sourceType: WorkSourceType;
  sourceKind: WorkSourceKind | null;
  sourceMeetingId: number | null;
  sourceMeetingTitle: string;
  sourceMeetingDecisionId: number | null;
  sourceMeetingDecisionTitle: string;
  sourceMeetingActionCandidateId: number | null;
  sourceMeetingActionCandidateTitle: string;
  sourceDepartmentId: number | null;
  sourceDepartmentName: string;
  sourceDepartmentCode: string;
  linkedProjectId: number | null;
  linkedProjectName: string;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string;
  parentWorkItemId: number | null;
  parentWorkItemContent: string;
  parentPeriodWorkItemId: number | null;
  parentPeriodWorkItemContent: string;
  parentPeriodWorkItemType: WorkItemType | null;
  parentPeriodRelationKind: WorkItemParentPeriodRelationKind | null;
  parentPeriodWorkItemCycleLabel: string;
  previousPeriodWorkItemId: number | null;
  previousPeriodWorkItemContent: string;
  previousPeriodWorkItemCycleLabel: string;
  responsibilityNodeId: number | null;
  responsibilityLabel: string;
  responsibilityPositionId: number | null;
  responsibilityPositionName: string;
  evidenceTaskIds: number[];
  participants: string;
  sortOrder: number;
}

export interface WorkReportPeriod {
  periodType: WorkPeriodType;
  periodStart: string;
  periodEnd: string;
}
export interface WorkReportItem {
  id: number | null;
  workPlanId: number | null;
  workItemId: number | null;
  title: string;
  workPlanTitle: string;
  workPlanKind: WorkPlanKind | null;
  workItemType: WorkItemType | null;
  parentWorkItemId: number | null;
  parentTitle: string;
  objectiveTitleSnapshot: string;
  keyResultTitleSnapshot: string;
  reportItemKind: "assessment" | "current" | "routine" | "next";
  workItemStatusSnapshot: string;
  snapshotPlannedStartDate: string | null;
  snapshotPlannedEndDate: string | null;
  snapshotActualEndDate: string | null;
  snapshotCompletedAt: string | null;
  previousPlanSnapshot: string;
  currentKeyResult: string;
  nextObjective: string;
  note: string;
  selfScore: number | null;
  performanceScore: number | null;
  sortOrder: number;
  source?: "work" | "adHoc" | "stale";
}
export interface WorkReportGroup {
  key: string;
  title: string;
  kind: WorkPlanKind | "routine";
  workPlanId: number | null;
  items: WorkReportItem[];
}

export interface WorkReport {
  id: number;
  targetType: WorkTargetType;
  targetId: number;
  periodType: string;
  reportStage: "kr" | "final";
  periodStart: string;
  periodEnd: string;
  submittedBy: number;
  submitterName: string;
  submittedAt: string | null;
  updatedAt: string;
  items: WorkReportItem[];
  groups: WorkReportGroup[];
}

export interface WorkReportDraftResponse {
  period: WorkReportPeriod;
  reportStage?: "kr" | "final";
  canEdit: boolean;
  actionRuntime: import("@workspace/platform/workflow-action-runtime").ActionRuntime;
  report: WorkReport | null;
  items: WorkReportItem[];
  groups: WorkReportGroup[];
}

export interface WorkReportCollectionSpace extends WorkTarget {
  name: string;
  subtitle: string | null;
  status: "submitted" | "missing";
  reports: WorkReport[];
}
export interface WorkReportCollectionResponse {
  period: WorkReportPeriod;
  spaces: WorkReportCollectionSpace[];
}

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
  updatedAt: string;
}

export type WorkOkrControlRuleAnchor = "periodStart" | "periodEnd";
export type WorkOkrControlAutoLock = "off" | "afterObjectiveDeadline" | "afterKrDeadline";
export type WorkOkrPeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";
export type WorkOkrPeriodTypeRuleMode = "inherit" | "custom" | "disabled" | "report_only";

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
}

export interface WorkOkrControlResponse {
  settings: WorkOkrControlSettings;
  cycles: WorkOkrControlCycleOption[];
  policies: WorkOkrControlPolicy[];
}

export type WorkTaskApprovalStatus = "draft" | "submitted" | "committing" | "withdrawn" | "rejected" | "approved" | "cancelled";
export type WorkTaskApprovalOperation = "create" | "update";

export interface WorkTaskApprovalPayload extends WorkTarget {
  entityType?: "item" | "plan" | "report" | "objective_plan" | "kr_review" | "revision";
  changeTarget?: "okr_plan" | "work_report";
  controlScopeType?: "company" | "committee" | "department" | null;
  controlScopeId?: number | null;
  workId?: number | null;
  planId?: number | null;
  reportId?: number | null;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: "kr" | "final" | null;
  data: Partial<WorkItemDraft & WorkPlanDraft> & {
    items?: WorkReportItem[];
  } & Record<string, unknown>;
}

export interface WorkTaskApprovalEvent {
  id: number;
  sequence: number;
  eventType: string;
  actorUserId: number;
  actorName: string;
  fromStatus: WorkTaskApprovalStatus | null;
  toStatus: WorkTaskApprovalStatus | null;
  comment: string | null;
  payloadSnapshot: WorkTaskApprovalPayload | null;
  createdAt: string;
}

export interface WorkTaskApprovalRequest {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  separationPolicy: "independent_required"  | "auto_pass_if_authorized";
  subjectType: "work.task";
  subjectId: string | null;
  operation: WorkTaskApprovalOperation;
  status: WorkTaskApprovalStatus;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  latestPayload: WorkTaskApprovalPayload;
  submitterUserId: number;
  submitterName: string;
  submittedAt: string | null;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  committedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: WorkTaskApprovalEvent[];
  canProcess?: boolean;
}
