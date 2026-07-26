import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "@workspace/platform/server/api";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  canViewWorkTaskTarget,
  canArchiveWorkTaskAction,
  canCreateWorkTaskAction,
  canDeleteWorkTaskAction,
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
  canUpdateWorkTaskAction,
} from "./access";
import {
  createWorkPlan,
  getWorkPlanTargetMetadata,
  listWorkPlans,
  updateWorkPlan,
} from "./work-plans";
import { archiveWorkPlan, deleteWorkPlan } from "./work-plan-lifecycle";
import { assertWorkTaskDirectUpdateAllowed } from "./work-task-workflow-policy";
import type { WorkImpactResolution } from "./work-mutation-impact";

type WorkPlanUserContext = {
  userId: number;
  departmentId: number;
};

type WorkTaskScopeTargetType = WorkSpaceTargetType;

type WorkPlanTarget = {
  targetType: WorkTaskScopeTargetType;
  targetId: number;
};

type CreateWorkPlanInput = Parameters<typeof createWorkPlan>[0];
type WorkPlanListResult = Awaited<ReturnType<typeof listWorkPlans>>;
type WorkPlanCreateBody = Omit<CreateWorkPlanInput, "targetType" | "targetId"> & {
  targetType?: string | null;
  targetId?: number | null;
  deptId?: number | null;
};
type WorkPlanUpdateBody = Partial<CreateWorkPlanInput>;

function isWorkTaskScopeTargetType(targetType: string): targetType is WorkTaskScopeTargetType {
  return targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project";
}

function normalizeWorkTaskScopeTargetType(targetType: string): WorkTaskScopeTargetType | null {
  const normalized = normalizeWorkTargetType(targetType);
  return isWorkTaskScopeTargetType(normalized) ? normalized : null;
}

export type WorkPlanListRouteCommand = WorkPlanTarget & {
  userId: number;
  kind?: string;
  includeArchived: boolean;
};

export type WorkPlanCreateRouteCommand = WorkPlanTarget & {
  userId: number;
  body: Omit<CreateWorkPlanInput, "targetType" | "targetId">;
};

export type WorkPlanUpdateRouteCommand = {
  userId: number;
  planId: number;
  body: WorkPlanUpdateBody;
};

export type WorkPlanArchiveRouteCommand = {
  userId: number;
  planId: number;
  impactResolution?: WorkImpactResolution;
};

export type WorkPlanDeleteRouteCommand = {
  userId: number;
  planId: number;
  impactResolution?: WorkImpactResolution;
};

function resolveTarget(
  input: { targetType?: string | null; targetId?: number | null; deptId?: number | null },
  user: WorkPlanUserContext,
): DomainValidationResult<WorkPlanTarget> {
  const targetType = normalizeWorkTaskScopeTargetType(input.targetType || "department");
  if (!targetType) return failCommand("工作计划目标无效", 400, "targetType");
  const targetId = targetType === "personal"
    ? input.targetId ?? user.userId
    : input.targetId ?? (targetType === "department" ? input.deptId : null) ?? user.departmentId;
  if (!Number.isInteger(targetId) || targetId <= 0) return failCommand("工作计划目标无效");
  return okCommand({
    targetType,
    targetId,
  });
}

export function buildListWorkPlansCommand(input: {
  user: WorkPlanUserContext;
  query: {
    targetType?: string | null;
    targetId?: number | null;
    deptId?: number | null;
    kind?: string | null;
    includeArchived?: string | null;
  };
}): DomainValidationResult<WorkPlanListRouteCommand> {
  const target = resolveTarget(input.query, input.user);
  if (target.ok === false) return target;
  return okCommand({
    userId: input.user.userId,
    ...target.data,
    kind: input.query.kind || undefined,
    includeArchived: input.query.includeArchived === "true",
  });
}

export async function executeListWorkPlansCommand(
  command: WorkPlanListRouteCommand,
): Promise<ServiceResult<{ plans: WorkPlanListResult }>> {
  if (!(await canViewWorkTaskTarget(command.userId, command.targetType, command.targetId))) {
    return serviceError("无权限访问该目标", 403);
  }
  const plans = await listWorkPlans({
    actorUserId: command.userId,
    targetType: command.targetType,
    targetId: command.targetId,
    kind: command.kind,
    includeArchived: command.includeArchived,
  });
  return serviceOk({ plans });
}

