import type { SurfacePickerOptionSpec, ReferenceOption } from "@workspace/core/ui";
import { PROJECT_ROLES } from "@workspace/work/constants";

export type ProjectListFilter = "all" | "普通" | "重点";
export type ProjectType = "company" | "department" | "other";

export type ProjectPermissions = {
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
};

export type ProjectActionPermissions = {
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canRevise: boolean;
};

export type ProjectItem = {
  id: number;
  code: string | null;
  name: string;
  createdBy: number | null;
  permissions: ProjectPermissions;
  actionPermissions: ProjectActionPermissions;
  description: string | null;
  projectType: ProjectType;
  parentProjectTaskId: number | null;
  parentProjectTaskName: string | null;
  parentProjectId: number | null;
  parentProjectCode: string | null;
  parentProjectName: string | null;
  parentProjectTaskStatus: string | null;
  status: string | null;
  projectLevel: string | null;
  plan: string | null;
  goal: string | null;
  milestones: string | null;
  budgetAmount: number | null;
  budgetNote: string | null;
  riskNote: string | null;
  remark: string | null;
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
  leadingDepartmentCode: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  startDate: string | null;
  endDate: string | null;
  completionPercent: number | null;
  employeeCount: number;
  isArchived: boolean;
};

export type ProjectMemberEntry = {
  id: number;
  employeeId: number;
  employeeNumber: string;
  employeeName: string;
  projectId: number;
  projectName: string;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  confirmationStatus?: "pending" | "confirmed";
};

export type ProjectTaskItem = {
  id: number;
  projectId: number;
  planPhaseId: number | null;
  planPhaseName: string | null;
  name: string;
  isMilestone: boolean;
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  description: string;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  startDate: string | null;
  endDate: string | null;
  childProjectId: number | null;
  childProjectCode: string | null;
  childProjectName: string | null;
  childProjectStatus: string | null;
  sourceMeetingDecisionId: number | null;
  sourceMeetingDecisionTitle: string | null;
  sourceMeetingDecisionKind: string | null;
  sourceMeetingActionCandidateId: number | null;
  sourceMeetingActionCandidateTitle: string | null;
  predecessorTaskIds: number[];
  predecessorTaskNames: string[];
  successorTasks: { id: number; name: string }[];
  assignees: ProjectTaskAssignee[];
  sortOrder: number;
};

export type ProjectTaskAssignee = {
  id?: number;
  employeeId: number;
  employeeNumber: string;
  employeeName: string;
  role: string | null;
};

export type ProjectTaskDraft = {
  name: string;
  description: string;
  isMilestone: boolean;
  ownerEmployeeId: number | null;
  ownerEmployeeNumber: string | null;
  ownerEmployeeName: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  startDate: string | null;
  endDate: string | null;
  predecessorTaskIds: number[];
  planPhaseId: number | null;
  assignees: ProjectTaskAssignee[];
  sortOrder: number | null;
};

export type EmployeeTag = {
  id: number;
  employeeNumber: string;
  name: string;
  confirmationStatus?: "pending" | "confirmed";
};

export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type MultiProjectRole = Exclude<ProjectRole, "负责人">;
export const MULTI_PROJECT_ROLES = PROJECT_ROLES.filter((role) => role !== "负责人") as MultiProjectRole[];

export type ProjectDraft = {
  id: number | null;
  code: string | null;
  name: string;
  description: string | null;
  projectType: ProjectType;
  parentProjectTaskId: number | null;
  parentProjectTaskName: string | null;
  parentProjectId: number | null;
  parentProjectCode: string | null;
  parentProjectName: string | null;
  parentProjectTaskStatus: string | null;
  projectLevel: string | null;
  plan: string | null;
  goal: string | null;
  milestones: string | null;
  budgetAmount: number | null;
  budgetNote: string | null;
  riskNote: string | null;
  remark: string | null;
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
  leadingDepartmentCode: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  startDate: string | null;
  endDate: string | null;
  completionPercent: number | null;
  leader: EmployeeTag | null;
  roleGroups: Record<MultiProjectRole, EmployeeTag[]>;
};

