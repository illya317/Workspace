import type { FkFieldOption, PickerOption } from "@workspace/core/ui";
import { PROJECT_ROLES } from "@workspace/work/constants";

export type ProjectType = "department" | "personal";

export type ProjectPermissions = {
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
};

export type ProjectItem = {
  id: number;
  code: string | null;
  name: string;
  projectType: ProjectType;
  createdBy: number | null;
  permissions: ProjectPermissions;
  description: string | null;
  status: string | null;
  priority: string | null;
  stage: string | null;
  plan: string | null;
  goal: string | null;
  milestones: string | null;
  budgetAmount: number | null;
  budgetNote: string | null;
  riskNote: string | null;
  remark: string | null;
  parentId: number | null;
  parentName: string | null;
  childProjects: { id: number; name: string }[];
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
  leadingDepartmentCode: string | null;
  startDate: string | null;
  endDate: string | null;
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
};

export type EmployeeTag = {
  id: number;
  employeeNumber: string;
  name: string;
};

export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type MultiProjectRole = Exclude<ProjectRole, "负责人">;
export const MULTI_PROJECT_ROLES = PROJECT_ROLES.filter((role) => role !== "负责人") as MultiProjectRole[];

export type ProjectDraft = {
  id: number | null;
  code: string | null;
  projectType: ProjectType;
  name: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  stage: string | null;
  plan: string | null;
  goal: string | null;
  milestones: string | null;
  budgetAmount: number | null;
  budgetNote: string | null;
  riskNote: string | null;
  remark: string | null;
  parentId: number | null;
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
  leadingDepartmentCode: string | null;
  startDate: string | null;
  endDate: string | null;
  leader: EmployeeTag | null;
  roleGroups: Record<MultiProjectRole, EmployeeTag[]>;
};

export const PROJECT_TYPE_OPTIONS = [
  { value: "department", label: "部门项目" },
  { value: "personal", label: "个人项目" },
] satisfies PickerOption[];
export const PROJECT_STATUS_OPTIONS = ["规划中", "进行中", "暂停", "已完成", "已取消"] as const;
export const PROJECT_PRIORITY_OPTIONS = ["高", "中", "低"] as const;
export const PROJECT_STAGE_OPTIONS = ["立项", "规划", "执行", "验收", "收尾"] as const;

function toPickerOptions(values: readonly string[]): PickerOption[] {
  return values.map((value) => ({ value, label: value }));
}

export const PROJECT_STATUS_PICKER_OPTIONS = toPickerOptions(PROJECT_STATUS_OPTIONS);
export const PROJECT_PRIORITY_PICKER_OPTIONS = toPickerOptions(PROJECT_PRIORITY_OPTIONS);
export const PROJECT_STAGE_PICKER_OPTIONS = toPickerOptions(PROJECT_STAGE_OPTIONS);

export function projectCode(project: ProjectItem | null, draft: ProjectDraft | null) {
  if ((project?.projectType || draft?.projectType) === "personal") return "个人项目无编号";
  return project?.code || draft?.code || "保存后生成";
}

export function employeeFromOption(option?: FkFieldOption): EmployeeTag | null {
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
    projectType: draft.projectType,
    name: draft.name.trim(),
    description: draft.description || null,
    status: draft.status || null,
    priority: draft.priority || null,
    stage: draft.stage || null,
    plan: draft.plan || null,
    goal: draft.goal || null,
    milestones: draft.milestones || null,
    budgetAmount: draft.budgetAmount ?? null,
    budgetNote: draft.budgetNote || null,
    riskNote: draft.riskNote || null,
    remark: draft.remark || null,
    parentId: draft.parentId ?? null,
    leadingDepartmentId: draft.leadingDepartmentId ?? null,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
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
    projectType: project?.projectType ?? "department",
    name: project?.name ?? "",
    description: project?.description ?? null,
    status: project?.status ?? null,
    priority: project?.priority ?? null,
    stage: project?.stage ?? null,
    plan: project?.plan ?? null,
    goal: project?.goal ?? null,
    milestones: project?.milestones ?? null,
    budgetAmount: project?.budgetAmount ?? null,
    budgetNote: project?.budgetNote ?? null,
    riskNote: project?.riskNote ?? null,
    remark: project?.remark ?? null,
    parentId: project?.parentId ?? null,
    leadingDepartmentId: project?.leadingDepartmentId ?? null,
    leadingDepartmentName: project?.leadingDepartmentName ?? null,
    leadingDepartmentCode: project?.leadingDepartmentCode ?? null,
    startDate: project?.startDate ?? null,
    endDate: project?.endDate ?? null,
    leader: leaderEntry ? memberFromEntry(leaderEntry) : null,
    roleGroups,
  };
}

export function createEmptyProjectDraft(): ProjectDraft {
  return {
    id: null,
    code: null,
    projectType: "department",
    name: "",
    description: null,
    status: null,
    priority: null,
    stage: null,
    plan: null,
    goal: null,
    milestones: null,
    budgetAmount: null,
    budgetNote: null,
    riskNote: null,
    remark: null,
    parentId: null,
    leadingDepartmentId: null,
    leadingDepartmentName: null,
    leadingDepartmentCode: null,
    startDate: null,
    endDate: null,
    leader: null,
    roleGroups: emptyRoleGroups(),
  };
}
