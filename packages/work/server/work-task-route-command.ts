import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { authorize, canEnterResource } from "@workspace/platform/server/auth";
import { normalizeLifecycleScope, searchFkOptions, type FkSearchParams } from "@workspace/platform/server/fk-registry";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import {
  canViewWorkTaskTarget,
  canArchiveWorkTaskAction,
  canDeleteWorkTaskAction,
  canUseProject,
  normalizeWorkTargetType,
  type WorkSpaceTargetType,
} from "./access";
import {
  createProject,
  deleteProject,
  listProjectGantt,
  listProjects,
  updateProjectField,
} from "./projects";
import {
  getWorkReportDraft,
  listWorkReportCollection,
  type WorkReportItemInput,
} from "./task-reports";
import {
  listWorkTaskSpaces,
} from "./task-spaces";
import {
  listWorkPeriodCollection,
} from "./work-period-collection";
import {
  type CreateWorkPeriodScheduleItemCommand,
} from "./work-period-schedule";
import type { ProjectCreateInput } from "./schemas";
import { WORK_FK_REGISTRY } from "./fk-registry";
import {
  listAssignedDepartmentWorkItems,
  listAssignedDepartmentWorkPlanGroups,
  listAssignedPersonalCollaborationWorkItems,
  listAssignedPersonalCollaborationWorkPlanGroups,
} from "./work-assigned-items";
import {
  createWorkItem,
  deleteWorkItem,
  getWorkItemTargetMetadata,
  getWorkItems,
  parseParticipants,
  updateWorkItem,
} from "./works";

type AuthUserContext = {
  userId: number;
  departmentId?: number | null;
};

type WorkTaskQuery = {
  category?: string;
  planId?: number | null;
  periodType?: string | null;
  periodStart?: string | null;
  includeArchived?: boolean;
  targetType?: string;
  targetId?: number;
  deptId?: number;
};

type WorkPeriodCollectionQuery = {
  targetType?: string;
  targetId?: number;
  deptId?: number;
  cycleId?: number;
  displayPeriodType?: string | null;
  includeItems?: boolean;
};

type WorkTaskScopeTargetType = WorkSpaceTargetType;

function isWorkTaskScopeTargetType(targetType: string): targetType is WorkTaskScopeTargetType {
  return targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project";
}

function normalizeWorkTaskScopeTargetType(targetType: string): WorkTaskScopeTargetType | null {
  const normalized = normalizeWorkTargetType(targetType);
  return isWorkTaskScopeTargetType(normalized) ? normalized : null;
}

export type ListWorkItemsRouteCommand = {
  planId?: number | null;
  targetType: WorkTaskScopeTargetType;
  targetId: number;
  category?: string;
  periodType?: string | null;
  periodStart?: string | null;
  includeArchived?: boolean;
};

export type CreateWorkItemRouteCommand = Omit<
  Parameters<typeof createWorkItem>[0],
  "actorUserId" | "targetType" | "targetId"
> & {
  actorUserId: number;
  targetType: WorkTaskScopeTargetType;
  targetId: number;
};

export type UpdateWorkItemRouteCommand = {
  userId: number;
  workId: number;
  targetType: WorkTaskScopeTargetType;
  targetId: number;
  lifecycleOnly: boolean;
  data: Parameters<typeof updateWorkItem>[1];
};

export type DeleteWorkItemRouteCommand = {
  workId: number;
};

export type WorkReportRouteCommand = {
  userId: number;
  actorUserId?: number | null;
  targetType: WorkTaskScopeTargetType;
  targetId: number;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: "kr" | "final" | null;
};

export type SaveWorkReportRouteCommand = WorkReportRouteCommand & {
  items: WorkReportItemInput[];
};

export type WorkPeriodCollectionRouteCommand = {
  userId: number;
  targetType: WorkTaskScopeTargetType;
  targetId: number;
  cycleId: number;
  displayPeriodType?: string | null;
  includeItems?: boolean;
};

export type CreateWorkPeriodScheduleItemRouteCommand = CreateWorkPeriodScheduleItemCommand;

function targetIdOrFallback(input: {
  targetType: WorkTaskScopeTargetType;
  targetId?: number;
  deptId?: number;
  user: AuthUserContext;
}) {
  if (input.targetType === "personal") return input.targetId ?? input.user.userId;
  if (input.targetType === "department") return input.targetId ?? input.deptId ?? input.user.departmentId ?? 0;
  return input.targetId ?? 0;
}