export const PROJECT_LIST_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "普通", label: "普通" },
  { value: "重点", label: "重点" },
] satisfies { value: ProjectListFilter; label: string }[];
export const PROJECT_LEVEL_OPTIONS = ["普通", "重点", "特殊"] as const;
export const PROJECT_TYPE_OPTIONS = [
  { value: "company", label: "运营委员会项目" },
  { value: "department", label: "部门项目" },
  { value: "other", label: "其他项目" },
] satisfies { value: ProjectType; label: string }[];
const TASK_MILESTONE_OPTIONS = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
] as const;

function toPickerOptions(values: readonly string[]): SurfacePickerOptionSpec[] {
  return values.map((value) => ({ value, label: value }));
}

export const PROJECT_LEVEL_PICKER_OPTIONS = toPickerOptions(PROJECT_LEVEL_OPTIONS);
export const PROJECT_TYPE_PICKER_OPTIONS = [...PROJECT_TYPE_OPTIONS];
export const PROJECT_MILESTONE_PICKER_OPTIONS = [...TASK_MILESTONE_OPTIONS];

export function createEmptyProjectTaskDraft(sortOrder: number | null = null): ProjectTaskDraft {
  return {
    name: "",
    description: "",
    isMilestone: false,
    ownerEmployeeId: null,
    ownerEmployeeNumber: null,
    ownerEmployeeName: null,
    baselineStartDate: null,
    baselineEndDate: null,
    startDate: null,
    endDate: null,
    predecessorTaskIds: [],
    planPhaseId: null,
    assignees: [],
    sortOrder,
  };
}

export function createProjectTaskDraft(task: ProjectTaskItem): ProjectTaskDraft {
  return {
    name: task.name,
    description: task.description,
    isMilestone: task.isMilestone,
    ownerEmployeeId: task.ownerEmployeeId,
    ownerEmployeeNumber: task.ownerEmployeeNumber,
    ownerEmployeeName: task.ownerEmployeeName,
    baselineStartDate: task.baselineStartDate,
    baselineEndDate: task.baselineEndDate,
    startDate: task.startDate,
    endDate: task.endDate,
    predecessorTaskIds: task.predecessorTaskIds,
    planPhaseId: task.planPhaseId,
    assignees: task.assignees,
    sortOrder: task.sortOrder,
  };
}

export function projectCode(project: ProjectItem | null, draft: ProjectDraft | null) {
  if (project?.code || draft?.code) return project?.code || draft?.code || "";
  if ((project?.projectType || draft?.projectType) === "other") return "无自动编号";
  return "保存后自动生成";
}

export function employeeFromOption(option?: ReferenceOption): EmployeeTag | null {
  if (!option) return null;
  return {
    id: option.id,
    employeeNumber: option.subtitle || "",
    name: option.name,
  };
}

export function memberFromEntry(entry: ProjectMemberEntry): EmployeeTag {
  return {
    id: entry.employeeId,
    employeeNumber: entry.employeeNumber,
    name: entry.employeeName,
    confirmationStatus: entry.confirmationStatus,
  };
}

export function dedupeMembers(members: EmployeeTag[]) {
  const seen = new Set<number>();
  const next: EmployeeTag[] = [];
  for (const member of members) {
    if (!member.id || seen.has(member.id)) continue;
    seen.add(member.id);
    next.push(member);
  }
  return next;
}

export function isLeaderRole(role: string | null | undefined) {
  return role === "负责人" || role === "项目负责人";
}

export function emptyRoleGroups(): Record<MultiProjectRole, EmployeeTag[]> {
  return {
    "执行负责": [],
    "支持协作": [],
    "咨询参与": [],
    "知会": [],
  };
}

export function normalizeProjectRole(role: string | null | undefined): ProjectRole {
  if (isLeaderRole(role)) return "负责人";
  return PROJECT_ROLES.includes(role as ProjectRole) ? role as ProjectRole : "执行负责";
}

