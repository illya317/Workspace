"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Toast from "@/app/components/Toast";
import CalendarDateInput from "@/app/hr/components/CalendarDateInput";
import EntitySearchInput, { type SearchOption } from "@/app/hr/components/EntitySearchInput";
import { workspacePath } from "@/app/lib/api-path";
import { type HRUser, hrCanEdit } from "@/app/hr/types";
import { matchText } from "@/lib/search";

type ProjectItem = {
  id: number;
  name: string;
  type: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  employeeCount: number;
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

type ProjectDraft = {
  id: number | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  leader: EmployeeTag | null;
  members: EmployeeTag[];
};

function projectCode(project: ProjectItem | null, draft: ProjectDraft | null) {
  const id = project?.id ?? draft?.id;
  return id ? `MK-${String(id).padStart(4, "0")}` : "保存后生成";
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <span className="text-xs font-medium text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
}

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
  return role === "负责人" || role === "项目负责人";
}

function draftSnapshot(draft: ProjectDraft | null) {
  if (!draft) return "";
  return JSON.stringify({
    id: draft.id,
    name: draft.name.trim(),
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    leaderId: draft.leader?.id ?? null,
    memberIds: draft.members.map((member) => member.id).sort((a, b) => a - b),
  });
}

function createProjectDraft(project: ProjectItem | null, entries: ProjectMemberEntry[]): ProjectDraft {
  const leaderEntry = entries.find((entry) => isLeaderRole(entry.role));
  const members = dedupeMembers(entries.map(memberFromEntry));
  return {
    id: project?.id ?? null,
    name: project?.name ?? "",
    startDate: project?.startDate ?? null,
    endDate: project?.endDate ?? null,
    leader: leaderEntry ? memberFromEntry(leaderEntry) : null,
    members,
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
    <div className="min-h-10 rounded-md border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((member) => (
          <span
            key={member.id}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm"
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

export default function ProjectTab({ user }: { user: HRUser }) {
  const canEdit = hrCanEdit(user);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [entries, setEntries] = useState<ProjectMemberEntry[]>([]);
  const [selection, setSelection] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const isCreating = selection === "new";
  const dirty = draftSnapshot(draft) !== baseline;
  const editorTitle = isCreating ? "新建项目" : selectedProject ? "项目信息" : "项目详情";
  const canSave = !!draft && canEdit && !saving && (isCreating || dirty);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, entryRes] = await Promise.all([
        fetch(workspacePath("/api/hr/projects?pageSize=500")),
        fetch(workspacePath("/api/hr/employee-projects?pageSize=500")),
      ]);
      if (!projectRes.ok || !entryRes.ok) throw new Error("加载失败");
      const [projectData, entryData] = await Promise.all([projectRes.json(), entryRes.json()]);
      const nextProjects = (projectData.projects || []) as ProjectItem[];
      const nextEntries = (entryData.entries || []) as ProjectMemberEntry[];
      setProjects(nextProjects);
      setEntries(nextEntries);
      setSelection((prev) => prev ?? (nextProjects[0]?.id ?? null));
    } catch {
      setError("项目加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const nextDraft = selection === "new"
      ? createProjectDraft(null, [])
      : selectedProject
        ? createProjectDraft(selectedProject, selectedEntries)
        : null;
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
      return {
        ...prev,
        leader: employee,
        members: employee ? dedupeMembers([employee, ...prev.members]) : prev.members,
      };
    });
  }

  async function updateProjectField(projectId: number, field: string, value: unknown) {
    const res = await fetch(workspacePath(`/api/hr/projects/${projectId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "保存项目失败");
    }
  }

  async function createProject(name: string) {
    const res = await fetch(workspacePath("/api/hr/projects"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: "project", startDate: draft?.startDate || null, endDate: draft?.endDate || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "新建项目失败");
    }
    const data = await res.json();
    return Number(data.record?.id);
  }

  async function createMember(projectId: number, member: EmployeeTag, role: string | null) {
    const res = await fetch(workspacePath("/api/hr/employee-projects"), {
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
      throw new Error(data.error || "保存项目参与人失败");
    }
  }

  async function updateMemberRole(entryId: number, role: string | null) {
    const res = await fetch(workspacePath(`/api/hr/employee-projects/${entryId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "role", value: role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "保存项目负责人失败");
    }
  }

  async function deleteMember(entryId: number) {
    const res = await fetch(workspacePath(`/api/hr/employee-projects/${entryId}`), { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "删除项目参与人失败");
    }
  }

  async function syncMembers(projectId: number, nextDraft: ProjectDraft) {
    const currentEntries = entries.filter((entry) => entry.projectId === projectId);
    const targetMembers = dedupeMembers(nextDraft.leader ? [nextDraft.leader, ...nextDraft.members] : nextDraft.members);
    const targetIds = new Set(targetMembers.map((member) => member.id));
    const currentByEmployeeId = new Map(currentEntries.map((entry) => [entry.employeeId, entry]));

    for (const entry of currentEntries) {
      if (!targetIds.has(entry.employeeId)) {
        await deleteMember(entry.id);
      }
    }

    for (const member of targetMembers) {
      const entry = currentByEmployeeId.get(member.id);
      const role = nextDraft.leader?.id === member.id ? "负责人" : null;
      if (!entry) {
        await createMember(projectId, member, role);
      } else if ((entry.role || null) !== role && (isLeaderRole(entry.role) || role === "负责人")) {
        await updateMemberRole(entry.id, role);
      }
    }
  }

  async function saveProject() {
    if (!draft || (!isCreating && !dirty)) return;
    const name = draft.name.trim();
    if (!name) {
      setToast({ type: "error", message: "项目名称不能为空" });
      return;
    }
    setSaving(true);
    try {
      const projectId = draft.id ?? await createProject(name);
      if (!projectId) throw new Error("新建项目失败");
      if (draft.id && selectedProject && selectedProject.name !== name) {
        await updateProjectField(projectId, "name", name);
      }
      if (draft.id && selectedProject && selectedProject.startDate !== draft.startDate) {
        await updateProjectField(projectId, "startDate", draft.startDate || null);
      }
      if (draft.id && selectedProject && selectedProject.endDate !== draft.endDate) {
        await updateProjectField(projectId, "endDate", draft.endDate || null);
      }
      await syncMembers(projectId, { ...draft, id: projectId, name });
      setToast({ type: "success", message: "项目信息已保存" });
      await loadData();
      setSelection(projectId);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">加载中...</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">项目资料</h3>
          <p className="mt-1 text-sm text-slate-500">项目主数据和参与人员维护。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">项目列表</h4>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setSelection("new")}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                新建项目
              </button>
            </div>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索项目名称、编码"
              className="mt-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="max-h-[640px] space-y-2 overflow-auto p-3">
            {filteredProjects.map((project) => {
              const active = selection === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelection(project.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                    active
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{project.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{projectCode(project, null)}</div>
                    </div>
                    <span className="shrink-0 rounded bg-white px-2 py-1 text-xs text-slate-500">人 {project.employeeCount}</span>
                  </div>
                </button>
              );
            })}
            {filteredProjects.length === 0 && (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">暂无项目</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">{editorTitle}</h4>
              {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
            </div>
            {draft && (
              <button
                type="button"
                disabled={!canSave}
                onClick={saveProject}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "保存中..." : "保存项目"}
              </button>
            )}
          </div>

          {draft ? (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <FieldLabel>项目编码</FieldLabel>
                  <input
                    value={projectCode(selectedProject, draft)}
                    readOnly
                    className="h-10 w-full cursor-default rounded-md border border-slate-300 bg-slate-50 px-3 font-mono text-sm text-slate-600 shadow-sm"
                  />
                </label>
                <label className="space-y-1">
                  <FieldLabel required>项目名称</FieldLabel>
                  <input
                    value={draft.name}
                    disabled={!canEdit}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <FieldLabel>项目开始时间</FieldLabel>
                  <CalendarDateInput
                    value={draft.startDate}
                    disabled={!canEdit}
                    onChange={(value) => updateDraft("startDate", value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <label className="space-y-1">
                  <FieldLabel>项目结束时间</FieldLabel>
                  <CalendarDateInput
                    value={draft.endDate}
                    disabled={!canEdit}
                    onChange={(value) => updateDraft("endDate", value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <FieldLabel>项目负责人</FieldLabel>
                <EntitySearchInput
                  entity="employee"
                  activeOnly
                  value={draft.leader?.employeeNumber || ""}
                  displayValue={draft.leader?.name || ""}
                  disabled={!canEdit}
                  placeholder="搜索负责人"
                  onChange={(_label, option) => setLeader(option)}
                />
              </label>

              <label className="block space-y-1">
                <FieldLabel>项目参与人</FieldLabel>
                <ProjectMemberTagsInput
                  value={draft.members}
                  disabled={!canEdit}
                  onChange={(members) => updateDraft("members", members)}
                />
              </label>
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center p-8">
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">暂无可编辑项目</p>
                <p className="mt-1 text-sm text-slate-400">请选择左侧项目，或新建项目后维护资料。</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <Toast
        type={toast?.type}
        message={toast?.message || ""}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
