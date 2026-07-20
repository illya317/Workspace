import {
  type ApprovalAdapter,
  type ApprovalRequestRecord,
} from "@workspace/platform/server/approvals";
import { bindApprovalLifecycle } from "@workspace/platform/server/approval-lifecycle";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeApprovedBusinessActionCommand,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { listDepartmentResponsibleUserIds, isActiveEmployeeUser } from "@workspace/platform/server/business-space-natural-users";
import { mapValidationToServiceResult, okCommand } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  requestInclude,
  toDto,
  toRecord,
  type ApprovalRequestRowWithEvents,
} from "@workspace/platform/server/approvals/serialization";
import { canUseProject } from "./access";
import { buildProjectCreateCommand, type ProjectCreateCommand } from "./domain/project-validation";
import { commitProjectCreateCommand } from "./projects";
import { remainingProjectConfirmationHandlers } from "./project-approval-handlers";
import {
  WORK_PROJECT_CREATE_ACTION,
  WORK_PROJECT_CREATE_WORKFLOW_DEFAULTS,
  WORK_PROJECT_RESOURCE_KEY,
} from "./project-action-runtime";
import type { ProjectCreateInput } from "./schemas";

export type WorkProjectApprovalPayload = {
  entityType: "project";
  data: ProjectCreateInput;
};

const WORK_PROJECT_APPROVAL_SUBJECT = "work.project";
type ProjectCommandContext = { userId: number };

const projectCreateCommandAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: WORK_PROJECT_CREATE_ACTION,
  validatorKey: "packages/work/server/domain/project-validation.buildProjectCreateCommand",
  commitKey: "packages/work/server/projects.commitProjectCreateCommand",
  validate: async (input: ProjectCreateInput, context: ProjectCommandContext) => {
    const command = mapValidationToServiceResult(await buildProjectCreateCommand(context.userId, input));
    return command.ok ? validateProjectEnablingDepartmentHandlers(command.data) : command;
  },
  commit: (command: ProjectCreateCommand, context: ProjectCommandContext) => (
    commitProjectCreateCommand(command, context.userId)
  ),
});

export const workProjectApprovalAdapter: ApprovalAdapter<WorkProjectApprovalPayload> = {
  subjectType: WORK_PROJECT_APPROVAL_SUBJECT,
  workflowDefaults: WORK_PROJECT_CREATE_WORKFLOW_DEFAULTS,
  validatePayload: async ({ actorUserId, operation, payload }) => {
    if (operation !== "create") return serviceError("项目确认流程只支持新建项目", 400);
    const normalized = normalizeProjectApprovalPayload(payload);
    if (!normalized) return serviceError("项目确认载荷无效", 400);
    const command = await validateProjectCreateForSubmission(actorUserId, normalized.data);
    if (!command.ok) return command;
    return serviceOk({
      resourceKey: WORK_PROJECT_RESOURCE_KEY,
      scopeId: null,
      subjectId: null,
      businessActionKey: WORK_PROJECT_CREATE_ACTION,
      workflowScopeType: "global",
      flowType: "approval" as const,
      separationPolicy: "auto_pass_if_authorized" as const,
      payload: normalized,
    });
  },
  resolveAccess: async ({ actorUserId, action, request }) => {
    if (action === "listRequests") return canUseProject(actorUserId);
    if (action === "createDraft") return Boolean(await canUseProject(actorUserId) && await isActiveEmployeeUser(actorUserId));
    if (action === "approve" || action === "reject" || action === "reviewUpdate") {
      return Boolean(request && request.status === "submitted" && await canProcessProjectRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (request.submitterUserId === actorUserId || await canProcessProjectRequest(actorUserId, request)));
    }
    return false;
  },
  resolveHandlers: ({ request }) => resolveProjectHandlerUserIds(request),
  resolveRecipients: async ({ eventType, request }) => {
    if (eventType === "submit") return resolveProjectHandlerUserIds(request);
    if (eventType === "approve" || eventType === "reject" || eventType === "comment") return [request.submitterUserId];
    return [];
  },
  describeRequest: ({ request }) => ({
    title: "项目赋能确认",
    summary: `${request.latestPayload.data.name} · ${request.latestPayload.data.enablingDepartmentIds?.length ?? 0} 个赋能部门`,
    href: `/settings/account?tab=notifications&workflowRequestId=${request.id}`,
  }),
  commitApprovedPayload: async ({ actorUserId, request }) => {
    if (!(await canProcessProjectRequest(actorUserId, request))) return serviceError("无权限确认该项目", 403);
    const result = await executeApprovedBusinessActionCommand({
      command: projectCreateCommandAdapter,
      input: request.latestPayload.data,
      context: { userId: request.submitterUserId },
    });
    if (!result.ok) return result;
    const record = result.data as { record?: { id?: unknown } };
    const id = Number(record.record?.id);
    if (!Number.isInteger(id) || id <= 0) return serviceError("确认通过后未能取得项目 ID", 500);
    return serviceOk({ entityType: "work.project", entityId: String(id) });
  },
};