export async function buildListProjectsRouteCommand(input: {
  userId: number;
  query: {
    keyword: string;
    page: number;
    pageSize: number;
    archived: boolean;
  };
}) {
  if (!(await canUseProject(input.userId))) return failCommand("无权限", 403);
  return okCommand({ userId: input.userId, ...input.query });
}

export function executeListProjectsRouteCommand(command: Parameters<typeof listProjects>[0]) {
  return listProjects(command);
}

export async function buildCreateProjectRouteCommand(input: {
  userId: number;
  body: ProjectCreateInput;
}) {
  if (!(await canUseProject(input.userId, "entry"))) return failCommand("无权限", 403);
  return okCommand(input);
}

export function executeCreateProjectRouteCommand(command: {
  userId: number;
  body: ProjectCreateInput;
}) {
  return createProject(command);
}

export function buildProjectUpdateRouteCommand(input: {
  id: number;
  userId: number;
  field: string;
  value: unknown;
}) {
  return okCommand(input);
}

export function executeUpdateProjectRouteCommand(command: {
  id: number;
  userId: number;
  field: string;
  value: unknown;
}) {
  return updateProjectField({
    projectId: command.id,
    userId: command.userId,
    field: command.field,
    value: command.value,
  });
}

export function buildProjectDeleteRouteCommand(input: { id: number; userId: number }) {
  return okCommand(input);
}

export function executeDeleteProjectRouteCommand(command: { id: number; userId: number }) {
  return deleteProject({ projectId: command.id, userId: command.userId });
}

export async function buildProjectGanttRouteCommand(input: {
  userId: number;
  includeTasks: boolean;
}) {
  if (!(await canUseProject(input.userId))) return failCommand("无权限", 403);
  return okCommand(input);
}

export function executeProjectGanttRouteCommand(command: Parameters<typeof listProjectGantt>[0]) {
  return listProjectGantt(command);
}

export async function executeWorkReferenceOptionsRouteCommand(command: {
  fkKey: string;
  keyword: string;
  lifecycleScope?: string;
  userId: number;
  params: FkSearchParams;
}) {
  try {
    const definition = WORK_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "work") return serviceError("无权限", 403);
    const allowed = definition.permission.action === "entry"
      ? await canEnterResource(command.userId, definition.permission.resourceKey)
      : await authorize({
          user: command.userId,
          resourceKey: definition.permission.resourceKey,
          action: definition.permission.action,
        });
    if (!allowed) return serviceError("无权限", 403);
    const items = await searchFkOptions(WORK_FK_REGISTRY, {
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope ? normalizeLifecycleScope(command.lifecycleScope) : undefined,
      userId: command.userId,
      params: command.params,
    });
    return { items };
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "候选项查询失败", 400);
  }
}

export function executeWorkReportCollectionRouteCommand(command: {
  userId: number;
  periodType?: string | null;
  periodStart: string | null;
}) {
  return listWorkReportCollection(command);
}

export function executeWorkTaskSpacesRouteCommand(command: { userId: number }) {
  return listWorkTaskSpaces(command.userId);
}

export async function executeAssignedDepartmentWorkItemsRouteCommand(command: { userId: number }) {
  const [works, collaborationWorks, planGroups, collaborationPlanGroups] = await Promise.all([
    listAssignedDepartmentWorkItems(command.userId),
    listAssignedPersonalCollaborationWorkItems(command.userId),
    listAssignedDepartmentWorkPlanGroups(command.userId),
    listAssignedPersonalCollaborationWorkPlanGroups(command.userId),
  ]);
  return serviceOk({ works, collaborationWorks, planGroups, collaborationPlanGroups });
}

export async function buildListWorkItemsRouteCommand(input: {
  user: AuthUserContext;
  query: WorkTaskQuery;
}): Promise<DomainValidationResult<ListWorkItemsRouteCommand>> {
  const targetType = normalizeWorkTaskScopeTargetType(input.query.targetType || "department");
  if (!targetType) return failCommand("工作空间范围无效", 400, "targetType");
  const targetId = targetIdOrFallback({
    targetType,
    targetId: input.query.targetId,
    deptId: input.query.deptId,
    user: input.user,
  });
  if (!(await canViewWorkTaskTarget(input.user.userId, targetType, targetId))) {
    return failCommand("无权限访问该目标", 403);
  }
  return okCommand({
    planId: input.query.planId ?? null,
    targetType,
    targetId,
    category: input.query.category,
    periodType: input.query.periodType,
    periodStart: input.query.periodStart,
    includeArchived: input.query.includeArchived,
  });
}