export function draftSnapshot(draft: ProjectDraft | null) {
  if (!draft) return "";
  return JSON.stringify({
    id: draft.id,
    name: draft.name.trim(),
    description: draft.description || null,
    projectType: draft.projectType,
    parentProjectTaskId: draft.parentProjectTaskId ?? null,
    projectLevel: draft.projectLevel || "普通",
    plan: draft.plan || null,
    goal: draft.goal || null,
    milestones: draft.milestones || null,
    budgetAmount: draft.budgetAmount ?? null,
    budgetNote: draft.budgetNote || null,
    riskNote: draft.riskNote || null,
    remark: draft.remark || null,
    leadingDepartmentId: draft.leadingDepartmentId ?? null,
    baselineStartDate: draft.baselineStartDate || null,
    baselineEndDate: draft.baselineEndDate || null,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    completionPercent: draft.completionPercent ?? null,
    leaderId: draft.leader?.id ?? null,
    roleGroups: Object.fromEntries(
      MULTI_PROJECT_ROLES.map((role) => [
        role,
        draft.roleGroups[role].map((member) => member.id).sort((a, b) => a - b),
      ]),
    ),
  });
}

export function createProjectDraft(project: ProjectItem | null, entries: ProjectMemberEntry[]): ProjectDraft {
  const leaderEntry = entries.find((entry) => isLeaderRole(entry.role));
  const roleGroups = emptyRoleGroups();
  const leaderId = leaderEntry?.employeeId ?? null;
  for (const entry of entries) {
    const role = normalizeProjectRole(entry.role);
    if (role === "负责人" || entry.employeeId === leaderId) continue;
    roleGroups[role].push(memberFromEntry(entry));
  }
  for (const role of MULTI_PROJECT_ROLES) {
    roleGroups[role] = dedupeMembers(roleGroups[role]);
  }
  return {
    id: project?.id ?? null,
    code: project?.code ?? null,
    name: project?.name ?? "",
    description: project?.description ?? null,
    projectType: project?.projectType ?? "department",
    parentProjectTaskId: project?.parentProjectTaskId ?? null,
    parentProjectTaskName: project?.parentProjectTaskName ?? null,
    parentProjectId: project?.parentProjectId ?? null,
    parentProjectCode: project?.parentProjectCode ?? null,
    parentProjectName: project?.parentProjectName ?? null,
    parentProjectTaskStatus: project?.parentProjectTaskStatus ?? null,
    projectLevel: project?.projectLevel ?? "普通",
    plan: project?.plan ?? null,
    goal: project?.goal ?? null,
    milestones: project?.milestones ?? null,
    budgetAmount: project?.budgetAmount ?? null,
    budgetNote: project?.budgetNote ?? null,
    riskNote: project?.riskNote ?? null,
    remark: project?.remark ?? null,
    leadingDepartmentId: project?.leadingDepartmentId ?? null,
    leadingDepartmentName: project?.leadingDepartmentName ?? null,
    leadingDepartmentCode: project?.leadingDepartmentCode ?? null,
    baselineStartDate: project?.baselineStartDate ?? null,
    baselineEndDate: project?.baselineEndDate ?? null,
    startDate: project?.startDate ?? null,
    endDate: project?.endDate ?? null,
    completionPercent: project?.completionPercent ?? null,
    leader: leaderEntry ? memberFromEntry(leaderEntry) : null,
    roleGroups,
  };
}

export function createEmptyProjectDraft(): ProjectDraft {
  return {
    id: null,
    code: null,
    name: "",
    description: null,
    projectType: "department",
    parentProjectTaskId: null,
    parentProjectTaskName: null,
    parentProjectId: null,
    parentProjectCode: null,
    parentProjectName: null,
    parentProjectTaskStatus: null,
    projectLevel: "普通",
    plan: null,
    goal: null,
    milestones: null,
    budgetAmount: null,
    budgetNote: null,
    riskNote: null,
    remark: null,
    leadingDepartmentId: null,
    leadingDepartmentName: null,
    leadingDepartmentCode: null,
    baselineStartDate: null,
    baselineEndDate: null,
    startDate: todayDateString(),
    endDate: null,
    completionPercent: null,
    leader: null,
    roleGroups: emptyRoleGroups(),
  };
}

export function todayDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
