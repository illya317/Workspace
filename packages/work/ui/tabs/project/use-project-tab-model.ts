"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FkFieldOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { matchText } from "@workspace/core/search";
import { type WorkUser, workCanEdit } from "@workspace/work/types";
import { createProject, syncMembers, updateProjectField } from "./api";
import {
  MULTI_PROJECT_ROLES,
  createProjectDraft,
  dedupeMembers,
  draftSnapshot,
  employeeFromOption,
  projectCode,
  type CreatePlanDraft,
  type EmployeeTag,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
} from "./model";

const PROJECT_SYNC_FIELDS = [
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
  "parentId",
  "leadingDepartmentId",
  "startDate",
  "endDate",
] as const;

export function useProjectTabModel(user: WorkUser) {
  const canEdit = workCanEdit(user);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [entries, setEntries] = useState<ProjectMemberEntry[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreatePlanDraft>({ name: "", leadingDepartmentId: null, leadingDepartmentName: null });
  const [keyword, setKeyword] = useState("");
  const [showArchived, setShowArchived] = useState(false);
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
  const filteredProjects = useMemo(() => {
    const q = keyword.trim();
    if (!q) return projects;
    return projects.filter((project) => matchText(project.name, q) || matchText(projectCode(project, null), q));
  }, [keyword, projects]);
  const childPlans = useMemo(() => selectedProject?.childPlans ?? [], [selectedProject]);
  const parentPlanOptions = useMemo(() => buildParentPlanOptions(projects, draft?.id ?? null), [draft?.id, projects]);
  const dirty = draftSnapshot(draft) !== baseline;
  const canEditCurrent = canEdit && !showArchived;
  const canSave = !!draft && canEditCurrent && !saving && dirty;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, entryRes] = await Promise.all([
        fetch(workspacePath(`/api/modules/work/plans?pageSize=500${showArchived ? "&archived=1" : ""}`)),
        fetch(workspacePath("/api/modules/work/plan-members?pageSize=500")),
      ]);
      if (!projectRes.ok || !entryRes.ok) throw new Error("加载失败");
      const [projectData, entryData] = await Promise.all([projectRes.json(), entryRes.json()]);
      const nextProjects = (projectData.projects || []) as ProjectItem[];
      setProjects(nextProjects);
      setEntries((entryData.entries || []) as ProjectMemberEntry[]);
      setSelection((prev) => nextProjects.some((project) => project.id === prev) ? prev : (nextProjects[0]?.id ?? null));
    } catch {
      setError("工作计划加载失败");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const nextDraft = selectedProject ? createProjectDraft(selectedProject, selectedEntries) : null;
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }, [selectedEntries, selectedProject, selection]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
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

  async function createPlanFromPanel() {
    const name = createDraft.name.trim();
    if (!name) return setToast({ type: "error", message: "计划名称不能为空" });
    if (!createDraft.leadingDepartmentId) return setToast({ type: "error", message: "请选择主导部门" });
    setSaving(true);
    try {
      const projectId = await createProject(name, createDraft.leadingDepartmentId);
      if (!projectId) throw new Error("新建工作计划失败");
      setCreateDraft({ name: "", leadingDepartmentId: null, leadingDepartmentName: null });
      setCreatePanelOpen(false);
      setToast({ type: "success", message: "工作计划已新建" });
      await loadData();
      setSelection(projectId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "新建工作计划失败" });
    } finally {
      setSaving(false);
    }
  }

  async function setProjectArchived(projectId: number, archived: boolean) {
    setSaving(true);
    try {
      await updateProjectField(projectId, "isArchived", archived);
      setToast({ type: "success", message: archived ? "工作计划已归档" : "工作计划已恢复" });
      await loadData();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setSaving(false);
    }
  }

  async function saveProject() {
    if (!draft || !draft.id || !dirty) return;
    const name = draft.name.trim();
    if (!name) return setToast({ type: "error", message: "计划名称不能为空" });
    if (!draft.leadingDepartmentId) return setToast({ type: "error", message: "请选择主导部门" });
    setSaving(true);
    try {
      const projectId = draft.id;
      if (selectedProject && selectedProject.name !== name) await updateProjectField(projectId, "name", name);
      if (selectedProject) {
        for (const field of PROJECT_SYNC_FIELDS) {
          const value = draft[field] ?? null;
          if ((selectedProject[field] ?? null) !== value) await updateProjectField(projectId, field, value);
        }
      }
      await syncMembers(projectId, { ...draft, id: projectId, name }, entries);
      setToast({ type: "success", message: "工作计划信息已保存" });
      await loadData();
      setSelection(projectId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return {
    canEdit, canEditCurrent, canSave, childPlans, createDraft, createPanelOpen, dirty, draft, error,
    filteredProjects, keyword, loading, parentPlanOptions, projectListDrawerOpen, projectListOpen, saving,
    selectedProject, selection, showArchived, toast,
    createPlanFromPanel, saveProject, setCreateDraft, setCreatePanelOpen, setKeyword, setLeader,
    setProjectArchived, setProjectListDrawerOpen, setProjectListOpen, setRoleMembers, setSelection,
    setShowArchived, setToast, updateDraft,
  };
}

function buildParentPlanOptions(projects: ProjectItem[], draftId: number | null) {
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
