import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import type { WorkReportCollectionStatus } from "@workspace/platform/work-reporting-policy";

export type PerfTab = "attendance" | "works" | "performance";
export type PerformanceAudience = "personal" | "department" | "project";
export type PerformancePeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";

export type CycleOption = {
  id: number;
  label: string;
  code: string;
  periodType: PerformancePeriodType;
  startDate: string;
  endDate: string;
};

export type AudienceOption = {
  id: number;
  name: string;
  details?: string;
};

export type DepartmentContributionRow = {
  id: number;
  code: string;
  name: string;
  hierarchy: string;
  parentName: string;
  status: string;
  reporting: ReportCollectionEntry | null;
};

export type ProjectContributionRow = {
  id: number;
  code: string;
  name: string;
  projectType: string;
  projectLevel: string;
  leadingDepartment: string;
  status: string;
  reporting: ReportCollectionEntry | null;
};

export type AttendanceRow = {
  id: number;
  employeeId: string;
  name: string;
  company: string;
  department: string;
  position: string;
  attendanceType: string;
  personnelType: string;
  joinDate: string;
  status: string;
};

export type ReportCollectionEntry = {
  status: WorkReportCollectionStatus;
  deadline: string | null;
  submittedAt: string | null;
};

export type PersonalContributionRow = AttendanceRow & {
  reporting: ReportCollectionEntry | null;
};

export type ContributionRow = {
  id: string;
  employeeId: number;
  employeeName: string;
  sourceKind: "work_item";
  contributionType: string;
  contributionRole: "owner" | "participant";
  roleLabel: string;
  sourceSpace: string;
  title: string;
  relation: string;
  status: string;
  actualEndDate: string | null;
  evidenceCount: number;
  referenceLabel: string;
};

export type ReviewRow = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  okrCycleId: number;
  selfScore: number | null;
  managerScore: number | null;
  finalScore: number;
  finalGrade: string;
  archivedAt: string;
};

export type SubmissionRow = {
  id: number;
  status: string;
  employeeId: number;
  okrCycleId: number;
  selfScore: number | null;
  managerScore: number | null;
  managerComment: string;
  finalScore: number | null;
  finalGrade: string;
  hrComment: string;
  selfComment: string;
  activeWorkflowNodeKey: string | null;
  submitterName: string;
  canProcess: boolean;
  actionRuntime: ActionRuntime;
  version: number;
  updatedAt: string;
};

export type DashboardData = {
  createRuntime: ActionRuntime;
  currentEmployee: { id: number; employeeId: string; name: string } | null;
  cycleOptions: CycleOption[];
  activeCycleId: number | null;
  audienceOptions: Record<PerformanceAudience, AudienceOption[]>;
  contributionDirectories: {
    personal: PersonalContributionRow[];
    department: DepartmentContributionRow[];
    project: ProjectContributionRow[];
  };
  reportingSummary: {
    applicable: boolean;
    total: number;
    submittedOnTime: number;
    submittedLate: number;
    overdueMissing: number;
  };
  attendanceRows: AttendanceRow[];
  contributionRows: ContributionRow[];
  reviewRows: ReviewRow[];
  submissionRows: SubmissionRow[];
  metrics: {
    activeEmployeeCount: number;
    workPlanCount: number;
    contributionCount: number;
    reviewCount: number;
    submittedFlowCount: number;
    draftFlowCount: number;
  };
};

export type ReviewDraft = {
  selfScore: string;
  selfComment: string;
  managerScore: string;
  managerComment: string;
  finalScore: string;
  finalGrade: string;
  hrComment: string;
  comment: string;
};

export type ReviewEditorStage = "none" | "self" | "manager" | "hr";
export type SubmissionAction = "submit" | "resubmit" | "withdraw" | "cancel" | "approve" | "reject";