export function buildCreateWorkPlanCommand(input: {
  user: WorkPlanUserContext;
  body: WorkPlanCreateBody;
}): DomainValidationResult<WorkPlanCreateRouteCommand> {
  const target = resolveTarget(input.body, input.user);
  if (target.ok === false) return target;
  const { targetType: _targetType, targetId: _targetId, deptId: _deptId, ...body } = input.body;
  return okCommand({
    userId: input.user.userId,
    ...target.data,
    body: body as WorkPlanCreateRouteCommand["body"],
  });
}

export async function executeCreateWorkPlanCommand(
  command: WorkPlanCreateRouteCommand,
): Promise<ServiceResult<{ plan: unknown }>> {
  if (!(await canCreateWorkTaskAction(command.userId, command.targetType, command.targetId))) {
    return serviceError("无权限编辑工作计划", 403);
  }
  const directAllowed = await assertWorkTaskDirectUpdateAllowed({
    actorUserId: command.userId,
    targetType: command.targetType,
    targetId: command.targetId,
    businessActionKey: "work.tasks.plan.create",
  });
  if (!directAllowed.ok) return directAllowed;
  const plan = await createWorkPlan({
    targetType: command.targetType,
    targetId: command.targetId,
    ...command.body,
    actorUserId: command.userId,
  });
  if (plan.ok === false) return serviceError(plan.error, plan.status || 400, plan.details);
  return serviceOk({ plan: plan.data });
}

export function buildUpdateWorkPlanCommand(input: {
  userId: number;
  planId: number;
  body: WorkPlanUpdateBody;
}): DomainValidationResult<WorkPlanUpdateRouteCommand> {
  return okCommand(input);
}

export async function executeUpdateWorkPlanCommand(
  command: WorkPlanUpdateRouteCommand,
): Promise<ServiceResult<{ plan: unknown }>> {
  const existing = await getWorkPlanTargetMetadata(command.planId);
  if (!existing) return serviceError("工作计划不存在", 404);
  if (!isWorkTaskScopeTargetType(existing.targetType)) return serviceError("工作计划目标无效", 400);
  if (!(await canUpdateWorkTaskAction(command.userId, existing.targetType, existing.targetId))) {
    return serviceError("无权限编辑工作计划", 403);
  }
  const directAllowed = await assertWorkTaskDirectUpdateAllowed({
    actorUserId: command.userId,
    targetType: existing.targetType,
    targetId: existing.targetId,
    businessActionKey: "work.tasks.plan.save",
  });
  if (!directAllowed.ok) return directAllowed;
  const plan = await updateWorkPlan(command.planId, { ...command.body, actorUserId: command.userId });
  if (plan.ok === false) return serviceError(plan.error, plan.status || 400, plan.details);
  return serviceOk({ plan: plan.data });
}

export function buildArchiveWorkPlanCommand(input: {
  userId: number;
  planId: number;
  impactResolution?: WorkImpactResolution;
}): DomainValidationResult<WorkPlanArchiveRouteCommand> {
  return okCommand(input);
}

export async function executeArchiveWorkPlanCommand(
  command: WorkPlanArchiveRouteCommand,
): Promise<ServiceResult<{ success: true }>> {
  const existing = await getWorkPlanTargetMetadata(command.planId);
  if (!existing) return serviceError("工作计划不存在", 404);
  if (!isWorkTaskScopeTargetType(existing.targetType)) return serviceError("工作计划目标无效", 400);
  if (!(await canArchiveWorkTaskAction(command.userId, existing.targetType, existing.targetId))) {
    return serviceError("无权限归档工作计划", 403);
  }
  const result = await archiveWorkPlan(command.planId, command.userId, command.impactResolution);
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  return serviceOk(result.data);
}

export function buildDeleteWorkPlanCommand(input: {
  userId: number;
  planId: number;
  impactResolution?: WorkImpactResolution;
}): DomainValidationResult<WorkPlanDeleteRouteCommand> {
  return okCommand(input);
}

export async function executeDeleteWorkPlanCommand(
  command: WorkPlanDeleteRouteCommand,
): Promise<ServiceResult<{ success: true }>> {
  const existing = await getWorkPlanTargetMetadata(command.planId);
  if (!existing) return serviceError("工作计划不存在", 404);
  if (!isWorkTaskScopeTargetType(existing.targetType)) return serviceError("工作计划目标无效", 400);
  if (!(await canDeleteWorkTaskAction(command.userId, existing.targetType, existing.targetId))) {
    return serviceError("无权限删除工作计划", 403);
  }
  const result = await deleteWorkPlan(command.planId, command.userId, command.impactResolution);
  if (!result.ok) return serviceError(result.error, result.status || 400, result.details);
  return serviceOk(result.data);
}
