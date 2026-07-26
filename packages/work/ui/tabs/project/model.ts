import type { SurfaceOptionSpec, ReferenceOption } from "@workspace/core/ui";
import { PROJECT_ROLES } from "@workspace/work/constants";

export type ProjectListFilter = "全部" | "普通" | "重点" | "特殊";
export type ProjectType = "company" | "department" | "other";

export type ProjectPermissions = {
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
};

export type ProjectActionPermissions = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
};

export type ProjectSpaceTargetType = "personal" | "company" | "committee" | "department";

export type ProjectSpace = {
  targetType: ProjectSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  isOperatingCommittee: boolean;
  role: string;
  actionPermissions: {
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canRevise: boolean;
    canManagePermissions: boolean;
  };
};

export type ProjectItem = {
  id: number;
  version: number;
  code: string | null;
  name: string;
  createdBy: number | null;
  permissions: ProjectPermissions;
  actionPermissions: ProjectActionPermissions;
  description: string | null;
  projectType: ProjectType;
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
  enablingDepartments: DepartmentTag[];
  enablingDepartmentIds: number[];
  workspaceEnabled: boolean;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  completionPercent: number | null;
  employeeCount: number;
  isArchived: boolean;
};

export type ProjectMemberEntry = {
  id: number;
  version: number;
  employeeId: number;
  employeeNumber: string;
  employeeName: string;
  projectId: number;
  projectName: string;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  confirmationStatus?: "pending" | "confirmed";
  membershipUid: string;
  sequence: number;
  recordState: "confirmed" | "cancelled" | "superseded" | "voided";
  temporalState: "past" | "current" | "upcoming" | "invalid";
};

export type EmployeeTag = {
  id: number;
  employeeNumber: string;
  name: string;
  confirmationStatus?: "pending" | "confirmed";
};

export type DepartmentTag = {
  id: number;
  name: string;
  code: string | null;
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
  enablingDepartments: DepartmentTag[];
  enablingDepartmentIds: number[];
  workspaceEnabled: boolean;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  completionPercent: number | null;
  leader: EmployeeTag | null;
  roleGroups: Record<MultiProjectRole, EmployeeTag[]>;
};

export const PROJECT_LIST_FILTER_OPTIONS = [
  { value: "全部", label: "全部" },
  { value: "普通", label: "普通" },
  { value: "重点", label: "重点" },
  { value: "特殊", label: "特殊" },
] satisfies { value: ProjectListFilter; label: string }[];
export const PROJECT_LEVEL_OPTIONS = ["普通", "重点", "特殊"] as const;
export const PROJECT_TYPE_OPTIONS = [
  { value: "company", label: "公司项目" },
  { value: "department", label: "部门项目" },
  { value: "other", label: "其他项目" },
] satisfies { value: ProjectType; label: string }[];
function toOptionSpecs(values: readonly string[]): SurfaceOptionSpec[] {
  return values.map((value) => ({ value, label: value }));
}

export const PROJECT_LEVEL_OPTION_SPECS = toOptionSpecs(PROJECT_LEVEL_OPTIONS);
export const PROJECT_TYPE_PICKER_OPTIONS = [...PROJECT_TYPE_OPTIONS];

export function projectCode(project: ProjectItem | null, draft: ProjectDraft | null) {
  if (project?.code || draft?.code) return project?.code || draft?.code || "";
  void draft;
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

export function departmentFromOption(option?: ReferenceOption): DepartmentTag | null {
  if (!option) return null;
  return {
    id: option.id,
    name: option.name,
    code: option.subtitle ?? null,
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

export function dedupeDepartments(departments: DepartmentTag[]) {
  const seen = new Set<number>();
  const next: DepartmentTag[] = [];
  for (const department of departments) {
    if (!department.id || seen.has(department.id)) continue;
    seen.add(department.id);
    next.push(department);
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
    projectLevel: draft.projectLevel || "普通",
    plan: draft.plan || null,
    goal: draft.goal || null,
    milestones: draft.milestones || null,
    budgetAmount: draft.budgetAmount ?? null,
    budgetNote: draft.budgetNote || null,
    riskNote: draft.riskNote || null,
    remark: draft.remark || null,
    enablingDepartmentIds: draft.enablingDepartments.map((department) => department.id).sort((a, b) => a - b),
    leadingDepartmentId: draft.leadingDepartmentId ?? null,
    workspaceEnabled: draft.workspaceEnabled,
    status: draft.status,
    plannedStartDate: draft.plannedStartDate || null,
    plannedEndDate: draft.plannedEndDate || null,
    actualStartDate: draft.actualStartDate || null,
    actualEndDate: draft.actualEndDate || null,
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
  const enablingDepartments = dedupeDepartments(project?.enablingDepartments ?? []);
  return {
    id: project?.id ?? null,
    code: project?.code ?? null,
    name: project?.name ?? "",
    description: project?.description ?? null,
    projectType: project?.projectType ?? "department",
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
    enablingDepartments,
    enablingDepartmentIds: enablingDepartments.map((department) => department.id),
    workspaceEnabled: Boolean(project?.workspaceEnabled),
    status: project?.status ?? "pending",
    plannedStartDate: project?.plannedStartDate ?? null,
    plannedEndDate: project?.plannedEndDate ?? null,
    actualStartDate: project?.actualStartDate ?? null,
    actualEndDate: project?.actualEndDate ?? null,
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
    enablingDepartments: [],
    enablingDepartmentIds: [],
    workspaceEnabled: false,
    status: "pending",
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    completionPercent: null,
    leader: null,
    roleGroups: emptyRoleGroups(),
  };
}
