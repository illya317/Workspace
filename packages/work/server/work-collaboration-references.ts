import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

type CollaborationScope = {
  actorUserId?: number | null;
  collaborationId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
};

export async function validateWorkCollaborationReference(input: CollaborationScope) {
  if (!input.collaborationId) return null;
  if (input.targetType !== "department" || !input.targetId) return "部门协作只能关联到负责部门的工作空间";
  const collaboration = await prisma.departmentCollaboration.findFirst({
    where: { id: input.collaborationId, responsibleDepartmentId: input.targetId, status: "active", isArchived: false },
    select: { id: true },
  });
  if (!collaboration) return "协作事项不存在、已停用，或不属于当前负责部门";
  if (!input.actorUserId || !(await userHasResponsibleCollaborationPosition(input.collaborationId, input.actorUserId))) {
    return "只有协作事项的负责岗位可以引用该协作";
  }
  return null;
}

export async function collaborationExecutorPositionIds(input: CollaborationScope) {
  if (!input.collaborationId || input.targetType !== "department" || !input.targetId) return [];
  const collaboration = await prisma.departmentCollaboration.findFirst({
    where: { id: input.collaborationId, responsibleDepartmentId: input.targetId, status: "active", isArchived: false },
    select: {
      enablingDepartments: { where: { responseStatus: "accepted" }, select: { departmentId: true } },
      positions: {
        where: { kind: "executor" },
        select: { positionId: true, position: { select: { departmentId: true } } },
      },
    },
  });
  if (!collaboration) return [];
  const acceptedDepartmentIds = new Set(collaboration.enablingDepartments.map((entry) => entry.departmentId));
  return collaboration.positions
    .filter((entry) => entry.position.departmentId && acceptedDepartmentIds.has(entry.position.departmentId))
    .map((entry) => entry.positionId);
}

export async function listDepartmentCollaborationReferenceOptions(input: {
  userId: number;
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
}): Promise<FkOption[]> {
  if (input.targetType !== "department" || !input.targetId) return [];
  const rows = await prisma.departmentCollaboration.findMany({
    where: {
      responsibleDepartmentId: input.targetId,
      status: "active",
      isArchived: false,
      positions: { some: { kind: "responsible", position: { edps: { some: currentUserEdpWhere(input.userId) } } } },
    },
    select: {
      id: true,
      title: true,
      enablingDepartments: {
        select: { responseStatus: true, department: { select: { name: true } } },
        orderBy: { department: { code: "asc" } },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 100 : 30,
  });
  return rows
    .map((row) => {
      const accepted = row.enablingDepartments.filter((entry) => entry.responseStatus === "accepted").map((entry) => entry.department.name);
      const pending = row.enablingDepartments.filter((entry) => entry.responseStatus === "pending").length;
      return {
        id: row.id,
        name: row.title,
        subtitle: [accepted.length ? `已接受：${accepted.join("、")}` : null, pending ? `${pending} 个部门待反馈` : null].filter(Boolean).join(" · "),
        lifecycleStatus: "active" as const,
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword));
}

export async function resolveDepartmentCollaborationReferenceOption(id: number) {
  const row = await prisma.departmentCollaboration.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, isArchived: true, responsibleDepartment: { select: { name: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    label: row.title,
    subtitle: row.responsibleDepartment.name,
    lifecycleStatus: row.isArchived ? "archived" as const : row.status === "active" ? "active" as const : "inactive" as const,
  };
}

async function userHasResponsibleCollaborationPosition(collaborationId: number, userId: number) {
  const match = await prisma.departmentCollaborationPosition.findFirst({
    where: {
      collaborationId,
      kind: "responsible",
      position: { edps: { some: currentUserEdpWhere(userId) } },
    },
    select: { id: true },
  });
  return Boolean(match);
}

function currentUserEdpWhere(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    employee: { userId, employments: { some: { isActive: true } } },
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}
