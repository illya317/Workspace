"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FkFieldOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { type WorkUser, workCanEdit } from "@workspace/work/types";
import { createProject, createSubproject, deleteProject, syncChildProjects, syncMembers, updateProjectField } from "./api";
import {
  MULTI_PROJECT_ROLES,
  createEmptyProjectDraft,
  createProjectDraft,
  dedupeMembers,
  draftSnapshot,
  employeeFromOption,
  emptyRoleGroups,
  memberFromEntry,
  normalizeProjectRole,
  type EmployeeTag,
  type ProjectListFilter,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
} from "./model";

const PROJECT_CONTENT_SYNC_FIELDS = [
  "description",
  "status",
  "isMilestone",
  "stage",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "startDate",
  "endDate",
] as const;

const PROJECT_MANAGE_SYNC_FIELDS = ["leadingDepartmentId"] as const;

export function useProjectTabModel(user: WorkUser, initialProjectId?: number | null) {
  const canEdit = workCanEdit(user);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [entries, setEntries] = useState<ProjectMemberEntry[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(true);
  const [projectListDrawerOpen, setProjectListDrawerOpen] = useState(false);
  const [projectListFilter, setProjectListFilter] = useState<ProjectListFilter>("department");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const filteredProjects = useMemo(
    () => projects.filter((project) => projectMatchesFilter(project, projectListFilter)),
    [projectListFilter, projects]
  );
  const selectedProject = useMemo(
    () => typeof selection === "number" ? projects.find((project) => project.id === selection) || null : null,
    [projects, selection]
  );
  const selectedEntries = useMemo(
    () => selectedProject ? entries.filter((entry) => entry.projectId === selectedProject.id) : [],
    [entries, selectedProject]
  );
  const childProjects = useMemo(() => buildChildProjectTags(projects, draft?.childProjectIds ?? []), [draft?.childProjectIds, projects]);
  const rasciRows = useMemo(
    () => buildRasciRows(draft, childProjects, entries),
    [childProjects, draft, entries]
  );
  const dirty = draftSnapshot(draft) !== baseline;
  const canEditCurrent = draft?.id ? Boolean(selectedProject?.permissions.canEdit) : canEdit;
  const canManageCurrent = draft?.id ? Boolean(selectedProject?.permissions.canManage) : canEdit;
  const canDeleteCurrent = draft?.id ? Boolean(selectedProject?.permissions.canDelete) : false;
  const canSave = !!draft && canEditCurrent && !saving && dirty;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, entryRes] = await Promise.all([
        fetch(workspacePath("/api/modules/work/projects?pageSize=500")),
        fetch(workspacePath("/api/modules/work/projects/members?pageSize=500")),
      ]);
      if (!projectRes.ok || !entryRes.ok) throw new Error("加载失败");
      const [projectData, entryData] = await Promise.all([projectRes.json(), entryRes.json()]);
      const nextProjects = (projectData.projects || []) as ProjectItem[];
      setProjects(nextProjects);
      setEntries((entryData.entries || []) as ProjectMemberEntry[]);
      const requestedProject = initialProjectId
        ? nextProjects.find((project) => project.id === initialProjectId)
        : null;
      if (requestedProject) {
        setProjectListFilter(filterForProjectType(requestedProject.projectType));
        setSelection(requestedProject.id);
      } else {
        setSelection((prev) => nextProjects.some((project) => project.id === prev) ? prev : null);
      }
    } catch {
      setError("项目加载失败");
    } finally {
      setLoading(false);
    }
  }, [initialProjectId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (creating || loading) return;
    setSelection((prev) => filteredProjects.some((project) => project.id === prev) ? prev : (filteredProjects[0]?.id ?? null));
  }, [creating, filteredProjects, loading]);

  useEffect(() => {
    if (creating) return;
    const nextDraft = selectedProject ? createProjectDraft(selectedProject, selectedEntries) : null;
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }, [creating, selectedEntries, selectedProject, selection]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (key === "projectType" && (value === "personal" || value === "subproject")) {
        return {
          ...prev,
          projectType: value,
          code: null,
          leadingDepartmentId: null,
          leadingDepartmentName: null,
          leadingDepartmentCode: null,
        };
      }
      return { ...prev, [key]: value };
    });
  }

  function setLeader(option?: FkFieldOption) {
    const employee = employeeFromOption(option);
    setDraft((prev) => {
      if (!prev) return prev;
      const roleGroups = { ...prev.roleGroups };
      if (employee) for (const role of MULTI_PROJECT_ROLES) roleGroups[role] = roleGroups[role].filter((member) => member.id !== employee.id);
      return { ...prev, leader: employee, roleGroups };
    });
  }

  function setRoleMembers(role: MultiProjectRole, members: EmployeeTag[]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextMembers = dedupeMembers(members);
      const movedIds = new Set(nextMembers.map((member) => member.id));
      const roleGroups = { ...prev.roleGroups, [role]: nextMembers };
      for (const otherRole of MULTI_PROJECT_ROLES) {
        if (otherRole !== role) roleGroups[otherRole] = roleGroups[otherRole].filter((member) => !movedIds.has(member.id));
      }
      return { ...prev, leader: prev.leader && movedIds.has(prev.leader.id) ? null : prev.leader, roleGroups };
    });
  }

  function setChildProjects(nextChildren: { id: number; name: string }[]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const seen = new Set<number>();
      const childProjectIds: number[] = [];
      for (const child of nextChildren) {
        if (!child.id || child.id === prev.id || seen.has(child.id)) continue;
        seen.add(child.id);
        childProjectIds.push(child.id);
      }
      return { ...prev, childProjectIds };
    });
  }

  async function saveProject() {
    if (!draft || !dirty) return;
    const name = draft.name.trim();
    if (!name) return setToast({ type: "error", message: "项目名称不能为空" });
    if (draft.projectType === "department" && !draft.leadingDepartmentId) return setToast({ type: "error", message: "请选择主导部门" });
    setSaving(true);
    try {
      if (!draft.id) {
        const projectId = await createProject({ ...draft, name });
        if (!projectId) throw new Error("新建项目失败");
        setToast({ type: "success", message: "项目已新建" });
        setCreating(false);
        await loadData();
        setProjectListFilter(filterForProjectType(draft.projectType));
        setSelection(projectId);
        return;
      }
      const projectId = draft.id;
      if (selectedProject && selectedProject.name !== name && canManageCurrent) await updateProjectField(projectId, "name", name);
      if (selectedProject) {
        const fields = canManageCurrent
          ? [...PROJECT_CONTENT_SYNC_FIELDS, ...PROJECT_MANAGE_SYNC_FIELDS]
          : [...PROJECT_CONTENT_SYNC_FIELDS];
        for (const field of fields) {
          const value = draft[field] ?? null;
          if ((selectedProject[field] ?? null) !== value) await updateProjectField(projectId, field, value);
        }
      }
      if (canManageCurrent) await syncChildProjects(projectId, draft.childProjectIds);
      if (canManageCurrent) await syncMembers(projectId, { ...draft, id: projectId, name }, entries);
      setToast({ type: "success", message: "项目信息已保存" });
      await loadData();
      setSelection(projectId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function createChildProject(name: string, leadingDepartmentId?: number | null, leader?: EmployeeTag | null, endDate?: string | null) {
    const parentId = draft?.id;
    const trimmedName = name.trim();
    if (!parentId || !trimmedName) return;
    setSaving(true);
    try {
      const childId = await createSubproject({ name: trimmedName, parentId, leadingDepartmentId, leader, endDate });
      if (!childId) throw new Error("新建子项目失败");
      setToast({ type: "success", message: "子项目已新建" });
      await loadData();
      setSelection(parentId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "新建子项目失败" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedProject() {
    if (!selectedProject || saving) return;
    setSaving(true);
    try {
      await deleteProject(selectedProject.id);
      setToast({ type: "success", message: "项目已删除" });
      setCreating(false);
      setDraft(null);
      setBaseline("");
      setSelection(null);
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "删除项目失败" });
    } finally {
      setSaving(false);
    }
  }

  function startCreateProject() {
    const nextDraft = createEmptyProjectDraft();
    setProjectListFilter("department");
    setCreating(true);
    setSelection(null);
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }

  function cancelCreateProject() {
    setCreating(false);
    setDraft(null);
    setBaseline("");
  }

  return {
    canCreateProject: canEdit, canDeleteCurrent, canEditCurrent, canManageCurrent, canSave, childProjects, creating, dirty, draft, error,
    filteredProjects, loading, projectListDrawerOpen, projectListFilter, projectListOpen, projects, rasciRows, saving,
    selectedProject, selection, toast,
    cancelCreateProject, createChildProject, deleteSelectedProject, saveProject, setChildProjects, setCreating, setLeader, startCreateProject,
    setProjectListDrawerOpen, setProjectListFilter, setProjectListOpen, setRoleMembers, setSelection,
    setToast, updateDraft,
  };
}

function projectMatchesFilter(project: ProjectItem, filter: ProjectListFilter) {
  if (filter === "all") return true;
  if (filter === "department") return project.projectType === "department";
  if (filter === "subproject") return project.projectType === "subproject";
  return project.projectType !== "department" && project.projectType !== "subproject";
}

function filterForProjectType(projectType: ProjectItem["projectType"]): ProjectListFilter {
  if (projectType === "department" || projectType === "subproject") return projectType;
  return "other";
}

function buildRasciRows(
  draft: ProjectDraft | null,
  childProjects: { id: number; name: string }[],
  entries: ProjectMemberEntry[],
) {
  if (!draft) return [];
  return [
    {
      id: draft.id ?? 0,
      name: draft.name || "当前项目",
      subtitle: "主项目",
      leader: draft.leader,
      roleGroups: draft.roleGroups,
    },
    ...childProjects.map((project) => buildRasciRowFromEntries(project, entries)),
  ];
}

function buildRasciRowFromEntries(project: { id: number; name: string }, entries: ProjectMemberEntry[]) {
  let leader: EmployeeTag | null = null;
  const roleGroups = emptyRoleGroups();
  for (const entry of entries) {
    if (entry.projectId !== project.id) continue;
    const role = normalizeProjectRole(entry.role);
    const member = memberFromEntry(entry);
    if (role === "负责人") {
      leader = member;
    } else {
      roleGroups[role].push(member);
    }
  }
  for (const role of MULTI_PROJECT_ROLES) roleGroups[role] = dedupeMembers(roleGroups[role]);
  return { id: project.id, name: project.name, subtitle: null, leader, roleGroups };
}

function buildChildProjectTags(projects: ProjectItem[], childProjectIds: number[]) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return childProjectIds
    .map((id) => {
      const project = projectById.get(id);
      return project
        ? {
            id: project.id,
            name: project.name,
            status: project.status,
            startDate: project.startDate,
            endDate: project.endDate,
          }
        : null;
    })
    .filter((project): project is { id: number; name: string; status: string | null; startDate: string | null; endDate: string | null } => Boolean(project));
}
