"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FkFieldOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { type WorkUser, workCanEdit } from "@workspace/work/types";
import { createProject, syncMembers, updateProjectField } from "./api";
import {
  MULTI_PROJECT_ROLES,
  createEmptyProjectDraft,
  createProjectDraft,
  dedupeMembers,
  draftSnapshot,
  employeeFromOption,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
} from "./model";

const PROJECT_CONTENT_SYNC_FIELDS = [
  "description",
  "status",
  "priority",
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

const PROJECT_MANAGE_SYNC_FIELDS = ["parentId", "leadingDepartmentId"] as const;

export function useProjectTabModel(user: WorkUser) {
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
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const selectedProject = useMemo(
    () => typeof selection === "number" ? projects.find((project) => project.id === selection) || null : null,
    [projects, selection]
  );
  const selectedEntries = useMemo(
    () => selectedProject ? entries.filter((entry) => entry.projectId === selectedProject.id) : [],
    [entries, selectedProject]
  );
  const childProjects = useMemo(() => selectedProject?.childProjects ?? [], [selectedProject]);
  const parentProjectOptions = useMemo(() => buildParentProjectOptions(projects, draft?.id ?? null), [draft?.id, projects]);
  const dirty = draftSnapshot(draft) !== baseline;
  const canEditCurrent = draft?.id ? Boolean(selectedProject?.permissions.canEdit) : canEdit;
  const canManageCurrent = draft?.id ? Boolean(selectedProject?.permissions.canManage) : canEdit;
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
      setSelection((prev) => nextProjects.some((project) => project.id === prev) ? prev : (nextProjects[0]?.id ?? null));
    } catch {
      setError("项目加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (creating) return;
    const nextDraft = selectedProject ? createProjectDraft(selectedProject, selectedEntries) : null;
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }, [creating, selectedEntries, selectedProject, selection]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (key === "projectType" && value === "personal") {
        return {
          ...prev,
          projectType: "personal",
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

  function startCreateProject() {
    const nextDraft = createEmptyProjectDraft();
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
    canCreateProject: canEdit, canEditCurrent, canManageCurrent, canSave, childProjects, creating, dirty, draft, error,
    loading, parentProjectOptions, projectListDrawerOpen, projectListOpen, projects, saving,
    selectedProject, selection, toast,
    cancelCreateProject, saveProject, setCreating, setLeader, startCreateProject,
    setProjectListDrawerOpen, setProjectListOpen, setRoleMembers, setSelection,
    setToast, updateDraft,
  };
}

function buildParentProjectOptions(projects: ProjectItem[], draftId: number | null) {
  const excluded = new Set<number>();
  if (draftId) {
    excluded.add(draftId);
    const childrenByParent = new Map<number, ProjectItem[]>();
    for (const project of projects) {
      if (!project.parentId) continue;
      const children = childrenByParent.get(project.parentId) || [];
      children.push(project);
      childrenByParent.set(project.parentId, children);
    }
    const stack = [...(childrenByParent.get(draftId) || [])];
    while (stack.length > 0) {
      const child = stack.pop()!;
      if (excluded.has(child.id)) continue;
      excluded.add(child.id);
      stack.push(...(childrenByParent.get(child.id) || []));
    }
  }
  return projects.filter((project) => !excluded.has(project.id)).map((project) => ({ value: String(project.id), label: project.name }));
}
