"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useFeedback } from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { actualEndDateForStatus, validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import { type WorkProjectActionPermissions, type WorkUser } from "@workspace/work/types";
import { createProject, deleteProject, listProjectSpaces, syncMembers, updateProjectField } from "./api";
import {
  MULTI_PROJECT_ROLES,
  createEmptyProjectDraft,
  createProjectDraft,
  dedupeMembers,
  draftSnapshot,
  employeeFromOption,
  type EmployeeTag,
  type ProjectListFilter,
  type MultiProjectRole,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
  type ProjectSpace,
} from "./model";
import {
  applyProjectTypeRules,
  canCreateProjectDraft,
  projectCreateScopeForFilter,
  projectDepartmentFilterOptions,
  projectMatchesFilter,
  type ProjectTypeFilter,
} from "./project-tab-helpers";

const nullableDateSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式错误").nullable()
);
const projectSaveSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空"),
  projectType: z.enum(["company", "department", "other"]),
  leadingDepartmentId: z.number().nullable(),
  enablingDepartmentIds: z.array(z.number()),
  workspaceEnabled: z.boolean(),
  status: z.enum(["pending", "active", "done"]),
  plannedStartDate: nullableDateSchema,
  plannedEndDate: nullableDateSchema,
  actualStartDate: nullableDateSchema,
  actualEndDate: nullableDateSchema,
}).superRefine((data, ctx) => {
  if (data.enablingDepartmentIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请选择赋能部门", path: ["enablingDepartmentIds"] });
  }
  if (data.projectType === "department" && !data.leadingDepartmentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "部门项目必须选择归口部门", path: ["leadingDepartmentId"] });
  }
  const scheduleError = validateCompletionSchedule(data);
  if (scheduleError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: scheduleError, path: ["actualEndDate"] });
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
  "status",
  "plannedStartDate",
  "plannedEndDate",
  "actualStartDate",
  "actualEndDate",
] as const;

const PROJECT_MANAGE_SYNC_FIELDS = ["leadingDepartmentId", "enablingDepartmentIds", "workspaceEnabled"] as const;

