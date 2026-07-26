import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { sendNotification } from "@workspace/platform/server/notifications";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { canViewWorkTaskTarget } from "./access";
import {
  buildDepartmentCollaborationCreateCommand,
  buildDepartmentCollaborationResponseCommand,
  buildDepartmentCollaborationUpdateCommand,
  type DepartmentCollaborationCreateCommand,
  type DepartmentCollaborationUpdateCommand,
} from "./domain/department-collaboration-validation";

const collaborationInclude = {
  responsibleDepartment: { select: { id: true, code: true, name: true } },
  enablingDepartments: {
    include: { department: { select: { id: true, code: true, name: true } } },
    orderBy: { department: { code: "asc" as const } },
  },
  positions: {
    include: { position: { select: { id: true, code: true, name: true, departmentId: true, department: { select: { id: true, code: true, name: true } } } } },
    orderBy: [{ kind: "asc" as const }, { position: { code: "asc" as const } }],
  },
  workPlans: {
    where: { isArchived: false },
    select: { id: true, title: true, status: true, targetType: true, targetId: true, plannedStartDate: true, plannedEndDate: true },
    orderBy: { id: "desc" as const },
  },
  workItems: {
    where: { isArchived: false },
    select: { id: true, planId: true, content: true, status: true, targetType: true, targetId: true, plannedStartDate: true, plannedEndDate: true, owner: { select: { name: true } } },
    orderBy: { id: "desc" as const },
  },
} satisfies Prisma.DepartmentCollaborationInclude;

type CollaborationRow = Prisma.DepartmentCollaborationGetPayload<{ include: typeof collaborationInclude }>;

