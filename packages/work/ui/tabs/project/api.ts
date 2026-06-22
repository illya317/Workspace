import { workspacePath } from "@workspace/core/routing";
import {
  MULTI_PROJECT_ROLES,
  normalizeProjectRole,
  type EmployeeTag,
  type ProjectDraft,
  type ProjectMemberEntry,
  type ProjectRole,
} from "./model";

export async function createProject(draft: ProjectDraft) {
  const res = await fetch(workspacePath("/api/modules/work/projects"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectType: draft.projectType,
      name: draft.name,
      description: draft.description,
      status: draft.status,
      isMilestone: draft.isMilestone,
      stage: draft.stage,
      plan: draft.plan,
      goal: draft.goal,
      milestones: draft.milestones,
      budgetAmount: draft.budgetAmount,
      budgetNote: draft.budgetNote,
      riskNote: draft.riskNote,
      remark: draft.remark,
      parentId: draft.parentId,
      leadingDepartmentId: draft.leadingDepartmentId,
      startDate: draft.startDate,
      endDate: draft.endDate,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "新建项目失败");
  }
  const data = await res.json();
  return Number(data.record?.id);
}

export async function createSubproject(input: { name: string; parentId: number; leadingDepartmentId?: number | null; leader?: EmployeeTag | null; endDate?: string | null }) {
  const res = await fetch(workspacePath("/api/modules/work/projects"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectType: "subproject",
      name: input.name,
      parentId: input.parentId,
      leadingDepartmentId: input.leadingDepartmentId ?? null,
      leaderEmployeeId: input.leader?.id ?? null,
      endDate: input.endDate ?? null,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "新建子项目失败");
  }
  const data = await res.json();
  return Number(data.record?.id);
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

export async function syncChildProjects(projectId: number, childProjectIds: number[]) {
  const res = await fetch(workspacePath(`/api/modules/work/projects/${projectId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field: "childProjectIds", value: childProjectIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "保存子项目失败");
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
