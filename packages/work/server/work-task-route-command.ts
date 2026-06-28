import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { authorize } from "@workspace/platform/server/auth";
import { normalizeLifecycleScope, searchFkOptions, type FkSearchParams } from "@workspace/platform/server/fk-registry";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import {
  canAccessTarget,
  canDeleteWorkTask,
  canEditWorkTask,
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
  saveWorkReport,
  type WorkReportItemInput,
} from "./task-reports";
import {
  listWorkTaskSpaces,
  listWorkSpacePermissions,
  updateWorkSpacePermissions,
  type WorkScopePermissionInput,
} from "./task-spaces";
import { WORK_FK_REGISTRY } from "./fk-registry";
import {
  createWorkItem,
  deleteWorkItem,
  getWorkItemAccessMetadata,
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

export type ListWorkItemsRouteCommand = {
  planId?: number | null;
  targetType: WorkSpaceTargetType;
  targetId: number;
  category?: string;
  periodType?: string | null;
  periodStart?: string | null;
  includeArchived?: boolean;
};

export type CreateWorkItemRouteCommand = Parameters<typeof createWorkItem>[0];

export type UpdateWorkItemRouteCommand = {
  workId: number;
  data: Parameters<typeof updateWorkItem>[1];
};

export type DeleteWorkItemRouteCommand = {
  workId: number;
};

export type WorkReportRouteCommand = {
  userId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodStart?: string | null;
};

export type SaveWorkReportRouteCommand = WorkReportRouteCommand & {
  items: WorkReportItemInput[];
};

export type WorkSpacePermissionsRouteCommand = {
  userId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
};

export type UpdateWorkSpacePermissionsRouteCommand = {
  actorUserId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  permissions: WorkScopePermissionInput[];
};

function targetIdOrFallback(input: {
  targetType: WorkSpaceTargetType;
  targetId?: number;
  deptId?: number;
  user: AuthUserContext;
}) {
  if (input.targetType === "personal") return input.targetId ?? input.user.userId;
  if (input.targetType === "department") return input.targetId ?? input.deptId ?? input.user.departmentId ?? 0;
  return input.targetId ?? 0;
}

function replayJsonRequest(request: Request, body: unknown) {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(body ?? {}),
  });
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
  request: Request;
  userId: number;
  body: Record<string, unknown>;
}) {
  if (!(await canUseProject(input.userId, "write"))) return failCommand("无权限", 403);
  return okCommand(input);
}

export async function executeCreateProjectRouteCommand(command: {
  request: Request;
  userId: number;
  body: Record<string, unknown>;
}) {
  const result = await createProject(replayJsonRequest(command.request, command.body), command.userId);
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return result.data;
}

export function buildProjectIdRouteCommand(input: {
  id: number;
  request: Request;
  body?: Record<string, unknown>;
}) {
  return okCommand(input);
}

export function executeUpdateProjectRouteCommand(command: {
  id: number;
  request: Request;
  body?: Record<string, unknown>;
}) {
  return updateProjectField(replayJsonRequest(command.request, command.body), Promise.resolve({ id: String(command.id) }));
}

