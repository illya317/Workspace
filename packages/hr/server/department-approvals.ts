import {
  listRequests,
  type ApprovalAdapter,
  type ApprovalHandlerSource,
  type ApprovalOperation,
  type ApprovalRequestDto,
  type ApprovalRequestRecord,
  type ApprovalStatus,
} from "@workspace/platform/server/approvals";
import { bindApprovalLifecycle } from "@workspace/platform/server/approval-lifecycle";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeApprovedBusinessActionCommand,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { failCommand, mapValidationToServiceResult, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { checkHRRead, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { listDepartmentResponsibleUserIds, listDirectManagerUserIds } from "@workspace/platform/server/business-space-natural-users";
import { resolveWorkflowNodeHandlerUserIds } from "@workspace/platform/server/approvals/workflow-node-handlers";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildDepartmentCreateCommand,
  buildDepartmentUpdateCommand,
  type DepartmentCreateInput,
  type DepartmentCreateCommand,
  type DepartmentUpdateInput,
  type DepartmentUpdateCommand,
} from "./domain/department-validation";
import {
  commitDepartmentCreateCommand,
  commitDepartmentUpdateCommand,
} from "./departments";

export type HrDepartmentApprovalPayload = {
  entityType: "department";
  departmentId: number | null;
  data: Record<string, unknown>;
};

type HrDepartmentSubmissionBody = {
  operation: ApprovalOperation;
  departmentId?: number | null;
  payload: Record<string, unknown>;
  comment?: string | null;
};

type HrDepartmentSubmissionActionBody = {
  payload?: Record<string, unknown>;
  comment?: string | null;
  version?: number | null;
};

type HrDepartmentSubmissionsQuery = {
  status?: string;
};

const HR_DEPARTMENT_APPROVAL_SUBJECT = "hr.roster.department";
const HR_ROSTER_RESOURCE_KEY = "hr.roster";

type DepartmentCommandContext = { userId: number };

const departmentCreateCommandAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "hr.roster.department.create",
  validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentCreateCommand",
  commitKey: "packages/hr/server/departments.commitDepartmentCreateCommand",
  validate: async (input: DepartmentCreateInput) => mapValidationToServiceResult(
    await buildDepartmentCreateCommand(input),
  ),
  commit: (command: DepartmentCreateCommand, context: DepartmentCommandContext) => (
    commitDepartmentCreateCommand(command, context.userId)
  ),
});

const departmentUpdateCommandAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "hr.roster.department.update",
  validatorKey: "packages/hr/server/domain/department-validation.buildDepartmentUpdateCommand",
  commitKey: "packages/hr/server/departments.commitDepartmentUpdateCommand",
  validate: async (input: DepartmentUpdateInput) => mapValidationToServiceResult(
    await buildDepartmentUpdateCommand(input),
  ),
  commit: (command: DepartmentUpdateCommand, context: DepartmentCommandContext) => (
    commitDepartmentUpdateCommand(command, context.userId)
  ),
});

