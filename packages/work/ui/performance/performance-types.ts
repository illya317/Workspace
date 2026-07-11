export type PerfTab = "attendance" | "works" | "performance";

export type CycleOption = {
  id: number;
  label: string;
  code: string;
  periodType: string;
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
  finalScore: number | null;
  finalGrade: string;
  activeWorkflowNodeKey: string | null;
  submitterName: string;
  canProcess: boolean;
  version: number;
  updatedAt: string;
};

export type DashboardData = {
  currentEmployee: { id: number; employeeId: string; name: string } | null;
  cycleOptions: CycleOption[];
  activeCycleId: number | null;
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
