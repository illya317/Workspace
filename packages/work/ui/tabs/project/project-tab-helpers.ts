import type { WorkProjectActionPermissions } from "@workspace/work/types";
import type { DepartmentTag, ProjectDraft, ProjectItem, ProjectListFilter, ProjectSpace, ProjectType } from "./model";

export type ProjectTypeFilter = ProjectType | "all";
export type ProjectDepartmentOption = DepartmentTag;

type ProjectCreateScope = { projectType: ProjectType; department: ProjectDepartmentOption | null };

export function projectMatchesFilter(project: ProjectItem, filter: ProjectListFilter, typeFilter: ProjectTypeFilter, departmentFilter: number | null) {
  if (typeFilter !== "all" && project.projectType !== typeFilter) return false;
  if (typeFilter === "department" && departmentFilter !== null && project.leadingDepartmentId !== departmentFilter) return false;
  if (filter === "全部") return true;
  return (project.projectLevel || "普通") === filter;
}

export function projectSpaceForProjectFilter(spaces: ProjectSpace[], projectType: ProjectTypeFilter, departmentId: number | null) {
  if (projectType === "all") return null;
  if (projectType === "department") {
    return departmentId ? spaces.find((space) => space.targetType === "department" && space.targetId === departmentId) ?? null : null;
  }
  if (projectType === "company") return spaces.find(isOperatingCommitteeSpace) ?? null;
  return spaces.find((space) => space.targetType === "company") ?? null;
}

export function operatingCommitteeDepartment(spaces: ProjectSpace[]): DepartmentTag | null {
  const space = spaces.find(isOperatingCommitteeSpace);
  if (!space) return null;
  return {
    id: space.targetId,
    name: space.name || "委员会",
    code: departmentCodeFromSpace(space),
  };
}

export function applyProjectTypeRules(draft: ProjectDraft, spaces: ProjectSpace[]): ProjectDraft {
  if (draft.projectType !== "company") return draft;
  const committee = operatingCommitteeDepartment(spaces);
  if (!committee) return draft;
  return {
    ...draft,
    leadingDepartmentId: committee.id,
    leadingDepartmentName: committee.name,
    leadingDepartmentCode: committee.code,
  };
}

export function canCreateProjectForActiveSpace(
  projectType: ProjectTypeFilter,
  activeProjectSpace: ProjectSpace | null,
  actionPermissions: WorkProjectActionPermissions,
  projectSpaces: ProjectSpace[] = [],
) {
  if (projectType === "all") {
    return actionPermissions.canCreate || projectSpaces.some((space) => space.actionPermissions.canCreate);
  }
  if (activeProjectSpace?.actionPermissions.canCreate) return true;
  if (projectType === "department") return false;
  if (projectType === "company") return actionPermissions.canCreate && actionPermissions.canCreateOrg;
  return false;
}

export function canCreateProjectDraft(
  draft: ProjectDraft,
  _spaces: ProjectSpace[],
  _actionPermissions: WorkProjectActionPermissions,
) {
  if (draft.projectType === "department") {
    return Boolean(draft.leadingDepartmentId && draft.enablingDepartmentIds.length);
  }
  if (draft.projectType === "company") return Boolean(draft.leadingDepartmentId && draft.enablingDepartmentIds.length);
  return draft.enablingDepartmentIds.length > 0;
}

export function projectDepartmentFilterOptions(projects: ProjectItem[], spaces: ProjectSpace[]): ProjectDepartmentOption[] {
  const departments = new Map<number, ProjectDepartmentOption>();
  for (const space of spaces) {
    if (space.targetType !== "department") continue;
    departments.set(space.targetId, {
      id: space.targetId,
      name: space.name,
      code: departmentCodeFromSpace(space),
    });
  }
  for (const project of projects) {
    if (project.projectType !== "department" || !project.leadingDepartmentId) continue;
    if (departments.has(project.leadingDepartmentId)) continue;
    departments.set(project.leadingDepartmentId, {
      id: project.leadingDepartmentId,
      name: project.leadingDepartmentName || "未命名部门",
      code: project.leadingDepartmentCode ?? null,
    });
  }
  return Array.from(departments.values()).sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, "zh-Hans-CN"));
}

export function projectCreateScopeForFilter(
  projectTypeFilter: ProjectTypeFilter,
  projectDepartmentFilter: number | null,
  projectDepartmentOptions: ProjectDepartmentOption[],
  projectSpaces: ProjectSpace[],
  preferredDepartmentIds: number[],
  actionPermissions: WorkProjectActionPermissions,
): ProjectCreateScope {
  if (projectTypeFilter === "department") {
    return {
      projectType: "department",
      department: projectDepartmentOptions.find((option) => option.id === projectDepartmentFilter)
        ?? firstCreatableDepartment(projectSpaces, projectDepartmentOptions, preferredDepartmentIds),
    };
  }
  if (projectTypeFilter === "company") return { projectType: "company", department: null };
  if (projectTypeFilter === "other") return { projectType: "other", department: null };

  if (actionPermissions.canCreateOrg || projectSpaces.some((space) => isOperatingCommitteeSpace(space) && space.actionPermissions.canCreate)) {
    return { projectType: "company", department: null };
  }
  const department = firstCreatableDepartment(projectSpaces, projectDepartmentOptions, preferredDepartmentIds);
  if (department) return { projectType: "department", department };
  if (projectSpaces.some((space) => space.targetType === "company" && space.actionPermissions.canCreate)) {
    return { projectType: "other", department: null };
  }
  return { projectType: "department", department: null };
}

export function filterForProjectLevel(projectLevel: string | null | undefined): ProjectListFilter {
  if (projectLevel === "普通" || projectLevel === "重点" || projectLevel === "特殊") return projectLevel;
  return "全部";
}

function firstCreatableDepartment(projectSpaces: ProjectSpace[], projectDepartmentOptions: ProjectDepartmentOption[], preferredDepartmentIds: number[]) {
  const creatableDepartmentIds = new Set(projectSpaces.filter((space) => space.targetType === "department").map((space) => space.targetId));
  const preferred = preferredDepartmentIds
    .map((id) => projectDepartmentOptions.find((option) => option.id === id && creatableDepartmentIds.has(id)))
    .find((option): option is ProjectDepartmentOption => Boolean(option));
  return preferred ?? projectDepartmentOptions.find((option) => creatableDepartmentIds.has(option.id)) ?? null;
}

function departmentCodeFromSpace(space: ProjectSpace) {
  return space.subtitle?.split(" · ")[0] ?? null;
}

function isOperatingCommitteeSpace(space: ProjectSpace) {
  return space.isOperatingCommittee || space.targetType === "committee";
}
