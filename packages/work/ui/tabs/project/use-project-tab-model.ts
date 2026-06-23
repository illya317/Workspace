"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { FkFieldOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { type WorkUser, workCanEdit } from "@workspace/work/types";
import { createProject, deleteProject, listProjectTasks, syncMembers, updateProjectField } from "./api";
import {
  MULTI_PROJECT_ROLES,
  createEmptyProjectDraft,
  createProjectDraft,
  dedupeMembers,
  draftSnapshot,
  employeeFromOption,
  emptyRoleGroups,
  todayDateString,
  isLeaderRole,
  normalizeProjectRole,
  type EmployeeTag,
  type ProjectListFilter,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
  type ProjectTaskItem,
} from "./model";

const nullableDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式错误").nullable();
const projectSaveSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空"),
  leadingDepartmentId: z.number().nullable(),
  endDate: nullableDateSchema,
  completionPercent: z.number().min(0, "完成度不能小于 0").nullable(),
}).superRefine((data, ctx) => {
  if (!data.leadingDepartmentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请选择主导部门", path: ["leadingDepartmentId"] });
  }
  if (data.endDate && data.endDate > todayDateString()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "结项日期不能晚于今日", path: ["endDate"] });
  }
});

const PROJECT_CONTENT_SYNC_FIELDS = [
  "description",
  "projectLevel",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "startDate",
  "endDate",
  "completionPercent",
] as const;

const PROJECT_MANAGE_SYNC_FIELDS = ["leadingDepartmentId"] as const;

export function useProjectTabModel(user: WorkUser, initialProjectId?: number | null) {
  const canEdit = workCanEdit(user);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [entries, setEntries] = useState<ProjectMemberEntry[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<ProjectTaskItem[]>([]);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(true);
  const [projectListDrawerOpen, setProjectListDrawerOpen] = useState(false);
  const [projectListFilter, setProjectListFilter] = useState<ProjectListFilter>("all");
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
  const rasciRows = useMemo(
    () => buildRasciRows(draft, selectedTasks),
    [draft, selectedTasks]
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
        setProjectListFilter(filterForProjectLevel(requestedProject.projectLevel));
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

  const loadSelectedTasks = useCallback(async (projectId: number | null) => {
    if (!projectId) {
      setSelectedTasks([]);
      return;
    }
    try {
      setSelectedTasks(await listProjectTasks(projectId));
    } catch {
      setSelectedTasks([]);
    }
  }, []);

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
    void loadSelectedTasks(selectedProject?.id ?? null);
  }, [creating, loadSelectedTasks, selectedEntries, selectedProject, selection]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
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
    const validation = projectSaveSchema.safeParse({
      name,
      leadingDepartmentId: draft.leadingDepartmentId,
      endDate: draft.endDate,
      completionPercent: draft.completionPercent,
    });
    if (!validation.success) {
      return setToast({ type: "error", message: validation.error.issues[0]?.message || "项目信息无效" });
    }
    setSaving(true);
    try {
      if (!draft.id) {
        const projectId = await createProject({ ...draft, name });
        if (!projectId) throw new Error("新建项目失败");
        setToast({ type: "success", message: "项目已新建" });
        setCreating(false);
        await loadData();
        setProjectListFilter(filterForProjectLevel(draft.projectLevel));
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

  async function deleteSelectedProject() {
    if (!selectedProject || saving) return { ok: false as const, error: "未选择项目" };
    setSaving(true);
    try {
      await deleteProject(selectedProject.id);
      setToast({ type: "success", message: "项目已删除" });
      setCreating(false);
      setDraft(null);
      setBaseline("");
      setSelection(null);
      await loadData();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "删除项目失败" };
    } finally {
      setSaving(false);
    }
  }

  function startCreateProject() {
    const nextDraft = createEmptyProjectDraft();
    setProjectListFilter(filterForProjectLevel(nextDraft.projectLevel));
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
    canCreateProject: canEdit, canDeleteCurrent, canEditCurrent, canManageCurrent, canSave, creating, dirty, draft, error,
    filteredProjects, loading, projectListDrawerOpen, projectListFilter, projectListOpen, projects, rasciRows, saving,
    selectedProject, selection, toast,
    cancelCreateProject, deleteSelectedProject, saveProject, setCreating, setLeader, startCreateProject,
    setProjectListDrawerOpen, setProjectListFilter, setProjectListOpen, setRoleMembers, setSelection,
    loadSelectedTasks, setToast, updateDraft,
  };
}

function projectMatchesFilter(project: ProjectItem, filter: ProjectListFilter) {
  if (filter === "all") return true;
  return (project.projectLevel || "普通") === filter;
}

function filterForProjectLevel(projectLevel: string | null | undefined): ProjectListFilter {
  if (projectLevel === "普通" || projectLevel === "重点") return projectLevel;
  return "all";
}

function buildRasciRows(
  draft: ProjectDraft | null,
  tasks: ProjectTaskItem[],
) {
  if (!draft) return [];
  return [
    {
      kind: "project" as const,
      id: draft.id ?? 0,
      name: draft.name || "当前项目",
      subtitle: "主项目",
      leader: draft.leader,
      roleGroups: draft.roleGroups,
    },
    ...tasks.map((task) => ({
      kind: "task" as const,
      id: task.id,
      name: task.name || task.description || `任务 ${task.id}`,
      subtitle: "任务",
      leader: taskLeader(task),
      roleGroups: taskRoleGroups(task),
    })),
  ];
}

function taskLeader(task: ProjectTaskItem): EmployeeTag | null {
  if (task.ownerEmployeeId && task.ownerEmployeeName) {
    return {
      id: task.ownerEmployeeId,
      employeeNumber: task.ownerEmployeeNumber || "",
      name: task.ownerEmployeeName,
    };
  }
  const leader = task.assignees.find((assignee) => isLeaderRole(assignee.role));
  return leader ? {
    id: leader.employeeId,
    employeeNumber: leader.employeeNumber,
    name: leader.employeeName,
  } : null;
}

function taskRoleGroups(task: ProjectTaskItem): Record<MultiProjectRole, EmployeeTag[]> {
  const groups = emptyRoleGroups();
  const leaderId = taskLeader(task)?.id ?? null;
  for (const assignee of task.assignees) {
    if (assignee.employeeId === leaderId) continue;
    const role = normalizeProjectRole(assignee.role);
    if (role === "负责人") continue;
    groups[role].push({
      id: assignee.employeeId,
      employeeNumber: assignee.employeeNumber,
      name: assignee.employeeName,
    });
  }
  for (const role of MULTI_PROJECT_ROLES) groups[role] = dedupeMembers(groups[role]);
  return groups;
}