export async function listDepartmentCollaborations(input: { userId: number; departmentId: number }) {
  if (!(await canViewWorkTaskTarget(input.userId, "department", input.departmentId))) return serviceError("无权限访问该部门协作", 403);
  const [rows, departmentOptions, positionOptions] = await Promise.all([
    prisma.departmentCollaboration.findMany({
      where: {
        isArchived: false,
        OR: [
          {
            responsibleDepartmentId: input.departmentId,
            positions: { some: { kind: "responsible", position: { edps: { some: currentUserEdpWhere(input.userId) } } } },
          },
          { enablingDepartments: { some: { departmentId: input.departmentId } } },
        ],
      },
      include: collaborationInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.department.findMany({
      where: {
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    }),
    prisma.position.findMany({
      where: {
        departmentId: { not: null },
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        department: { isArchived: false, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      },
      select: { id: true, code: true, name: true, departmentId: true, department: { select: { code: true, name: true } } },
      orderBy: [{ department: { code: "asc" } }, { code: "asc" }],
    }),
  ]);
  return serviceOk({
    collaborations: rows.map((row) => toDepartmentCollaborationDto(row, input.departmentId)),
    departmentOptions,
    positionOptions: positionOptions.map((position) => ({
      id: position.id,
      code: position.code,
      name: position.name,
      departmentId: position.departmentId!,
      departmentCode: position.department!.code,
      departmentName: position.department!.name,
    })),
  });
}

export async function validateDepartmentCollaborationApprovalPayload(input: Record<string, unknown>) {
  return buildDepartmentCollaborationCreateCommand(input);
}

export async function validateDepartmentCollaborationUpdateApprovalPayload(collaborationId: unknown, input: Record<string, unknown>) {
  return buildDepartmentCollaborationUpdateCommand({ collaborationId, data: input });
}

export async function commitDepartmentCollaborationApproval(input: DepartmentCollaborationCreateCommand & { createdByUserId: number }) {
  const command = await buildDepartmentCollaborationCreateCommand(input as unknown as Record<string, unknown>);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const record = await prisma.departmentCollaboration.create({
    data: {
      title: command.data.title,
      description: command.data.description,
      collaborationType: command.data.collaborationType,
      triggerRule: command.data.triggerRule,
      scopeDescription: command.data.scopeDescription,
      inputRequirement: command.data.inputRequirement,
      deliverable: command.data.deliverable,
      acceptanceCriteria: command.data.acceptanceCriteria,
      responseTargetHours: command.data.responseTargetHours,
      deliveryTargetDays: command.data.deliveryTargetDays,
      effectiveFrom: command.data.effectiveFrom,
      effectiveTo: command.data.effectiveTo,
      escalationPolicy: command.data.escalationPolicy,
      responsibleDepartmentId: command.data.responsibleDepartmentId,
      createdByUserId: input.createdByUserId,
      enablingDepartments: {
        create: command.data.enablingDepartmentIds.map((departmentId) => ({ departmentId })),
      },
      positions: {
        create: [
          ...command.data.responsiblePositionIds.map((positionId) => ({ kind: "responsible", positionId })),
          ...command.data.executorPositionIds.map((positionId) => ({ kind: "executor", positionId })),
        ],
      },
    },
    include: collaborationInclude,
  });
  void notifyDepartmentCollaborationInvitations(record, input.createdByUserId);
  return serviceOk({ entityType: "work.department_collaboration", entityId: String(record.id) });
}

export async function commitDepartmentCollaborationUpdateApproval(input: DepartmentCollaborationUpdateCommand & { updatedByUserId: number }) {
  const command = await buildDepartmentCollaborationUpdateCommand({ collaborationId: input.collaborationId, data: input as unknown as Record<string, unknown> });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const existingDepartments = await prisma.departmentCollaborationDepartment.findMany({
    where: { collaborationId: command.data.collaborationId },
    select: { departmentId: true },
  });
  const existingDepartmentIds = new Set(existingDepartments.map((entry) => entry.departmentId));
  const addedDepartmentIds = command.data.enablingDepartmentIds.filter((departmentId) => !existingDepartmentIds.has(departmentId));
  const record = await prisma.$transaction(async (tx) => {
    await tx.departmentCollaboration.update({
      where: { id: command.data.collaborationId },
      data: {
        title: command.data.title,
        description: command.data.description,
        collaborationType: command.data.collaborationType,
        triggerRule: command.data.triggerRule,
        scopeDescription: command.data.scopeDescription,
        inputRequirement: command.data.inputRequirement,
        deliverable: command.data.deliverable,
        acceptanceCriteria: command.data.acceptanceCriteria,
        responseTargetHours: command.data.responseTargetHours,
        deliveryTargetDays: command.data.deliveryTargetDays,
        effectiveFrom: command.data.effectiveFrom,
        effectiveTo: command.data.effectiveTo,
        escalationPolicy: command.data.escalationPolicy,
      },
    });
    await tx.departmentCollaborationDepartment.deleteMany({
      where: { collaborationId: command.data.collaborationId, departmentId: { notIn: command.data.enablingDepartmentIds } },
    });
    if (addedDepartmentIds.length > 0) {
      await tx.departmentCollaborationDepartment.createMany({
        data: addedDepartmentIds.map((departmentId) => ({ collaborationId: command.data.collaborationId, departmentId })),
      });
    }
    await tx.departmentCollaborationPosition.deleteMany({ where: { collaborationId: command.data.collaborationId } });
    await tx.departmentCollaborationPosition.createMany({
      data: [
        ...command.data.responsiblePositionIds.map((positionId) => ({ collaborationId: command.data.collaborationId, kind: "responsible", positionId })),
        ...command.data.executorPositionIds.map((positionId) => ({ collaborationId: command.data.collaborationId, kind: "executor", positionId })),
      ],
    });
    return tx.departmentCollaboration.findUnique({ where: { id: command.data.collaborationId }, include: collaborationInclude });
  });
  if (!record) return serviceError("协作事项不存在", 404);
  if (addedDepartmentIds.length > 0) void notifyDepartmentCollaborationInvitations(record, input.updatedByUserId, new Set(addedDepartmentIds));
  return serviceOk({ entityType: "work.department_collaboration", entityId: String(record.id) });
}

export async function respondDepartmentCollaboration(input: {
  userId: number;
  collaborationId: number;
  departmentId: number;
  action: "accept" | "reject";
  note?: string | null;
}) {
  const command = await buildDepartmentCollaborationResponseCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const now = new Date();
  const applied = await prisma.$transaction(async (tx) => {
    const updated = await tx.departmentCollaborationDepartment.updateMany({
      where: {
        collaborationId: command.data.collaborationId,
        departmentId: command.data.departmentId,
        responseStatus: "pending",
      },
      data: {
        responseStatus: command.data.responseStatus,
        responseNote: command.data.responseNote,
        respondedByUserId: command.data.respondedByUserId,
        respondedAt: now,
      },
    });
    if (updated.count !== 1) return false;
    const payloadNeedle = `\"collaborationId\":${command.data.collaborationId}`;
    const departmentNeedle = `\"departmentId\":${command.data.departmentId}`;
    await tx.notification.updateMany({
      where: {
        type: "work.department.collaboration.invited",
        payloadJson: { contains: payloadNeedle },
        AND: { payloadJson: { contains: departmentNeedle } },
        acknowledgedAt: null,
        rejectedAt: null,
      },
      data: command.data.responseStatus === "accepted"
        ? { readAt: now, acknowledgedAt: now, rejectedAt: null }
        : { readAt: now, acknowledgedAt: null, rejectedAt: now },
    });
    return true;
  });
  if (!applied) return serviceError("协作事项已被其他人处理", 409);
  const row = await prisma.departmentCollaboration.findUnique({ where: { id: input.collaborationId }, include: collaborationInclude });
  return row ? serviceOk({ collaboration: toDepartmentCollaborationDto(row, input.departmentId) }) : serviceError("协作事项不存在", 404);
}

function toDepartmentCollaborationDto(row: CollaborationRow, currentDepartmentId: number) {
  const currentRelation = row.enablingDepartments.find((entry) => entry.departmentId === currentDepartmentId) ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    collaborationType: row.collaborationType,
    triggerRule: row.triggerRule,
    scopeDescription: row.scopeDescription,
    inputRequirement: row.inputRequirement,
    deliverable: row.deliverable,
    acceptanceCriteria: row.acceptanceCriteria,
    responseTargetHours: row.responseTargetHours,
    deliveryTargetDays: row.deliveryTargetDays,
    effectiveFrom: formatDate(row.effectiveFrom),
    effectiveTo: formatDate(row.effectiveTo),
    escalationPolicy: row.escalationPolicy,
    status: row.status,
    isArchived: row.isArchived,
    responsibleDepartment: row.responsibleDepartment,
    role: row.responsibleDepartmentId === currentDepartmentId ? "responsible" as const : "enabling" as const,
    currentResponseStatus: currentRelation?.responseStatus ?? null,
    enablingDepartments: row.enablingDepartments.map((entry) => ({
      id: entry.id,
      departmentId: entry.departmentId,
      departmentCode: entry.department.code,
      departmentName: entry.department.name,
      responseStatus: entry.responseStatus,
      responseNote: entry.responseNote,
      respondedAt: entry.respondedAt?.toISOString() ?? null,
    })),
    responsiblePositions: row.positions.filter((entry) => entry.kind === "responsible").map((entry) => ({
      id: entry.position.id,
      code: entry.position.code,
      name: entry.position.name,
      departmentId: entry.position.departmentId,
      departmentCode: entry.position.department?.code ?? null,
      departmentName: entry.position.department?.name ?? null,
    })),
    executorPositions: row.positions.filter((entry) => entry.kind === "executor").map((entry) => ({
      id: entry.position.id,
      code: entry.position.code,
      name: entry.position.name,
      departmentId: entry.position.departmentId,
      departmentCode: entry.position.department?.code ?? null,
      departmentName: entry.position.department?.name ?? null,
    })),
    workPlans: row.workPlans.map((plan) => ({ ...plan, plannedStartDate: formatDate(plan.plannedStartDate), plannedEndDate: formatDate(plan.plannedEndDate) })),
    workItems: row.workItems.map((item) => ({ ...item, ownerEmployeeName: item.owner?.name ?? null, owner: undefined, plannedStartDate: formatDate(item.plannedStartDate), plannedEndDate: formatDate(item.plannedEndDate) })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function notifyDepartmentCollaborationInvitations(row: CollaborationRow, actorUserId: number, departmentIds?: ReadonlySet<number>) {
  const recipientsByDepartment = await Promise.all(row.enablingDepartments
    .filter((entry) => !departmentIds || departmentIds.has(entry.departmentId))
    .map(async (entry) => ({
    entry,
    userIds: await collaborationDepartmentRecipientUserIds(entry.departmentId),
  })));
  await Promise.all(recipientsByDepartment.flatMap(({ entry, userIds }) => userIds.map((recipientUserId) => sendNotification({
    recipientUserId,
    actorUserId,
    type: "work.department.collaboration.invited",
    payload: {
      collaborationId: row.id,
      departmentId: entry.departmentId,
      collaborationTitle: row.title,
      responsibleDepartmentName: row.responsibleDepartment.name,
    },
  }).catch((error) => console.error("Failed to send department collaboration invitation", error)))));
}

async function collaborationDepartmentRecipientUserIds(departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      managerPositionId: true,
      managerEmployees: { select: { employee: { select: { userId: true } } } },
      workAssignees: { where: { kind: "task" }, select: { userId: true } },
    },
  });
  if (!department) return [];
  const managerPositionUsers = department.managerPositionId
    ? await prisma.eDP.findMany({
        where: currentOpenEndedDateWhere({
          departmentId,
          positionId: department.managerPositionId,
          employee: { userId: { not: null }, employments: { some: currentEmploymentDateWhere() } },
        }),
        select: { employee: { select: { userId: true } } },
      })
    : [];
  const preferred = [
    ...department.managerEmployees.flatMap((entry) => entry.employee.userId ? [entry.employee.userId] : []),
    ...department.workAssignees.map((entry) => entry.userId),
    ...managerPositionUsers.flatMap((entry) => entry.employee.userId ? [entry.employee.userId] : []),
  ];
  if (preferred.length > 0) return uniqueIds(preferred);
  const fallback = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: currentEmploymentDateWhere() },
      positions: { some: currentOpenEndedDateWhere({ departmentId }) },
    },
    select: { userId: true },
  });
  return uniqueIds(fallback.flatMap((employee) => employee.userId ? [employee.userId] : []));
}

function uniqueIds(ids: number[]) {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

function currentUserEdpWhere(userId: number) {
  return currentOpenEndedDateWhere({
    employee: { userId, employments: { some: currentEmploymentDateWhere() } },
  });
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}