export const hrDepartmentApprovalAdapter: ApprovalAdapter<HrDepartmentApprovalPayload> = {
  subjectType: HR_DEPARTMENT_APPROVAL_SUBJECT,
  workflowDefaults: ({ operation, prepared, request }) => ({
    businessActionKey: businessActionKeyFor(operation, prepared?.payload ?? request?.latestPayload ?? null),
    scopeType: "global",
    mode: "optional",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    handlerSource: "permission",
  }),
  validatePayload: async ({ operation, subjectId, payload }) => validateHrDepartmentApprovalPayload({
    operation,
    subjectId,
    payload,
  }),
  resolveAccess: async ({ actorUserId, action, request }) => {
    if (action === "listRequests") return checkHRRead(actorUserId, HR_ROSTER_RESOURCE_KEY);
    if (action === "createDraft") return canSubmitHrRosterWorkflow(actorUserId);
    if (action === "approve" || action === "reject" || action === "reviewUpdate") {
      return Boolean(request && await canProcessHrDepartmentRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (
        request.submitterUserId === actorUserId ||
        await canProcessHrDepartmentRequest(actorUserId, request)
      ));
    }
    return false;
  },
  resolveHandlers: async ({ handlerSource, request }) =>
    resolveHrDepartmentHandlerUserIds(handlerSource, request),
  resolveRecipients: async ({ eventType, actorUserId, request }) => {
    if (eventType === "submit") return resolveHrDepartmentHandlerUserIds(request.handlerSource, request, actorUserId);
    if (eventType === "approve" || eventType === "reject" || eventType === "review") return [request.submitterUserId];
    if (eventType === "comment") {
      if (actorUserId === request.submitterUserId) return resolveHrDepartmentHandlerUserIds(request.handlerSource, request, actorUserId);
      return [request.submitterUserId];
    }
    return [];
  },
  describeRequest: ({ request }) => ({
    title: request.operation === "create" ? "创建部门审批" : "更新部门审批",
    summary: departmentApprovalSummary(request.latestPayload) || `部门审批 #${request.id}`,
    href: `/hr/roster?workflowId=${request.id}`,
  }),
  commitApprovedPayload: async ({ actorUserId, request }) => {
    if (!(await canProcessHrDepartmentRequest(actorUserId, request))) return serviceError("无权限审批该部门流程", 403);
    const result = request.operation === "create"
      ? await executeApprovedBusinessActionCommand({
          command: departmentCreateCommandAdapter,
          input: request.latestPayload.data as DepartmentCreateInput,
          context: { userId: request.submitterUserId },
        })
      : request.latestPayload.departmentId
        ? await executeApprovedBusinessActionCommand({
            command: departmentUpdateCommandAdapter,
            input: { ...request.latestPayload.data, id: request.latestPayload.departmentId } as DepartmentUpdateInput,
            context: { userId: request.submitterUserId },
          })
        : serviceError("流程单缺少部门 ID", 400);
    if (!result.ok) return serviceError(result.error, result.status || 400);
    const record = result.data as { record?: { id?: unknown }; department?: { id?: unknown } };
    const id = record.record?.id ?? record.department?.id ?? request.latestPayload.departmentId;
    if (!id) return serviceError("流程通过后未能取得部门 ID", 500);
    return serviceOk({ entityType: "hr.department", entityId: String(id) });
  },
};

const hrDepartmentApprovalLifecycle = bindApprovalLifecycle(hrDepartmentApprovalAdapter);

export async function executeCreateDepartmentWithWorkflowGuard(command: {
  body: Record<string, unknown>;
  userId: number;
}) {
  return executeDepartmentMutation(command, "create");
}

export async function executeUpdateDepartmentWithWorkflowGuard(command: {
  body: Record<string, unknown>;
  userId: number;
}) {
  return executeDepartmentMutation(command, "update");
}

async function executeDepartmentMutation(
  command: { body: Record<string, unknown>; userId: number },
  operation: ApprovalOperation,
) {
  const departmentId = operation === "update" ? nullablePositiveNumber(command.body.id) : null;
  if (operation === "update" && !departmentId) return serviceError("部门 ID 无效", 400);
  const context = { userId: command.userId };
  const authorize = () => evaluatePermissionAction(
    command.userId,
    HR_ROSTER_RESOURCE_KEY,
    operation === "create" ? "create" : "update",
  );
  const result = operation === "create"
    ? await executeBusinessActionCommand({
        command: departmentCreateCommandAdapter,
        input: command.body as DepartmentCreateInput,
        context,
        actorUserId: command.userId,
        authorize,
        forbiddenMessage: "无权限维护组织",
        workflow: {
          adapter: hrDepartmentApprovalAdapter,
          operation,
          prepare: (normalized) => preparedDepartmentPayload("create", null, normalized),
        },
      })
    : await executeBusinessActionCommand({
        command: departmentUpdateCommandAdapter,
        input: command.body as DepartmentUpdateInput,
        context,
        actorUserId: command.userId,
        authorize,
        forbiddenMessage: "无权限维护组织",
        workflow: {
          adapter: hrDepartmentApprovalAdapter,
          operation,
          subjectId: String(departmentId),
          prepare: (normalized) => preparedDepartmentPayload("update", departmentId, normalized),
        },
      });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, result: result.data.result })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

