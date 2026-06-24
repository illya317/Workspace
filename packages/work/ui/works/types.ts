export interface WorkParticipant {
  id: number;
  workItemId: number;
  name: string;
  wxUserId: string | null;
  createdAt: string;
}

export type WorkTargetType = "personal" | "company" | "department" | "project";
export type WorkItemCategory = "routine" | "non-routine";
export type WorkItemType = "objective" | "key_result" | "task";
export type WorkItemStatus = "doing" | "done" | "archived";
export type WorkPeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type WorkSourceType = "manual" | "routine" | "project" | "meeting" | "import";
export type WorkSourceKind = "project" | "project_phase" | "project_task";
export type WorkSpaceRole = "viewer" | "editor" | "delete" | "manager";

export interface WorkTarget {
  targetType: WorkTargetType;
  targetId: number;
}

export interface WorkTaskSpace extends WorkTarget {
  name: string;
  subtitle: string | null;
  role: WorkSpaceRole;
  counts: {
    objective: number;
    keyResult: number;
    task: number;
    archived: number;
  };
}

export interface WorkItem {
  id: number;
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
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  startDate: string | null;
  dueDate: string | null;
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
  linkedProjectId: number | null;
  linkedProjectName: string | null;
  linkedProjectCode: string | null;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string | null;
  linkedProjectTaskId: number | null;
  linkedProjectTaskName: string | null;
  parentWorkItemId: number | null;
  parentWorkItemContent: string | null;
  isArchived: boolean;
  isPrivate: boolean;
  participants: WorkParticipant[];
  sortOrder: number;
  createdAt: string;
}

export interface WorkItemDraft {
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
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  startDate: string | null;
  dueDate: string | null;
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
  linkedProjectId: number | null;
  linkedProjectName: string;
  linkedProjectPhaseId: number | null;
  linkedProjectPhaseName: string;
  linkedProjectTaskId: number | null;
  linkedProjectTaskName: string;
  parentWorkItemId: number | null;
  parentWorkItemContent: string;
  participants: string;
  sortOrder: number;
}

export interface WorkSpacePermissionRow {
  userId: number;
  userName: string;
  role: WorkSpaceRole;
  kind: "task";
  source: "natural" | "explicit";
  locked: boolean;
}

export interface WorkReportPeriod {
  periodType: "weekly";
  periodStart: string;
  periodEnd: string;
}

export interface WorkReportItem {
  id: number | null;
  workItemId: number | null;
  title: string;
  previousPlanSnapshot: string;
  doneThisWeek: string;
  planNextWeek: string;
  sortOrder: number;
  source?: "work" | "adHoc" | "stale";
}

export interface WorkReport {
  id: number;
  targetType: WorkTargetType;
  targetId: number;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  submittedBy: number;
  submitterName: string;
  submittedAt: string | null;
  updatedAt: string;
  items: WorkReportItem[];
}

export interface WorkReportDraftResponse {
  period: WorkReportPeriod;
  canEdit: boolean;
  report: WorkReport | null;
  items: WorkReportItem[];
}

export interface WorkReportCollectionSpace extends WorkTarget {
  name: string;
  subtitle: string | null;
  role: WorkSpaceRole;
  status: "submitted" | "missing";
  reports: WorkReport[];
}

export interface WorkReportCollectionResponse {
  period: WorkReportPeriod;
  spaces: WorkReportCollectionSpace[];
}
