import { workspacePath } from "@workspace/core/routing";
import {
  MULTI_PROJECT_ROLES,
  normalizeProjectRole,
  type EmployeeTag,
  type ProjectDraft,
  type ProjectItem,
  type ProjectMemberEntry,
  type ProjectRole,
  type ProjectTaskDraft,
  type ProjectTaskItem,
} from "./model";
import type { ProjectGanttData } from "./gantt-model";
import type {
  ProjectPlanBaselineSummary,
  ProjectPlanDependency,
  ProjectPlanGanttData,
  ProjectPlanItem,
  ProjectPlanPhaseItem,
} from "./plan-gantt-model";

export async function createProject(draft: ProjectDraft) {
  const res = await fetch(workspacePath("/api/modules/work/projects"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: draft.name,
      description: draft.description,
      projectType: draft.projectType,
      parentProjectTaskId: draft.parentProjectTaskId,
      projectLevel: draft.projectLevel,
      plan: draft.plan,
      goal: draft.goal,
      milestones: draft.milestones,
      budgetAmount: draft.budgetAmount,
      budgetNote: draft.budgetNote,
      riskNote: draft.riskNote,
      remark: draft.remark,
      leadingDepartmentId: draft.leadingDepartmentId,
      baselineStartDate: draft.parentProjectTaskId ? null : draft.baselineStartDate,
      baselineEndDate: draft.parentProjectTaskId ? null : draft.baselineEndDate,
      startDate: draft.parentProjectTaskId ? null : draft.startDate,
      endDate: draft.parentProjectTaskId ? null : draft.endDate,
      completionPercent: draft.completionPercent,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "新建项目失败");
  }
  const data = await res.json();
  return Number(data.record?.id);
}

export async function listProjectOptions() {
  const res = await fetch(workspacePath("/api/modules/work/projects?pageSize=500"));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "加载项目列表失败");
  }
  const data = await res.json();
  return (data.projects || []) as ProjectItem[];
}

export async function updateProjectField(projectId: number, field: string, value: unknown) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, value }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存项目失败");
  }
}

export async function deleteProject(projectId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "删除项目失败");
  }
}

async function createMember(projectId: number, member: EmployeeTag, role: string | null) {
  const res = await fetch(workspacePath("/api/modules/work/projects/members"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNumber: member.employeeNumber, projectId, role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存项目参与人失败");
  }
}

async function updateMemberRole(entryId: number, role: string | null) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/members/${entryId}`), {
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
  const res = await fetch(workspacePath(`/api/modules/work/projects/members/${entryId}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "删除项目参与人失败");
  }
}

export async function syncMembers(projectId: number, nextDraft: ProjectDraft, entries: ProjectMemberEntry[]) {
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
    if (!targetIds.has(entry.employeeId)) await deleteMember(entry.id);
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

function projectTaskPayload(draft: ProjectTaskDraft) {
  return {
    name: draft.name,
    description: draft.description,
    isMilestone: draft.isMilestone,
    ownerEmployeeId: draft.ownerEmployeeId,
    baselineStartDate: draft.baselineStartDate,
    baselineEndDate: draft.baselineEndDate,
    startDate: draft.startDate,
    endDate: draft.endDate,
    predecessorTaskIds: draft.predecessorTaskIds,
    planPhaseId: draft.planPhaseId,
    assignees: draft.assignees.map((assignee) => ({
      employeeId: assignee.employeeId,
      role: assignee.role,
    })),
    sortOrder: draft.sortOrder,
  };
}

export async function listProjectTasks(projectId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/tasks`));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "加载项目任务失败");
  }
  const data = await res.json();
  return (data.tasks || []) as ProjectTaskItem[];
}

export async function listProjectGantt(includeTasks: boolean) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/gantt?includeTasks=${includeTasks ? "1" : "0"}`));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "加载项目甘特失败");
  }
  return await res.json() as ProjectGanttData;
}

export async function createProjectTask(projectId: number, draft: ProjectTaskDraft) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/tasks`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectTaskPayload(draft)),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "新建项目任务失败");
  }
}

export async function updateProjectTask(projectId: number, taskId: number, draft: ProjectTaskDraft) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/tasks/${taskId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(projectTaskPayload(draft)),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存项目任务失败");
  }
}

export async function deleteProjectTask(projectId: number, taskId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/tasks/${taskId}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "删除项目任务失败");
  }
}

export async function listProjectPlanGantt(projectId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-gantt`));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "加载项目甘特失败");
  }
  return await res.json() as ProjectPlanGanttData;
}

export async function saveProjectPlanGantt(projectId: number, items: Array<Pick<ProjectPlanItem, "kind" | "id" | "startDate" | "endDate" | "phaseId">>) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-gantt`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存项目甘特失败");
  }
}

export async function saveProjectPlanDependencies(projectId: number, dependencies: ProjectPlanDependency[]) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-dependencies`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dependencies }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存计划依赖失败");
  }
}

function planPhasePayload(phase: Partial<ProjectPlanPhaseItem>) {
  return {
    sequenceNo: phase.sequenceNo,
    name: phase.name,
    startDate: phase.startDate,
    endDate: phase.endDate,
    note: phase.note,
  };
}

export async function createProjectPlanPhase(projectId: number, phase: Partial<ProjectPlanPhaseItem>) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-phases`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(planPhasePayload(phase)),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "新建项目阶段失败");
  }
}

export async function updateProjectPlanPhase(projectId: number, phaseId: number, phase: Partial<ProjectPlanPhaseItem>) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-phases/${phaseId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(planPhasePayload(phase)),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存项目阶段失败");
  }
}

export async function deleteProjectPlanPhase(projectId: number, phaseId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-phases/${phaseId}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "删除项目阶段失败");
  }
}

export async function listProjectPlanBaselines(projectId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-baselines`));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "加载计划基准失败");
  }
  const data = await res.json();
  return (data.baselines || []) as ProjectPlanBaselineSummary[];
}

export async function createProjectPlanBaseline(projectId: number, body: { name?: string; note?: string | null } = {}) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-baselines`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存计划基准失败");
  }
}

export async function activateProjectPlanBaseline(projectId: number, baselineId: number) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-baselines/${baselineId}/activate`), { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "切换计划基准失败");
  }
}
