"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionToolbar,
  EmptyStateCard,
  InlineCreatePanel,
  PanelCard,
  SectionCard,
  SelectorCard,
  SearchInput,
  SplitWorkspace,
  SplitWorkspaceToolbar,
  TextareaField,
  TextField,
  Toast,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  getTagInputShellClassName,
  getTagPillClassName,
  getToolbarActionClassName,
  type SplitWorkspaceMode,
} from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import EntitySearchInput, { type SearchOption } from "../components/EntitySearchInput";
import OptionPicker, { type PickerOption } from "../components/OptionPicker";
import { workspacePath } from "@workspace/core/routing";
import { type WorkUser, workCanEdit } from "@workspace/work/types";
import { matchText } from "@workspace/core/search";
import { WORK_PLAN_ROLES } from "@workspace/work/constants";

type ProjectItem = {
  id: number;
  code: string | null;
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
  parentName: string | null;
  childPlans: { id: number; name: string }[];
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
  leadingDepartmentCode: string | null;
  startDate: string | null;
  endDate: string | null;
  employeeCount: number;
  isArchived: boolean;
};

type ProjectMemberEntry = {
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

type EmployeeTag = {
  id: number;
  employeeNumber: string;
  name: string;
};

type ProjectRole = (typeof WORK_PLAN_ROLES)[number];
type MultiProjectRole = Exclude<ProjectRole, "负责人">;
const MULTI_PROJECT_ROLES = WORK_PLAN_ROLES.filter((role) => role !== "负责人") as MultiProjectRole[];

type ProjectDraft = {
  id: number | null;
  code: string | null;
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

type CreatePlanDraft = {
  name: string;
  leadingDepartmentId: number | null;
  leadingDepartmentName: string | null;
};

const PROJECT_STATUS_OPTIONS = ["规划中", "进行中", "暂停", "已完成", "已取消"] as const;
const PROJECT_PRIORITY_OPTIONS = ["高", "中", "低"] as const;
const PROJECT_STAGE_OPTIONS = ["立项", "规划", "执行", "验收", "收尾"] as const;

function toPickerOptions(values: readonly string[]): PickerOption[] {
  return values.map((value) => ({ value, label: value }));
}

const PROJECT_STATUS_PICKER_OPTIONS = toPickerOptions(PROJECT_STATUS_OPTIONS);
const PROJECT_PRIORITY_PICKER_OPTIONS = toPickerOptions(PROJECT_PRIORITY_OPTIONS);
const PROJECT_STAGE_PICKER_OPTIONS = toPickerOptions(PROJECT_STAGE_OPTIONS);

function projectCode(project: ProjectItem | null, draft: ProjectDraft | null) {
  return project?.code || draft?.code || "保存后生成";
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <span className="text-xs font-medium text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
}

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const textareaClassName = getFieldInputClassName("min-h-24 resize-y");

function employeeFromOption(option?: SearchOption): EmployeeTag | null {
  if (!option) return null;
  return {
    id: option.id,
    employeeNumber: option.subtitle || "",
    name: option.name,
  };
}

function memberFromEntry(entry: ProjectMemberEntry): EmployeeTag {
  return {
    id: entry.employeeId,
    employeeNumber: entry.employeeNumber,
    name: entry.employeeName,
  };
}

function dedupeMembers(members: EmployeeTag[]) {
  const seen = new Set<number>();
  const next: EmployeeTag[] = [];
  for (const member of members) {
    if (!member.id || seen.has(member.id)) continue;
    seen.add(member.id);
    next.push(member);
  }
  return next;
}

function isLeaderRole(role: string | null | undefined) {
  return role === "负责人" || role === "计划负责人";
}

function emptyRoleGroups(): Record<MultiProjectRole, EmployeeTag[]> {
  return {
    "执行负责": [],
    "支持协作": [],
    "咨询参与": [],
    "知会": [],
  };
}

function normalizeProjectRole(role: string | null | undefined): ProjectRole {
  if (isLeaderRole(role)) return "负责人";
  return WORK_PLAN_ROLES.includes(role as ProjectRole) ? role as ProjectRole : "执行负责";
}

function draftSnapshot(draft: ProjectDraft | null) {
  if (!draft) return "";
  return JSON.stringify({
    id: draft.id,
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

function createProjectDraft(project: ProjectItem | null, entries: ProjectMemberEntry[]): ProjectDraft {
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

function ProjectMemberTagsInput({
  value,
  disabled,
  onChange,
}: {
  value: EmployeeTag[];
  disabled?: boolean;
  onChange: (value: EmployeeTag[]) => void;
}) {
  function add(option?: SearchOption) {
    const employee = employeeFromOption(option);
    if (!employee) return;
    onChange(dedupeMembers([...value, employee]));
  }

  function remove(id: number) {
    onChange(value.filter((member) => member.id !== id));
  }

  return (
    <div className={getTagInputShellClassName()}>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((member) => (
          <span
            key={member.id}
            className={getTagPillClassName("gap-2 px-3 text-sm text-slate-700")}
          >
            {member.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(member.id)}
                className="text-slate-400 hover:text-red-500"
                aria-label={`移除${member.name}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <div className="min-w-48 flex-1">
            <EntitySearchInput
              entity="employee"
              fkKey="work.plan.member.employee"
              value=""
              activeOnly
              placeholder={value.length ? "继续添加" : "搜索员工"}
              onChange={(_label, option) => add(option)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectTab({ user }: { user: WorkUser }) {
  const canEdit = workCanEdit(user);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [entries, setEntries] = useState<ProjectMemberEntry[]>([]);
  const [selection, setSelection] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreatePlanDraft>({
    name: "",
    leadingDepartmentId: null,
    leadingDepartmentName: null,
  });
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
  const draftId = draft?.id ?? null;

  const parentPlanOptions = useMemo(() => {
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
    return projects
      .filter((project) => !excluded.has(project.id))
      .map((project) => ({ value: String(project.id), label: project.name }));
  }, [draftId, projects]);

  const dirty = draftSnapshot(draft) !== baseline;
  const editorTitle = selectedProject ? "工作计划信息" : "工作计划详情";
  const canEditCurrent = canEdit && !showArchived;
  const canSave = !!draft && canEditCurrent && !saving && dirty;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, entryRes] = await Promise.all([
        fetch(workspacePath(`/api/work/plans?pageSize=500${showArchived ? "&archived=1" : ""}`)),
        fetch(workspacePath("/api/work/plan-members?pageSize=500")),
      ]);
      if (!projectRes.ok || !entryRes.ok) throw new Error("加载失败");
      const [projectData, entryData] = await Promise.all([projectRes.json(), entryRes.json()]);
      const nextProjects = (projectData.projects || []) as ProjectItem[];
      const nextEntries = (entryData.entries || []) as ProjectMemberEntry[];
      setProjects(nextProjects);
      setEntries(nextEntries);
      setSelection((prev) => nextProjects.some((project) => project.id === prev) ? prev : (nextProjects[0]?.id ?? null));
    } catch {
      setError("工作计划加载失败");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const nextDraft = selectedProject ? createProjectDraft(selectedProject, selectedEntries) : null;
    setDraft(nextDraft);
    setBaseline(draftSnapshot(nextDraft));
  }, [selectedEntries, selectedProject, selection]);

function updateDraft<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
  setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
}

function setLeader(option?: SearchOption) {
  const employee = employeeFromOption(option);
  setDraft((prev) => {
    if (!prev) return prev;
    const roleGroups = { ...prev.roleGroups };
    if (employee) {
      for (const role of MULTI_PROJECT_ROLES) {
        roleGroups[role] = roleGroups[role].filter((member) => member.id !== employee.id);
      }
    }
    return {
      ...prev,
      leader: employee,
      roleGroups,
    };
  });
}

function setRoleMembers(role: MultiProjectRole, members: EmployeeTag[]) {
  setDraft((prev) => {
    if (!prev) return prev;
    const nextMembers = dedupeMembers(members);
    const movedIds = new Set(nextMembers.map((member) => member.id));
    const roleGroups = { ...prev.roleGroups, [role]: nextMembers };
    for (const otherRole of MULTI_PROJECT_ROLES) {
      if (otherRole === role) continue;
      roleGroups[otherRole] = roleGroups[otherRole].filter((member) => !movedIds.has(member.id));
    }
    return {
      ...prev,
      leader: prev.leader && movedIds.has(prev.leader.id) ? null : prev.leader,
      roleGroups,
    };
  });
}

  async function updateProjectField(projectId: number, field: string, value: unknown) {
    const res = await fetch(workspacePath(`/api/work/plans/${projectId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "保存工作计划失败");
    }
  }

  async function createProject(name: string, leadingDepartmentId: number) {
    const res = await fetch(workspacePath("/api/work/plans"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        leadingDepartmentId,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "新建工作计划失败");
    }
    const data = await res.json();
    return Number(data.record?.id);
  }

  async function createPlanFromPanel() {
    const name = createDraft.name.trim();
    if (!name) {
      setToast({ type: "error", message: "计划名称不能为空" });
      return;
    }
    if (!createDraft.leadingDepartmentId) {
      setToast({ type: "error", message: "请选择主导部门" });
      return;
    }
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

  async function createMember(projectId: number, member: EmployeeTag, role: string | null) {
    const res = await fetch(workspacePath("/api/work/plan-members"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: member.employeeNumber,
        projectId,
        role,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "保存计划参与人失败");
    }
  }

  async function updateMemberRole(entryId: number, role: string | null) {
    const res = await fetch(workspacePath(`/api/work/plan-members/${entryId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "role", value: role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "保存计划负责人失败");
    }
  }

  async function deleteMember(entryId: number) {
    const res = await fetch(workspacePath(`/api/work/plan-members/${entryId}`), { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "删除计划参与人失败");
    }
  }

  async function syncMembers(projectId: number, nextDraft: ProjectDraft) {
    const currentEntries = entries.filter((entry) => entry.projectId === projectId);
    const targets = [
      ...(nextDraft.leader ? [{ member: nextDraft.leader, role: "负责人" as ProjectRole }] : []),
      ...MULTI_PROJECT_ROLES.flatMap((role) =>
        nextDraft.roleGroups[role].map((member) => ({ member, role })),
      ),
    ];
    const dedupedTargets = new Map<number, { member: EmployeeTag; role: ProjectRole }>();
    for (const target of targets) {
      if (!dedupedTargets.has(target.member.id)) dedupedTargets.set(target.member.id, target);
    }
    const targetIds = new Set(dedupedTargets.keys());
    const currentByEmployeeId = new Map(currentEntries.map((entry) => [entry.employeeId, entry]));

    for (const entry of currentEntries) {
      if (!targetIds.has(entry.employeeId)) {
        await deleteMember(entry.id);
      }
    }

    for (const { member, role } of dedupedTargets.values()) {
      const entry = currentByEmployeeId.get(member.id);
      if (!entry) {
        await createMember(projectId, member, role);
      } else if (normalizeProjectRole(entry.role) !== role) {
        await updateMemberRole(entry.id, role);
      }
    }
  }

  async function saveProject() {
    if (!draft || !draft.id || !dirty) return;
    const name = draft.name.trim();
    if (!name) {
      setToast({ type: "error", message: "计划名称不能为空" });
      return;
    }
    if (!draft.leadingDepartmentId) {
      setToast({ type: "error", message: "请选择主导部门" });
      return;
    }
    setSaving(true);
    try {
      const projectId = draft.id;
      if (selectedProject && selectedProject.name !== name) {
        await updateProjectField(projectId, "name", name);
      }
      if (selectedProject) {
        const fields = [
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
        for (const field of fields) {
          const value = draft[field] ?? null;
          if ((selectedProject[field] ?? null) !== value) {
            await updateProjectField(projectId, field, value);
          }
        }
      }
      await syncMembers(projectId, { ...draft, id: projectId, name });
      setToast({ type: "success", message: "工作计划信息已保存" });
      await loadData();
      setSelection(projectId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  function renderProjectListPanel(mode: SplitWorkspaceMode) {
    return (
      <PanelCard className={mode === "drawer" ? "h-full overflow-hidden" : ""}>
        <div className="border-b border-slate-200 p-3">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-slate-900">工作计划列表</h4>
                <p className="mt-1 text-xs text-slate-500">选择计划后维护主数据和人员角色。</p>
              </div>
              {mode === "drawer" && (
                <button
                  type="button"
                  onClick={() => setProjectListDrawerOpen(false)}
                  className={getToolbarActionClassName("secondary")}
                >
                  关闭
                </button>
              )}
            </div>
            <SearchInput
              value={keyword}
              onChange={setKeyword}
              placeholder="搜索计划名称、编码"
              size="page"
            />
          </div>
        </div>
        <div className={`${mode === "drawer" ? "h-[calc(100%-140px)]" : "max-h-[760px]"} space-y-2 overflow-auto p-3`}>
          {filteredProjects.map((project) => {
            const active = selection === project.id;
            return (
              <SelectorCard
                key={project.id}
                title={project.name}
                subtitle={projectCode(project, null)}
                active={active}
                archived={project.isArchived}
                trailing={`人 ${project.employeeCount}`}
                meta={[
                  ...(project.status ? [project.status] : []),
                  ...(project.priority ? [project.priority] : []),
                ]}
                onClick={() => {
                  setSelection(project.id);
                  setProjectListDrawerOpen(false);
                }}
              />
            );
          })}
          {filteredProjects.length === 0 && (
            <EmptyStateCard compact>暂无工作计划</EmptyStateCard>
          )}
        </div>
      </PanelCard>
    );
  }

  if (loading) return <EmptyStateCard>加载中...</EmptyStateCard>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <SplitWorkspaceToolbar
        sideOpen={projectListOpen}
        sideLabel="工作计划列表"
        onSideOpenChange={setProjectListOpen}
        onDrawerOpen={() => setProjectListDrawerOpen(true)}
      >
        <button
          type="button"
          disabled={!canEditCurrent}
          onClick={() => setCreatePanelOpen((open) => !open)}
          className={getToolbarActionClassName("primary")}
        >
          新建工作计划
        </button>
        <button
          type="button"
          onClick={() => {
            setShowArchived((value) => !value);
            setCreatePanelOpen(false);
          }}
          className={getToolbarActionClassName("secondary")}
        >
          {showArchived ? "现用计划" : "归档计划"}
        </button>
      </SplitWorkspaceToolbar>

      {createPanelOpen && (
        <InlineCreatePanel
          title="新建工作计划"
          onSubmit={() => void createPlanFromPanel()}
          onCancel={() => {
            setCreatePanelOpen(false);
            setCreateDraft({ name: "", leadingDepartmentId: null, leadingDepartmentName: null });
          }}
          submitDisabled={!createDraft.name.trim() || !createDraft.leadingDepartmentId}
          submitting={saving}
          fieldsClassName="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1.5fr)_minmax(320px,2fr)_180px_auto] lg:items-end"
        >
          <label className="space-y-1">
            <FieldLabel required>计划名称</FieldLabel>
            <TextField
              value={createDraft.name}
              disabled={!canEditCurrent || saving}
              onChange={(value) => setCreateDraft((prev) => ({ ...prev, name: value }))}
              placeholder="输入计划名称"
              className={inputClassName}
              unstyled
            />
          </label>
          <label className="space-y-1">
            <FieldLabel required>主导部门</FieldLabel>
            <EntitySearchInput
              entity="department"
              fkKey="work.plan.leadingDepartment"
              value={createDraft.leadingDepartmentId ? String(createDraft.leadingDepartmentId) : ""}
              displayValue={createDraft.leadingDepartmentName || ""}
              disabled={!canEditCurrent || saving}
              placeholder="搜索部门名称、编码"
              onChange={(_label, option) => setCreateDraft((prev) => ({
                ...prev,
                leadingDepartmentId: option?.id ?? null,
                leadingDepartmentName: option?.name ?? null,
              }))}
            />
          </label>
          <label className="space-y-1">
            <FieldLabel>计划编码</FieldLabel>
            <TextField
              value="保存后生成"
              disabled
              className={getReadOnlyFieldClassName("h-10 font-mono")}
              unstyled
            />
          </label>
        </InlineCreatePanel>
      )}

      <SplitWorkspace
        sideOpen={projectListOpen}
        drawerOpen={projectListDrawerOpen}
        onDrawerOpenChange={setProjectListDrawerOpen}
        renderSide={renderProjectListPanel}
      >
        <PanelCard className="bg-slate-50" bodyClassName="p-4">
          <ActionToolbar
            className="mb-4"
            leftSlot={
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{editorTitle}</h4>
                {showArchived && <p className="mt-1 text-xs text-slate-500">归档浏览为只读，可恢复后继续维护。</p>}
                {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
              </div>
            }
            secondaryActions={draft && selectedProject ? [{
              label: showArchived ? "恢复计划" : "归档计划",
              disabled: saving || !canEdit,
              onClick: () => void setProjectArchived(selectedProject.id, !showArchived),
            }] : []}
            primaryActions={draft && selectedProject && !showArchived ? [{
              label: saving ? "保存中..." : "保存计划",
              disabled: !canSave,
              onClick: saveProject,
            }] : []}
          />

          {draft ? (
            <div className="space-y-4">
              <SectionCard title="基础信息">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <FieldLabel>计划编码</FieldLabel>
                    <TextField
                      value={projectCode(selectedProject, draft)}
                      readOnly
                      className={getReadOnlyFieldClassName("h-10 cursor-default font-mono text-slate-600")}
                      unstyled
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel required>计划名称</FieldLabel>
                    <TextField
                      value={draft.name}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("name", value)}
                      className={inputClassName}
                      unstyled
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel required>主导部门</FieldLabel>
                    <EntitySearchInput
                      entity="department"
                      fkKey="work.plan.leadingDepartment"
                      value={draft.leadingDepartmentId ? String(draft.leadingDepartmentId) : ""}
                      displayValue={draft.leadingDepartmentName || ""}
                      disabled={!canEditCurrent}
                      placeholder="搜索部门名称、编码"
                      onChange={(_label, option) => {
                        updateDraft("leadingDepartmentId", option?.id ?? null);
                        updateDraft("leadingDepartmentName", option?.name ?? null);
                        updateDraft("leadingDepartmentCode", option?.subtitle ?? null);
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>计划状态</FieldLabel>
                    <OptionPicker
                      value={draft.status}
                      options={PROJECT_STATUS_PICKER_OPTIONS}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("status", value)}
                      placeholder="未设置"
                      buttonClassName={pickerButtonClassName}
                      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>优先级</FieldLabel>
                    <OptionPicker
                      value={draft.priority}
                      options={PROJECT_PRIORITY_PICKER_OPTIONS}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("priority", value)}
                      placeholder="未设置"
                      buttonClassName={pickerButtonClassName}
                      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>计划阶段</FieldLabel>
                    <OptionPicker
                      value={draft.stage}
                      options={PROJECT_STAGE_PICKER_OPTIONS}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("stage", value)}
                      placeholder="未设置"
                      buttonClassName={pickerButtonClassName}
                      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>上级计划</FieldLabel>
                    <OptionPicker
                      value={draft.parentId ? String(draft.parentId) : null}
                      options={parentPlanOptions}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("parentId", value ? Number(value) : null)}
                      placeholder="无上级计划"
                      searchPlaceholder="搜索工作计划"
                      visibleCount={6}
                      buttonClassName={pickerButtonClassName}
                      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>计划开始时间</FieldLabel>
                    <CalendarDateInput
                      value={draft.startDate}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("startDate", value)}
                      className={inputClassName}
                    />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>计划结束时间</FieldLabel>
                    <CalendarDateInput
                      value={draft.endDate}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("endDate", value)}
                      className={inputClassName}
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>说明</FieldLabel>
                    <TextareaField value={draft.description || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("description", value || null)} className={textareaClassName} />
                  </label>
                  <div className="space-y-1 md:col-span-2">
                    <FieldLabel>子计划</FieldLabel>
                    <div className={getReadOnlyFieldClassName("min-h-10 bg-slate-50 text-slate-600")}>
                      {childPlans.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {childPlans.map((child) => (
                            <span key={child.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {child.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">暂无子计划</span>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="规划与预算">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>计划规划</FieldLabel>
                    <TextareaField value={draft.plan || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("plan", value || null)} className={textareaClassName} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>计划目标</FieldLabel>
                    <TextareaField value={draft.goal || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("goal", value || null)} className={textareaClassName} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>关键里程碑</FieldLabel>
                    <TextareaField value={draft.milestones || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("milestones", value || null)} className={textareaClassName} />
                  </label>
                  <label className="space-y-1">
                    <FieldLabel>预算金额</FieldLabel>
                    <TextField
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.budgetAmount === null || draft.budgetAmount === undefined ? "" : String(draft.budgetAmount)}
                      disabled={!canEditCurrent}
                      onChange={(value) => updateDraft("budgetAmount", value === "" ? null : Number(value))}
                      className={inputClassName}
                      unstyled
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>预算说明</FieldLabel>
                    <TextareaField value={draft.budgetNote || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("budgetNote", value || null)} className={textareaClassName} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>风险说明</FieldLabel>
                    <TextareaField value={draft.riskNote || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("riskNote", value || null)} className={textareaClassName} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <FieldLabel>备注</FieldLabel>
                    <TextareaField value={draft.remark || ""} disabled={!canEditCurrent} onChange={(value) => updateDraft("remark", value || null)} className={textareaClassName} />
                  </label>
                </div>
              </SectionCard>

              <SectionCard title="计划人员">
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <FieldLabel>计划负责人</FieldLabel>
                    <EntitySearchInput
                      entity="employee"
                      fkKey="work.plan.member.employee"
                      activeOnly
                      value={draft.leader?.employeeNumber || ""}
                      displayValue={draft.leader?.name || ""}
                      disabled={!canEditCurrent}
                      placeholder="搜索负责人"
                      onChange={(_label, option) => setLeader(option)}
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {MULTI_PROJECT_ROLES.map((role) => (
                      <label key={role} className="block space-y-1">
                        <FieldLabel>{role}</FieldLabel>
                        <ProjectMemberTagsInput
                          value={draft.roleGroups[role]}
                          disabled={!canEditCurrent}
                          onChange={(members) => setRoleMembers(role, members)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center p-8">
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">暂无可编辑工作计划</p>
                <p className="mt-1 text-sm text-slate-400">请选择左侧计划，或新建工作计划后维护资料。</p>
              </div>
            </div>
          )}
        </PanelCard>
      </SplitWorkspace>

      <Toast
        type={toast?.type}
        message={toast?.message || ""}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