export function useProjectTabModel(
  user: WorkUser,
  actionPermissions: WorkProjectActionPermissions,
  initialProjectId?: number | null,
  options: { autoSelectFirst?: boolean } = {},
) {
  const [projectSpaces, setProjectSpaces] = useState<ProjectSpace[]>([]);
  const [preferredDepartmentIds, setPreferredDepartmentIds] = useState<number[]>([]);
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
  const [projectListFilter, setProjectListFilter] = useState<ProjectListFilter>("全部");
  const [projectTypeFilter, setProjectTypeFilter] = useState<ProjectTypeFilter>("all");
  const [projectDepartmentFilter, setProjectDepartmentFilter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useFeedback();
  const setToast = useCallback((toast: { type: "success" | "error"; message: string } | null) => {
    if (toast) notify(toast.message, toast.type);
  }, [notify]);

  const filteredProjects = useMemo(
    () => projects.filter((project) => projectMatchesFilter(project, projectListFilter, projectTypeFilter, projectDepartmentFilter)),
    [projectDepartmentFilter, projectListFilter, projectTypeFilter, projects]
  );
  const projectDepartmentOptions = useMemo(() => projectDepartmentFilterOptions(projects, projectSpaces), [projects, projectSpaces]);
  const selectedProject = useMemo(
    () => typeof selection === "number" ? projects.find((project) => project.id === selection) || null : null,
    [projects, selection]
  );
  const selectedEntries = useMemo(
    () => selectedProject ? entries.filter((entry) => entry.projectId === selectedProject.id) : [],
    [entries, selectedProject]
  );
  const rasciRows = useMemo(() => buildRasciRows(draft), [draft]);
  const dirty = draftSnapshot(draft) !== baseline;
  const canCreateDraftProject = draft && !draft.id ? canCreateProjectDraft(draft, projectSpaces, actionPermissions) : false;
  const canEditNewDraft = Boolean(draft && !draft.id && actionPermissions.canCreate);
  const selectedActionPermissions = selectedProject?.actionPermissions;
  const canEditCurrent = draft?.id ? Boolean(selectedActionPermissions?.canUpdate && selectedProject?.permissions.canEdit) : Boolean(canEditNewDraft);
  const canManageCurrent = draft?.id ? Boolean(selectedActionPermissions?.canUpdate && selectedProject?.permissions.canManage) : Boolean(canEditNewDraft);
  const canDeleteCurrent = draft?.id ? Boolean(selectedActionPermissions?.canDelete && selectedProject?.permissions.canDelete) : false;
  const canCreateCurrent = draft?.id ? Boolean(selectedActionPermissions?.canCreate && selectedProject?.permissions.canEdit) : Boolean(canCreateDraftProject);
  const canDeleteSubresourceCurrent = draft?.id ? Boolean(selectedActionPermissions?.canDelete && selectedProject?.permissions.canEdit) : false;
  const canReviseCurrent = draft?.id ? Boolean(selectedActionPermissions?.canRevise && selectedProject?.permissions.canEdit) : false;
  const canSave = !!draft && (draft.id ? canEditCurrent : canCreateDraftProject) && !saving && dirty;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, entryRes, spaceData] = await Promise.all([
        fetch(workspacePath("/api/modules/work/projects?pageSize=500")),
        fetch(workspacePath("/api/modules/work/projects/members?pageSize=500")),
        listProjectSpaces(),
      ]);
      if (!projectRes.ok || !entryRes.ok) throw new Error("加载失败");
      const [projectData, entryData] = await Promise.all([projectRes.json(), entryRes.json()]);
      const nextProjects = (projectData.projects || []) as ProjectItem[];
      setProjectSpaces(spaceData.spaces);
      setPreferredDepartmentIds(spaceData.preferredDepartmentIds);
      setProjects(nextProjects);
      setEntries((entryData.entries || []) as ProjectMemberEntry[]);
      const requestedProject = initialProjectId
        ? nextProjects.find((project) => project.id === initialProjectId)
        : null;
      if (requestedProject) {
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
    if (projectTypeFilter !== "department") return;
    if (projectDepartmentOptions.length === 0) return;
    if (projectDepartmentFilter !== null && projectDepartmentOptions.some((option) => option.id === projectDepartmentFilter)) return;
    setProjectDepartmentFilter(projectDepartmentOptions[0].id);
  }, [projectDepartmentFilter, projectDepartmentOptions, projectTypeFilter]);

  useEffect(() => {
    if (creating || loading) return;
    if (options.autoSelectFirst === false && !initialProjectId) return;
    setSelection((prev) => {
      if (initialProjectId && projects.some((project) => project.id === prev)) return prev;
      return filteredProjects.some((project) => project.id === prev) ? prev : (filteredProjects[0]?.id ?? null);
    });
  }, [creating, filteredProjects, initialProjectId, loading, options.autoSelectFirst, projects]);

  useEffect(() => {
    if (creating) return;
    const nextDraft = selectedProject ? applyProjectTypeRules(createProjectDraft(selectedProject, selectedEntries), projectSpaces) : null;
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }, [creating, projectSpaces, selectedEntries, selectedProject, selection]);

  function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        [key]: value,
        ...(key === "status" ? { actualEndDate: actualEndDateForStatus(String(value), prev.actualEndDate) } : {}),
      };
      if (key === "projectType") {
        if (value === "company") return applyProjectTypeRules(next, projectSpaces);
        if (prev.projectType === "company") {
          return {
            ...next,
            leadingDepartmentId: null,
            leadingDepartmentName: null,
            leadingDepartmentCode: null,
          };
        }
      }
      return next;
    });
  }

  function setLeader(option?: ReferenceOption) {
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
      projectType: draft.projectType,
      leadingDepartmentId: draft.leadingDepartmentId,
      enablingDepartmentIds: draft.enablingDepartmentIds,
      workspaceEnabled: draft.workspaceEnabled,
      status: draft.status as "pending" | "active" | "done",
      plannedStartDate: draft.plannedStartDate,
      plannedEndDate: draft.plannedEndDate,
      actualStartDate: draft.actualStartDate,
      actualEndDate: draft.actualEndDate,
    });
    if (!validation.success) {
      return setToast({ type: "error", message: validation.error.issues[0]?.message || "项目信息无效" });
    }
    setSaving(true);
    try {
      if (!draft.id) {
        const result = await createProject({ ...draft, name });
        if (result.executionMode !== "workflow" || !result.request?.id) throw new Error("项目确认流程创建失败");
        setToast({ type: "success", message: "已提交赋能部门负责人确认" });
        setCreating(false);
        setDraft(null);
        setBaseline("");
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
          if (JSON.stringify(selectedProject[field] ?? null) !== JSON.stringify(value)) await updateProjectField(projectId, field, value);
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
    const createScope = projectCreateScopeForFilter(
      projectTypeFilter,
      projectDepartmentFilter,
      projectDepartmentOptions,
      projectSpaces,
      preferredDepartmentIds,
      actionPermissions,
    );
    const nextDraft = applyProjectTypeRules({
      ...createEmptyProjectDraft(),
      projectType: createScope.projectType,
      leadingDepartmentId: createScope.department?.id ?? null,
      leadingDepartmentName: createScope.department?.name ?? null,
      leadingDepartmentCode: createScope.department?.code ?? null,
      enablingDepartments: createScope.department ? [createScope.department] : [],
      enablingDepartmentIds: createScope.department ? [createScope.department.id] : [],
    }, projectSpaces);
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
    canCreateProject: actionPermissions.canCreate, canCreateCurrent, canDeleteCurrent, canDeleteSubresourceCurrent, canEditCurrent, canManageCurrent, canReviseCurrent, canSave, creating, dirty, draft, error,
    filteredProjects, loading, preferredDepartmentIds, projectDepartmentFilter, projectDepartmentOptions, projectListDrawerOpen, projectListFilter, projectListOpen, projects, projectSpaces, projectTypeFilter, rasciRows, saving,
    selectedProject, selection,
    cancelCreateProject, deleteSelectedProject, saveProject, setCreating, setLeader, startCreateProject,
    setProjectDepartmentFilter, setProjectListDrawerOpen, setProjectListFilter, setProjectListOpen, setProjectTypeFilter, setRoleMembers, setSelection,
    setToast, updateDraft,
  };
}

/** @ui-structural-declaration Complete RASCI matrix row declaration. */
function buildRasciRows(draft: ProjectDraft | null) {
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
  ];
}
