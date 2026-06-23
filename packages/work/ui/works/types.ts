export interface WorkParticipant {
  id: number;
  workItemId: number;
  name: string;
  wxUserId: string | null;
  createdAt: string;
}

export type WorkTargetType = "personal" | "department" | "project";
export type WorkItemCategory = "routine" | "non-routine";
export type WorkItemStatus = "doing" | "done" | "archived";
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
    routine: number;
    nonRoutine: number;
    archived: number;
  };
}

export interface WorkItem {
  id: number;
  targetType: WorkTargetType;
  targetId: number;
  category: WorkItemCategory;
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: WorkItemStatus | null;
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  startDate: string | null;
  dueDate: string | null;
  linkedProjectId: number | null;
  linkedProjectName: string | null;
  linkedProjectCode: string | null;
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
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: WorkItemStatus | null;
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  startDate: string | null;
  dueDate: string | null;
  linkedProjectId: number | null;
  linkedProjectName: string;
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