function preparedDepartmentPayload(
  operation: ApprovalOperation,
  departmentId: number | null,
  normalized: DepartmentCreateCommand | DepartmentUpdateCommand,
) {
  const data = operation === "create"
    ? normalized
    : "data" in normalized
      ? {
          id: normalized.id,
          ...normalized.data,
          managerEmployeeIds: normalized.managerEmployeeIds,
          descriptions: normalized.descriptions,
        }
      : normalized;
  return {
    resourceKey: HR_ROSTER_RESOURCE_KEY,
    scopeId: null,
    subjectId: departmentId ? String(departmentId) : null,
    businessActionKey: businessActionKeyFor(operation, null),
    workflowScopeType: "global",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "department" as const,
      departmentId,
      data: data as unknown as Record<string, unknown>,
    },
  };
}

export function buildListHrDepartmentSubmissionsRouteCommand(input: {
  userId: number;
  query: HrDepartmentSubmissionsQuery;
}): DomainValidationResult<{
  userId: number;
  statuses?: ApprovalStatus[];
}> {
  return okCommand({
    userId: input.userId,
    statuses: normalizeStatusFilter(input.query.status),
  });
}

export function executeListHrDepartmentSubmissionsRouteCommand(command: {
  userId: number;
  statuses?: ApprovalStatus[];
}) {
  return listRequests({
    adapter: hrDepartmentApprovalAdapter,
    actorUserId: command.userId,
    resourceKey: HR_ROSTER_RESOURCE_KEY,
    scopeId: null,
    statuses: command.statuses,
  });
}

export function buildCreateHrDepartmentSubmissionRouteCommand(input: {
  userId: number;
  body: HrDepartmentSubmissionBody;
}) {
  const operation = input.body.operation;
  const departmentId = nullablePositiveNumber(input.body.departmentId);
  if (operation === "update" && !departmentId) return failCommand("部门 ID 无效", 400, "departmentId");
  return okCommand({
    actorUserId: input.userId,
    operation,
    subjectId: departmentId ? String(departmentId) : null,
    payload: {
      entityType: "department" as const,
      departmentId,
      data: input.body.payload,
    },
    comment: input.body.comment ?? null,
  });
}

export function executeCreateHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: HrDepartmentApprovalPayload;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.createDraft(command);
}

export function buildHrDepartmentSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  body?: HrDepartmentSubmissionActionBody;
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: input.body?.payload,
    comment: input.body?.comment ?? null,
    expectedVersion: input.body?.version ?? null,
  });
}

export async function executeReviseHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  payload?: Record<string, unknown>;
  comment?: string | null;
  expectedVersion?: number | null;
}) {
  return hrDepartmentApprovalLifecycle.revise(command, mergeHrDepartmentSubmissionPayload);
}

export function executeSubmitHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.submit(command);
}

export function executeWithdrawHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.withdraw(command);
}

export function executeCancelHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.cancel(command);
}

export function executeCommentHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.comment(command);
}

export async function executeApproveHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.approve(command);
}

export function executeRejectHrDepartmentSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrDepartmentApprovalLifecycle.reject(command);
}

async function validateHrDepartmentApprovalPayload(input: {
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
}) {
  const raw = normalizeDepartmentApprovalPayload(input.payload);
  if (!raw.ok) return raw;
  if (input.operation === "create") {
    const command = await buildDepartmentCreateCommand(raw.data.data as DepartmentCreateInput);
    if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
    return serviceOk({
      resourceKey: HR_ROSTER_RESOURCE_KEY,
      scopeId: null,
      subjectId: null,
      businessActionKey: "hr.roster.department.create",
      workflowScopeType: "global",
      flowType: "approval" as const,
      separationPolicy: "auto_pass_if_authorized" as const,
      payload: {
        entityType: "department" as const,
        departmentId: null,
        data: command.data as unknown as Record<string, unknown>,
      },
    });
  }
  const departmentId = raw.data.departmentId ?? Number(input.subjectId);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return serviceError("部门 ID 无效", 400);
  const updateData = omitDepartmentIdField(raw.data.data);
  const updateInput = {
    ...updateData,
    id: departmentId,
  } as DepartmentUpdateInput;
  const command = await buildDepartmentUpdateCommand(updateInput);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  return serviceOk({
    resourceKey: HR_ROSTER_RESOURCE_KEY,
    scopeId: null,
    subjectId: String(departmentId),
    businessActionKey: "hr.roster.department.update",
    workflowScopeType: "global",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "department" as const,
      departmentId,
      data: updateInput as unknown as Record<string, unknown>,
    },
  });
}

function normalizeDepartmentApprovalPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return serviceError("流程草稿无效", 400);
  const input = payload as Partial<HrDepartmentApprovalPayload> & { data?: unknown };
  const data = input.data && typeof input.data === "object" ? input.data as Record<string, unknown> : {};
  return serviceOk({
    entityType: "department" as const,
    departmentId: nullablePositiveNumber(input.departmentId),
    data,
  } satisfies HrDepartmentApprovalPayload);
}

function businessActionKeyFor(operation: ApprovalOperation, _payload: Partial<HrDepartmentApprovalPayload> | null | undefined) {
  return operation === "create" ? "hr.roster.department.create" : "hr.roster.department.update";
}

function departmentApprovalSummary(payload: HrDepartmentApprovalPayload) {
  return String(payload.data.name || payload.data.code || "").trim();
}

async function canSubmitHrRosterWorkflow(userId: number) {
  return evaluatePermissionAction(userId, HR_ROSTER_RESOURCE_KEY, "submit");
}

async function canApproveHrRosterWorkflow(userId: number) {
  return evaluatePermissionAction(userId, HR_ROSTER_RESOURCE_KEY, "approve");
}

async function canProcessHrDepartmentRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<HrDepartmentApprovalPayload>,
) {
  const handlers = await resolveHrDepartmentHandlerUserIds(request.handlerSource, request);
  return handlers.includes(actorUserId);
}

async function resolveHrDepartmentHandlerUserIds(
  handlerSource: ApprovalHandlerSource,
  request: ApprovalRequestRecord<HrDepartmentApprovalPayload>,
  excludeUserId: number | null = null,
): Promise<number[]> {
  if (request.activeWorkflowNodeKey) {
    return resolveWorkflowNodeHandlerUserIds(request, {
      excludeUserId,
      resolveRelationship: (source): Promise<number[]> => resolveHrDepartmentHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }, excludeUserId),
      resolvePermission: () => listHrRosterApproverUserIds(excludeUserId),
    });
  }
  if (handlerSource === "direct_manager") return filterUserIds(await listDirectManagerUserIds(request.submitterUserId), excludeUserId);
  if (handlerSource === "department_owner") return filterUserIds(await listHrDepartmentOwnerUserIds(request.latestPayload), excludeUserId);
  return listHrRosterApproverUserIds(excludeUserId);
}

async function listHrDepartmentOwnerUserIds(payload: HrDepartmentApprovalPayload) {
  if (payload.departmentId) {
    const currentOwners = await listDepartmentResponsibleUserIds(payload.departmentId);
    if (currentOwners.length > 0) return currentOwners;
    const department = await prisma.department.findUnique({
      where: { id: payload.departmentId },
      select: { parentId: true },
    });
    return department?.parentId ? listDepartmentResponsibleUserIds(department.parentId) : [];
  }
  const parentId = nullablePositiveNumber(payload.data.parentId);
  return parentId ? listDepartmentResponsibleUserIds(parentId) : [];
}

async function listHrRosterApproverUserIds(excludeUserId: number | null) {
  const users = await prisma.user.findMany({
    where: { canLogin: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  const allowed = await Promise.all(users.map(async (user) => (
    await canApproveHrRosterWorkflow(user.id) ? user.id : null
  )));
  return allowed.filter((id): id is number => id !== null);
}

function filterUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}

function mergeHrDepartmentSubmissionPayload(
  request: ApprovalRequestDto<HrDepartmentApprovalPayload>,
  nextData: Record<string, unknown>,
): HrDepartmentApprovalPayload {
  return { ...request.latestPayload, data: nextData };
}

function omitDepartmentIdField(data: Record<string, unknown>) {
  const { id: _id, departmentId: _departmentId, ...rest } = data;
  return rest;
}

function normalizeStatusFilter(status: string | null | undefined): ApprovalStatus[] | undefined {
  if (!status) return undefined;
  const values = status.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed = new Set<ApprovalStatus>(["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled"]);
  const statuses = values.filter((value): value is ApprovalStatus => allowed.has(value as ApprovalStatus));
  return statuses.length ? statuses : undefined;
}

function nullablePositiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
