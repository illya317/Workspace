import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { canUpdateWorkTaskAction } from "../access";

export const DEPARTMENT_COLLABORATION_TYPES = ["routine", "periodic", "event", "temporary"] as const;
export type DepartmentCollaborationType = (typeof DEPARTMENT_COLLABORATION_TYPES)[number];

export type DepartmentCollaborationCreateCommand = {
  title: string;
  description: string;
  collaborationType: DepartmentCollaborationType;
  triggerRule: string;
  scopeDescription: string;
  inputRequirement: string;
  deliverable: string;
  acceptanceCriteria: string;
  responseTargetHours: number | null;
  deliveryTargetDays: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  escalationPolicy: string;
  responsibleDepartmentId: number;
  enablingDepartmentIds: number[];
  responsiblePositionIds: number[];
  executorPositionIds: number[];
};

export type DepartmentCollaborationUpdateCommand = DepartmentCollaborationCreateCommand & {
  collaborationId: number;
};

export type DepartmentCollaborationResponseCommand = {
  collaborationId: number;
  departmentId: number;
  responseStatus: "accepted" | "rejected";
  responseNote: string;
  respondedByUserId: number;
};

export async function buildDepartmentCollaborationCreateCommand(
  input: Record<string, unknown>,
): Promise<DomainValidationResult<DepartmentCollaborationCreateCommand>> {
  const base = parseAgreementFields(input);
  if (!base.ok) return base;
  const responsibleDepartmentId = positiveId(input.responsibleDepartmentId);
  if (!responsibleDepartmentId) return failCommand("负责部门无效", 400, "responsibleDepartmentId");
  const enablingDepartmentIds = uniquePositiveIds(input.enablingDepartmentIds);
  if (enablingDepartmentIds.length === 0) return failCommand("至少选择一个赋能部门", 400, "enablingDepartmentIds");
  if (enablingDepartmentIds.includes(responsibleDepartmentId)) return failCommand("负责部门不能同时作为赋能部门", 400, "enablingDepartmentIds");
  const responsiblePositionIds = uniquePositiveIds(input.responsiblePositionIds);
  if (responsiblePositionIds.length === 0) return failCommand("至少选择一个负责岗位", 400, "responsiblePositionIds");
  const executorPositionIds = uniquePositiveIds(input.executorPositionIds);
  if (executorPositionIds.length === 0) return failCommand("至少选择一个执行岗位", 400, "executorPositionIds");

  const departmentIds = [responsibleDepartmentId, ...enablingDepartmentIds];
  const [departments, positions] = await Promise.all([
    prisma.department.findMany({
      where: { id: { in: departmentIds }, isArchived: false, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { id: true },
    }),
    prisma.position.findMany({
      where: {
        id: { in: [...responsiblePositionIds, ...executorPositionIds] },
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { id: true, departmentId: true },
    }),
  ]);
  if (departments.length !== departmentIds.length) return failCommand("负责部门或赋能部门不存在或已失效", 400);
  if (positions.length !== responsiblePositionIds.length + executorPositionIds.length) return failCommand("负责岗位或执行岗位不存在或已失效", 400);
  const positionDepartment = new Map(positions.map((position) => [position.id, position.departmentId]));
  if (responsiblePositionIds.some((positionId) => positionDepartment.get(positionId) !== responsibleDepartmentId)) {
    return failCommand("负责岗位只能选择负责部门下的岗位", 400, "responsiblePositionIds");
  }
  if (executorPositionIds.some((positionId) => !enablingDepartmentIds.includes(positionDepartment.get(positionId) ?? -1))) {
    return failCommand("执行岗位只能选择赋能部门下的岗位", 400, "executorPositionIds");
  }
  return okCommand({
    ...base.data,
    responsibleDepartmentId,
    enablingDepartmentIds,
    responsiblePositionIds,
    executorPositionIds,
  });
}

export async function buildDepartmentCollaborationUpdateCommand(input: {
  collaborationId: unknown;
  data: Record<string, unknown>;
}): Promise<DomainValidationResult<DepartmentCollaborationUpdateCommand>> {
  const collaborationId = positiveId(input.collaborationId);
  if (!collaborationId) return failCommand("协作事项无效", 400, "collaborationId");
  const existing = await prisma.departmentCollaboration.findUnique({
    where: { id: collaborationId },
    select: {
      responsibleDepartmentId: true,
      status: true,
      isArchived: true,
      triggerRule: true,
      scopeDescription: true,
      inputRequirement: true,
      deliverable: true,
      acceptanceCriteria: true,
      responseTargetHours: true,
      deliveryTargetDays: true,
      escalationPolicy: true,
      enablingDepartments: { select: { departmentId: true, responseStatus: true } },
      positions: { where: { kind: "executor" }, select: { positionId: true } },
      workPlans: { where: { isArchived: false, ownerEmployeeId: { not: null } }, select: { ownerEmployeeId: true } },
      workItems: { where: { isArchived: false, ownerEmployeeId: { not: null } }, select: { ownerEmployeeId: true } },
    },
  });
  if (!existing || existing.isArchived) return failCommand("协作事项不存在", 404);
  if (existing.status !== "active") return failCommand("协作事项当前不可编辑", 409);
  const requestedDepartmentId = positiveId(input.data.responsibleDepartmentId);
  if (requestedDepartmentId && requestedDepartmentId !== existing.responsibleDepartmentId) {
    return failCommand("负责部门不可修改", 400, "responsibleDepartmentId");
  }
  const base = await buildDepartmentCollaborationCreateCommand({
    ...input.data,
    responsibleDepartmentId: existing.responsibleDepartmentId,
    triggerRule: existing.triggerRule,
    scopeDescription: existing.scopeDescription,
    inputRequirement: existing.inputRequirement,
    deliverable: existing.deliverable,
    acceptanceCriteria: existing.acceptanceCriteria,
    responseTargetHours: existing.responseTargetHours,
    deliveryTargetDays: existing.deliveryTargetDays,
    escalationPolicy: existing.escalationPolicy,
  });
  if (!base.ok) return base;
  const executorScopeChanged = !sameIdSet(existing.enablingDepartments.map((entry) => entry.departmentId), base.data.enablingDepartmentIds)
    || !sameIdSet(existing.positions.map((entry) => entry.positionId), base.data.executorPositionIds);
  if (executorScopeChanged) {
    const ownerCompatibility = await validateLinkedOwnerCompatibility(existing, base.data);
    if (!ownerCompatibility.ok) return ownerCompatibility;
  }
  return okCommand({ ...base.data, collaborationId });
}

export async function buildDepartmentCollaborationResponseCommand(input: {
  userId: number;
  collaborationId: unknown;
  departmentId: unknown;
  action: unknown;
  note?: unknown;
}): Promise<DomainValidationResult<DepartmentCollaborationResponseCommand>> {
  const collaborationId = positiveId(input.collaborationId);
  const departmentId = positiveId(input.departmentId);
  if (!collaborationId || !departmentId) return failCommand("协作事项无效", 400);
  const responseStatus = input.action === "accept" ? "accepted" : input.action === "reject" ? "rejected" : null;
  if (!responseStatus) return failCommand("协作响应无效", 400, "action");
  const responseNote = stringValue(input.note);
  if (responseNote.length > 500) return failCommand("响应说明不能超过 500 个字", 400, "note");
  const relation = await prisma.departmentCollaborationDepartment.findUnique({
    where: { collaborationId_departmentId: { collaborationId, departmentId } },
    select: { responseStatus: true, collaboration: { select: { isArchived: true, status: true } } },
  });
  if (!relation || relation.collaboration.isArchived) return failCommand("协作事项不存在", 404);
  if (relation.collaboration.status !== "active") return failCommand("协作事项当前不可响应", 409);
  if (relation.responseStatus !== "pending") return failCommand("该部门已经反馈过协作事项", 409);
  if (!(await canUpdateWorkTaskAction(input.userId, "department", departmentId))) {
    return failCommand("无权代表该部门响应协作事项", 403);
  }
  return okCommand({ collaborationId, departmentId, responseStatus, responseNote, respondedByUserId: input.userId });
}

function parseAgreementFields(input: Record<string, unknown>): DomainValidationResult<Omit<
  DepartmentCollaborationCreateCommand,
  "responsibleDepartmentId" | "enablingDepartmentIds" | "responsiblePositionIds" | "executorPositionIds"
>> {
  const title = stringValue(input.title);
  if (!title) return failCommand("协作名称不能为空", 400, "title");
  if (title.length > 120) return failCommand("协作名称不能超过 120 个字", 400, "title");
  const description = stringValue(input.description);
  if (description.length > 500) return failCommand("协作摘要不能超过 500 个字", 400, "description");
  const collaborationType = stringValue(input.collaborationType) || "routine";
  if (!isCollaborationType(collaborationType)) return failCommand("协作类型无效", 400, "collaborationType");
  const triggerRule = stringValue(input.triggerRule);
  const scopeDescription = stringValue(input.scopeDescription);
  const inputRequirement = stringValue(input.inputRequirement);
  const deliverable = stringValue(input.deliverable);
  const acceptanceCriteria = stringValue(input.acceptanceCriteria);
  const escalationPolicy = stringValue(input.escalationPolicy);
  const textLimits: Array<[string, string, number]> = [
    [triggerRule, "triggerRule", 500], [scopeDescription, "scopeDescription", 2000],
    [inputRequirement, "inputRequirement", 2000], [deliverable, "deliverable", 2000],
    [acceptanceCriteria, "acceptanceCriteria", 2000], [escalationPolicy, "escalationPolicy", 1000],
  ];
  const oversized = textLimits.find(([value, , max]) => value.length > max);
  if (oversized) return failCommand("协作约定内容过长", 400, oversized[1]);
  const responseTargetHours = optionalPositiveInteger(input.responseTargetHours);
  if (responseTargetHours === "invalid" || (responseTargetHours !== null && responseTargetHours > 720)) return failCommand("响应时限应为 1 至 720 小时", 400, "responseTargetHours");
  const deliveryTargetDays = optionalPositiveInteger(input.deliveryTargetDays);
  if (deliveryTargetDays === "invalid" || (deliveryTargetDays !== null && deliveryTargetDays > 3650)) return failCommand("交付时限应为 1 至 3650 天", 400, "deliveryTargetDays");
  const effectiveFrom = optionalDate(input.effectiveFrom);
  if (effectiveFrom === "invalid") return failCommand("生效日期无效", 400, "effectiveFrom");
  const effectiveTo = optionalDate(input.effectiveTo);
  if (effectiveTo === "invalid") return failCommand("失效日期无效", 400, "effectiveTo");
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) return failCommand("失效日期不得早于生效日期", 400, "effectiveTo");
  return okCommand({ title, description, collaborationType, triggerRule, scopeDescription, inputRequirement, deliverable, acceptanceCriteria, responseTargetHours, deliveryTargetDays, effectiveFrom, effectiveTo, escalationPolicy });
}

function uniquePositiveIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(positiveId).filter((id): id is number => Boolean(id))));
}