export async function executeListWorkItemsRouteCommand(command: ListWorkItemsRouteCommand) {
  const works = await getWorkItems(command);
  return { works };
}

export async function buildWorkPeriodCollectionRouteCommand(input: {
  user: AuthUserContext;
  query: WorkPeriodCollectionQuery;
}): Promise<DomainValidationResult<WorkPeriodCollectionRouteCommand>> {
  const targetType = normalizeWorkTaskScopeTargetType(input.query.targetType || "department");
  if (!targetType) return failCommand("工作空间范围无效", 400, "targetType");
  const targetId = targetIdOrFallback({
    targetType,
    targetId: input.query.targetId,
    deptId: input.query.deptId,
    user: input.user,
  });
  if (!(await canViewWorkTaskTarget(input.user.userId, targetType, targetId))) {
    return failCommand("无权限访问该目标", 403);
  }
  const cycleId = Number(input.query.cycleId);
  if (!Number.isInteger(cycleId) || cycleId <= 0) return failCommand("OKR 周期无效", 400, "cycleId");
  return okCommand({
    userId: input.user.userId,
    targetType,
    targetId,
    cycleId,
    displayPeriodType: input.query.displayPeriodType,
    includeItems: input.query.includeItems,
  });
}

export async function executeWorkPeriodCollectionRouteCommand(command: WorkPeriodCollectionRouteCommand) {
  return listWorkPeriodCollection(command);
}

export function buildCreateWorkPeriodScheduleItemRouteCommand(input: {
  user: AuthUserContext;
  body: Record<string, unknown>;
}): DomainValidationResult<CreateWorkPeriodScheduleItemRouteCommand> {
  return okCommand({
    actorUserId: input.user.userId,
    rootPlanId: Number(input.body.rootPlanId),
    cycleId: Number(input.body.cycleId),
    sourceItemId: Number(input.body.sourceItemId),
    itemType: String(input.body.itemType ?? "") as "objective" | "key_result",
    content: String(input.body.content ?? ""),
    ownerEmployeeId: input.body.ownerEmployeeId as number | null | undefined,
    plannedStartDate: input.body.plannedStartDate as string | null | undefined,
    plannedEndDate: input.body.plannedEndDate as string | null | undefined,
    responsibilityPositionId: input.body.responsibilityPositionId as number | null | undefined,
    responsibilityNodeId: input.body.responsibilityNodeId as number | null | undefined,
    krUnit: input.body.krUnit as string | null | undefined,
  });
}

export async function buildCreateWorkItemRouteCommand(input: {
  user: AuthUserContext;
  body: Record<string, unknown> & {
    targetType?: string;
    targetId?: number;
    deptId?: number;
    participants?: string;
  };
}): Promise<DomainValidationResult<CreateWorkItemRouteCommand>> {
  const { targetType, targetId, deptId, participants, ...workInput } = input.body;
  const finalTargetType = normalizeWorkTaskScopeTargetType(targetType || "department");
  if (!finalTargetType) return failCommand("工作空间范围无效", 400, "targetType");
  const finalTargetId = targetIdOrFallback({
    targetType: finalTargetType,
    targetId,
    deptId,
    user: input.user,
  });
  return okCommand({
    ...workInput,
    targetType: finalTargetType,
    targetId: finalTargetId,
    actorUserId: input.user.userId,
    participants: parseParticipants(participants),
  } as CreateWorkItemRouteCommand);
}

