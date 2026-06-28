import {
  failCommand,
  okCommand,
  type DomainServiceResult,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  canAccessTarget,
  canDeleteWorkTask,
  canEditWorkTask,
} from "./access";
import {
  archiveWorkPlan,
  createWorkPlan,
  getWorkPlanAccessMetadata,
  listWorkPlans,
  updateWorkPlan,
} from "./work-plans";

type WorkPlanUserContext = {
  userId: number;
  departmentId: number;
};

type WorkPlanTarget = {
  targetType: string;
  targetId: number;
};

type CreateWorkPlanInput = Parameters<typeof createWorkPlan>[0];
type WorkPlanCreateBody = Omit<CreateWorkPlanInput, "targetType" | "targetId"> & {
  targetType?: string | null;
  targetId?: number | null;
  deptId?: number | null;
};
type WorkPlanUpdateBody = Partial<CreateWorkPlanInput>;

export type WorkPlanListRouteCommand = WorkPlanTarget & {
  userId: number;
  kind: string;
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
};

function resolveTarget(
  input: { targetType?: string | null; targetId?: number | null; deptId?: number | null },
  user: WorkPlanUserContext,
): DomainValidationResult<WorkPlanTarget> {
  const targetType = input.targetType || "department";
  const targetId = targetType === "personal" || targetType === "user"
    ? input.targetId ?? user.userId
    : input.targetId ?? (targetType === "department" ? input.deptId : null) ?? user.departmentId;
  if (!Number.isInteger(targetId) || targetId <= 0) return failCommand("工作计划目标无效");
  return okCommand({
    targetType: targetType === "user" ? "personal" : targetType,
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
    kind: input.query.kind || "okr",
    includeArchived: input.query.includeArchived === "true",
  });
}

export async function executeListWorkPlansCommand(
  command: WorkPlanListRouteCommand,
): Promise<DomainServiceResult<{ plans: unknown[] }>> {
  if (!(await canAccessTarget(command.userId, command.targetType, command.targetId))) {
    return { ok: false, error: "无权限访问该目标", status: 403 };
  }
  const plans = await listWorkPlans({
    targetType: command.targetType,
    targetId: command.targetId,
    kind: command.kind,
    includeArchived: command.includeArchived,
  });
  return { ok: true, data: { plans } };
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
): Promise<DomainServiceResult<{ plan: unknown }>> {
  if (!(await canEditWorkTask(command.userId, command.targetType, command.targetId))) {
    return { ok: false, error: "无权限编辑工作计划", status: 403 };
  }
  const plan = await createWorkPlan({
    targetType: command.targetType,
    targetId: command.targetId,
    ...command.body,
  });
  if (plan.ok === false) return plan;
  return { ok: true, data: { plan: plan.data } };
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
): Promise<DomainServiceResult<{ plan: unknown }>> {
  const existing = await getWorkPlanAccessMetadata(command.planId);
  if (!existing) return { ok: false, error: "工作计划不存在", status: 404 };
  if (!(await canEditWorkTask(command.userId, existing.targetType, existing.targetId))) {
    return { ok: false, error: "无权限编辑工作计划", status: 403 };
  }
  const plan = await updateWorkPlan(command.planId, command.body);
  if (plan.ok === false) return plan;
  return { ok: true, data: { plan: plan.data } };
}

export function buildArchiveWorkPlanCommand(input: {
  userId: number;
  planId: number;
}): DomainValidationResult<WorkPlanArchiveRouteCommand> {
  return okCommand(input);
}

export async function executeArchiveWorkPlanCommand(
  command: WorkPlanArchiveRouteCommand,
): Promise<DomainServiceResult<{ success: true }>> {
  const existing = await getWorkPlanAccessMetadata(command.planId);
  if (!existing) return { ok: false, error: "工作计划不存在", status: 404 };
  if (!(await canDeleteWorkTask(command.userId, existing.targetType, existing.targetId))) {
    return { ok: false, error: "无权限删除工作计划", status: 403 };
  }
  return archiveWorkPlan(command.planId);
}