const projectApprovalLifecycle = bindApprovalLifecycle(workProjectApprovalAdapter);

export async function executeCreateProjectWithWorkflowGuard(command: { userId: number; body: ProjectCreateInput }) {
  const result = await executeBusinessActionCommand({
    command: projectCreateCommandAdapter,
    input: command.body,
    context: { userId: command.userId },
    actorUserId: command.userId,
    authorize: () => canUseProject(command.userId),
    forbiddenMessage: "无权限发起项目",
    workflow: {
      adapter: workProjectApprovalAdapter,
      operation: "create",
      prepare: () => ({
        resourceKey: WORK_PROJECT_RESOURCE_KEY,
        scopeId: null,
        subjectId: null,
        businessActionKey: WORK_PROJECT_CREATE_ACTION,
        workflowScopeType: "global",
        flowType: "approval" as const,
        separationPolicy: "auto_pass_if_authorized" as const,
        payload: { entityType: "project" as const, data: command.body },
      }),
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "workflow"
    ? serviceOk({ executionMode: "workflow" as const, request: result.data.request })
    : serviceOk({ executionMode: "direct" as const, result: result.data.result });
}

export function buildProjectSubmissionViewRouteCommand(input: { userId: number; requestId: number }) {
  return okCommand({ actorUserId: input.userId, requestId: input.requestId });
}

export async function executeGetProjectSubmissionRouteCommand(command: { actorUserId: number; requestId: number }) {
  const row = await prisma.approvalRequest.findUnique({ where: { id: command.requestId }, include: requestInclude });
  if (!row || row.subjectType !== WORK_PROJECT_APPROVAL_SUBJECT) return serviceError("项目确认单不存在", 404);
  const dto = toDto<WorkProjectApprovalPayload>(row as ApprovalRequestRowWithEvents);
  const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
  const canProcess = dto.status === "submitted" && await canProcessProjectRequest(command.actorUserId, record);
  if (!canProcess && dto.submitterUserId !== command.actorUserId) return serviceError("无权限查看项目确认单", 403);
  const departmentIds = Array.from(new Set([
    ...(dto.latestPayload.data.leadingDepartmentId ? [dto.latestPayload.data.leadingDepartmentId] : []),
    ...(dto.latestPayload.data.enablingDepartmentIds ?? []),
  ]));
  const memberIds = Array.from(new Set((dto.latestPayload.data.members ?? []).map((member) => member.employeeId)));
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true, code: true } }),
    prisma.employee.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, employeeId: true } }),
  ]);
  return { request: { ...dto, canProcess, departments, employees } };
}

export function buildProjectSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  body?: { comment?: string | null; version?: number | null };
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    comment: input.body?.comment ?? null,
    expectedVersion: input.body?.version ?? null,
  });
}

export function executeApproveProjectSubmissionRouteCommand(command: Parameters<typeof projectApprovalLifecycle.approve>[0]) {
  return projectApprovalLifecycle.approve(command);
}

export function executeRejectProjectSubmissionRouteCommand(command: Parameters<typeof projectApprovalLifecycle.reject>[0]) {
  return projectApprovalLifecycle.reject(command);
}

export function executeCommentProjectSubmissionRouteCommand(command: Parameters<typeof projectApprovalLifecycle.comment>[0]) {
  return projectApprovalLifecycle.comment(command);
}

async function canProcessProjectRequest(userId: number, request: ApprovalRequestRecord<WorkProjectApprovalPayload>) {
  return (await resolveProjectHandlerUserIds(request)).includes(userId);
}

async function resolveProjectHandlerUserIds(request: ApprovalRequestRecord<WorkProjectApprovalPayload>) {
  const departmentIds = request.latestPayload.data.enablingDepartmentIds ?? [];
  const handlers = (await Promise.all(
    departmentIds.map((departmentId) => listDepartmentResponsibleUserIds(departmentId)),
  )).flat();
  return remainingProjectConfirmationHandlers(handlers, request.submitterUserId);
}

function normalizeProjectApprovalPayload(value: unknown): WorkProjectApprovalPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Partial<WorkProjectApprovalPayload>;
  if (payload.entityType !== "project" || !payload.data || typeof payload.data !== "object") return null;
  return payload as WorkProjectApprovalPayload;
}

async function validateProjectCreateForSubmission(userId: number, input: ProjectCreateInput) {
  const command = mapValidationToServiceResult(await buildProjectCreateCommand(userId, input));
  if (!command.ok) return command;
  return validateProjectEnablingDepartmentHandlers(command.data);
}

async function validateProjectEnablingDepartmentHandlers(command: ProjectCreateCommand) {
  for (const departmentId of command.enablingDepartmentIds) {
    const handlers = await listDepartmentResponsibleUserIds(departmentId);
    if (handlers.length === 0) {
      const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
      return serviceError(`赋能部门「${department?.name ?? departmentId}」未配置负责人，不能提交确认`, 409);
    }
  }
  return serviceOk(command);
}