export function executeDeleteProjectRouteCommand(command: { id: number; request: Request }) {
  return deleteProject(command.request, Promise.resolve({ id: String(command.id) }));
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
    const allowed = await authorize({
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
  periodStart: string | null;
}) {
  return listWorkReportCollection(command);
}

export function executeWorkTaskSpacesRouteCommand(command: { userId: number }) {
  return listWorkTaskSpaces(command.userId);
}

export async function buildListWorkItemsRouteCommand(input: {
  user: AuthUserContext;
  query: WorkTaskQuery;
}): Promise<DomainValidationResult<ListWorkItemsRouteCommand>> {
  const targetType = normalizeWorkTargetType(input.query.targetType || "department");
  const targetId = targetIdOrFallback({
    targetType,
    targetId: input.query.targetId,
    deptId: input.query.deptId,
    user: input.user,
  });
  if (!(await canAccessTarget(input.user.userId, targetType, targetId))) {
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
  const finalTargetType = normalizeWorkTargetType(targetType || "department");
  const finalTargetId = targetIdOrFallback({
    targetType: finalTargetType,
    targetId,
    deptId,
    user: input.user,
  });
  if (!(await canEditWorkTask(input.user.userId, finalTargetType, finalTargetId))) {
    return failCommand("无权限编辑工作计划", 403);
  }
  return okCommand({
    targetType: finalTargetType,
    targetId: finalTargetId,
    ...workInput,
    participants: parseParticipants(participants),
  } as CreateWorkItemRouteCommand);
}

export async function executeCreateWorkItemRouteCommand(command: CreateWorkItemRouteCommand) {
  const work = await createWorkItem(command);
  if (!work.ok) return serviceError(work.error, work.status || 400);
  return serviceOk({ work: work.data });
}

export async function buildUpdateWorkItemRouteCommand(input: {
  userId: number;
  workId: number;
  body: Record<string, unknown> & { participants?: string };
}): Promise<DomainValidationResult<UpdateWorkItemRouteCommand>> {
  const existing = await getWorkItemAccessMetadata(input.workId);
  if (!existing) return failCommand("节点不存在", 404);
  if (!(await canEditWorkTask(input.userId, existing.targetType, existing.targetId ?? 0))) {
    return failCommand("无权限编辑工作计划", 403);
  }
  const { participants, ...data } = input.body;
  return okCommand({
    workId: input.workId,
    data: {
      ...data,
      ...(participants !== undefined && { participants: parseParticipants(participants) }),
    },
  });
}

export async function executeUpdateWorkItemRouteCommand(command: UpdateWorkItemRouteCommand) {
  const work = await updateWorkItem(command.workId, command.data);
  if (!work.ok) return serviceError(work.error, work.status || 400);
  return serviceOk({ work: work.data });
}

export async function buildDeleteWorkItemRouteCommand(input: {
  userId: number;
  workId: number;
}): Promise<DomainValidationResult<DeleteWorkItemRouteCommand>> {
  const existing = await getWorkItemAccessMetadata(input.workId);
  if (!existing) return failCommand("节点不存在", 404);
  if (!(await canDeleteWorkTask(input.userId, existing.targetType, existing.targetId ?? 0))) {
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
    periodStart?: string | null;
  };
}): DomainValidationResult<WorkReportRouteCommand> {
  const targetType = normalizeWorkTargetType(input.query.targetType || "personal");
  const targetId = input.query.targetId ?? input.userId;
  if (!Number.isInteger(targetId) || targetId <= 0) return failCommand("缺少工作空间", 400, "targetId");
  return okCommand({
    userId: input.userId,
    targetType,
    targetId,
    periodStart: input.query.periodStart,
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
    periodStart?: string | null;
    items: WorkReportItemInput[];
  };
}): DomainValidationResult<SaveWorkReportRouteCommand> {
  return okCommand({
    userId: input.userId,
    targetType: normalizeWorkTargetType(input.body.targetType),
    targetId: input.body.targetId,
    periodStart: input.body.periodStart,
    items: input.body.items,
  });
}

export function executeSaveWorkReportRouteCommand(command: SaveWorkReportRouteCommand) {
  return saveWorkReport(command);
}

export function buildWorkSpacePermissionsRouteCommand(input: {
  userId: number;
  params: {
    targetType: string;
    targetId: number;
  };
}): DomainValidationResult<WorkSpacePermissionsRouteCommand> {
  return okCommand({
    userId: input.userId,
    targetType: normalizeWorkTargetType(input.params.targetType),
    targetId: input.params.targetId,
  });
}

export function executeListWorkSpacePermissionsRouteCommand(command: WorkSpacePermissionsRouteCommand) {
  return listWorkSpacePermissions(command);
}

export function buildUpdateWorkSpacePermissionsRouteCommand(input: {
  userId: number;
  params: {
    targetType: string;
    targetId: number;
  };
  body: { permissions: WorkScopePermissionInput[] };
}): DomainValidationResult<UpdateWorkSpacePermissionsRouteCommand> {
  return okCommand({
    actorUserId: input.userId,
    targetType: normalizeWorkTargetType(input.params.targetType),
    targetId: input.params.targetId,
    permissions: input.body.permissions,
  });
}

export function executeUpdateWorkSpacePermissionsRouteCommand(command: UpdateWorkSpacePermissionsRouteCommand) {
  return updateWorkSpacePermissions(command);
}