export async function buildUpdateWorkItemRouteCommand(input: {
  userId: number;
  workId: number;
  body: Record<string, unknown> & { participants?: string };
}): Promise<DomainValidationResult<UpdateWorkItemRouteCommand>> {
  const existing = await getWorkItemTargetMetadata(input.workId);
  if (!existing) return failCommand("节点不存在", 404);
  if (!isWorkTaskScopeTargetType(existing.targetType)) return failCommand("工作空间范围无效", 400, "targetType");
  const targetId = existing.targetId ?? 0;
  const lifecycleRequest = isWorkItemArchiveLifecycleRequest(input.body);
  if (lifecycleRequest && !(await canArchiveWorkTaskAction(input.userId, existing.targetType, targetId))) {
    return failCommand("无权限归档或恢复任务", 403);
  }
  const hasNonLifecyclePatch = hasNonArchiveWorkItemPatch(input.body);
  if (lifecycleRequest && hasNonLifecyclePatch) {
    return failCommand("归档或恢复不能同时修改其他任务字段", 400);
  }
  const { participants, ...data } = input.body;
  return okCommand({
    userId: input.userId,
    workId: input.workId,
    targetType: existing.targetType,
    targetId,
    lifecycleOnly: lifecycleRequest,
    data: {
      ...normalizeWorkItemArchiveLifecyclePatch(data),
      ...(participants !== undefined && { participants: parseParticipants(participants) }),
    },
  });
}

function isWorkItemArchiveLifecycleRequest(body: Record<string, unknown>) {
  return typeof body.isArchived === "boolean";
}

function normalizeWorkItemArchiveLifecyclePatch(body: Record<string, unknown>) {
  return body;
}

function hasNonArchiveWorkItemPatch(body: Record<string, unknown> & { participants?: string }) {
  const nonArchiveKeys = Object.keys(body).filter((key) => key !== "isArchived");
  if (nonArchiveKeys.length > 0) return true;
  return false;
}

export async function buildDeleteWorkItemRouteCommand(input: {
  userId: number;
  workId: number;
}): Promise<DomainValidationResult<DeleteWorkItemRouteCommand>> {
  const existing = await getWorkItemTargetMetadata(input.workId);
  if (!existing) return failCommand("节点不存在", 404);
  if (!isWorkTaskScopeTargetType(existing.targetType)) return failCommand("工作空间范围无效", 400, "targetType");
  if (!(await canDeleteWorkTaskAction(input.userId, existing.targetType, existing.targetId ?? 0))) {
    return failCommand("无权限删除工作计划", 403);
  }
  return okCommand({ workId: input.workId });
}

export async function executeDeleteWorkItemRouteCommand(command: DeleteWorkItemRouteCommand) {
  const result = await deleteWorkItem(command.workId);
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk(result.data);
}

export function buildWorkReportRouteCommand(input: {
  userId: number;
  query: {
    targetType?: string;
    targetId?: number;
    periodType?: string | null;
    periodStart?: string | null;
    reportStage?: "kr" | "final" | null;
  };
}): DomainValidationResult<WorkReportRouteCommand> {
  const targetType = normalizeWorkTaskScopeTargetType(input.query.targetType || "personal");
  if (!targetType) return failCommand("工作空间范围无效", 400, "targetType");
  const targetId = input.query.targetId ?? input.userId;
  if (!Number.isInteger(targetId) || targetId <= 0) return failCommand("缺少工作空间", 400, "targetId");
  return okCommand({
    userId: reportOwnerUserId(targetType, targetId, input.userId),
    actorUserId: input.userId,
    targetType,
    targetId,
    periodType: input.query.periodType,
    periodStart: input.query.periodStart,
    reportStage: input.query.reportStage,
  });
}

export function executeGetWorkReportRouteCommand(command: WorkReportRouteCommand) {
  return getWorkReportDraft(command);
}

export function buildSaveWorkReportRouteCommand(input: {
  userId: number;
  body: {
    targetType: string;
    targetId: number;
    periodType?: string | null;
    periodStart?: string | null;
    reportStage?: "kr" | "final" | null;
    items: WorkReportItemInput[];
  };
}): DomainValidationResult<SaveWorkReportRouteCommand> {
  const targetType = normalizeWorkTaskScopeTargetType(input.body.targetType);
  if (!targetType) return failCommand("工作空间范围无效", 400, "targetType");
  if (!Number.isInteger(input.body.targetId) || input.body.targetId <= 0) return failCommand("缺少工作空间", 400, "targetId");
  return okCommand({
    userId: reportOwnerUserId(targetType, input.body.targetId, input.userId),
    actorUserId: input.userId,
    targetType,
    targetId: input.body.targetId,
    periodType: input.body.periodType,
    periodStart: input.body.periodStart,
    reportStage: input.body.reportStage,
    items: input.body.items,
  });
}

function reportOwnerUserId(targetType: WorkTaskScopeTargetType, targetId: number, actorUserId: number) {
  return targetType === "personal" ? targetId : actorUserId;
}