function sameIdSet(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

async function validateLinkedOwnerCompatibility(
  existing: {
    enablingDepartments: Array<{ departmentId: number; responseStatus: string }>;
    workPlans: Array<{ ownerEmployeeId: number | null }>;
    workItems: Array<{ ownerEmployeeId: number | null }>;
  },
  command: DepartmentCollaborationCreateCommand,
): Promise<DomainValidationResult<true>> {
  const ownerEmployeeIds = Array.from(new Set([
    ...existing.workPlans.flatMap((plan) => plan.ownerEmployeeId ? [plan.ownerEmployeeId] : []),
    ...existing.workItems.flatMap((item) => item.ownerEmployeeId ? [item.ownerEmployeeId] : []),
  ]));
  if (ownerEmployeeIds.length === 0) return okCommand(true);
  const acceptedDepartmentIds = new Set(existing.enablingDepartments
    .filter((entry) => entry.responseStatus === "accepted" && command.enablingDepartmentIds.includes(entry.departmentId))
    .map((entry) => entry.departmentId));
  const executorPositions = await prisma.position.findMany({
    where: { id: { in: command.executorPositionIds }, departmentId: { in: Array.from(acceptedDepartmentIds) } },
    select: { id: true },
  });
  const eligibleAssignments = executorPositions.length > 0
    ? await prisma.eDP.findMany({
        where: {
          employeeId: { in: ownerEmployeeIds },
          positionId: { in: executorPositions.map((position) => position.id) },
          OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: new Date().toISOString().slice(0, 10) } }],
          employee: { employments: { some: { isActive: true } } },
        },
        select: { employeeId: true },
      })
    : [];
  const eligibleEmployeeIds = new Set(eligibleAssignments.map((assignment) => assignment.employeeId));
  if (ownerEmployeeIds.some((employeeId) => !eligibleEmployeeIds.has(employeeId))) {
    return failCommand("新的执行岗位不包含已关联计划或任务的负责人，请先调整负责人", 409, "executorPositionIds");
  }
  return okCommand(true);
}
function optionalPositiveInteger(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : "invalid";
}
function optionalDate(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const candidate = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(candidate.getTime())) return "invalid";
  return new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate()));
}
function isCollaborationType(value: string): value is DepartmentCollaborationType {
  return DEPARTMENT_COLLABORATION_TYPES.some((type) => type === value);
}
function stringValue(value: unknown) { return String(value ?? "").trim(); }
function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
