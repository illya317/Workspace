import { bindApprovalLifecycle } from "@workspace/platform/server/approval-lifecycle";
import {
  describeApprovalRequestFromContract,
  listRequests,
  parseApprovalRequestStatusList,
  type ApprovalAdapter,
  type ApprovalHandlerSource,
  type ApprovalRequestRecord,
  type ApprovalStatus,
} from "@workspace/platform/server/approvals";
import { resolveWorkflowNodeHandlerUserIds } from "@workspace/platform/server/approvals/workflow-node-handlers";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import {
  defineBusinessActionCommandAdapter,
  executeApprovedBusinessActionCommand,
  executeBusinessActionCommand,
  resolveBusinessActionRuntime,
} from "@workspace/platform/server/business-action-executor";
import { mapValidationToServiceResult, okCommand } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import type { CreateFinanceAssetCardInput } from "../../types/assets";
import {
  buildCreateFinanceAssetCardRouteCommand,
  executeCreateFinanceAssetCardRouteCommand,
} from "./route-commands";
import type { FinanceAssetCardCreateCommand } from "./validation";

const FINANCE_ASSETS_RESOURCE_KEY = "finance.assets";
const FINANCE_ASSET_CREATE_ACTION_KEY = "finance.assets.asset.create";
const FINANCE_ASSET_APPROVAL_SUBJECT = "finance.assets.asset";

export type FinanceAssetCardApprovalPayload = {
  entityType: "asset_card";
  data: CreateFinanceAssetCardInput;
};

type AssetCreateContext = { userId: number };

const assetCreateCommandAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: FINANCE_ASSET_CREATE_ACTION_KEY,
  validatorKey: "packages/finance/server/assets/route-commands.buildCreateFinanceAssetCardRouteCommand",
  commitKey: "packages/finance/server/assets/route-commands.executeCreateFinanceAssetCardRouteCommand",
  validate: async (input: CreateFinanceAssetCardInput, context: AssetCreateContext) => (
    mapValidationToServiceResult(await buildCreateFinanceAssetCardRouteCommand(input, context.userId))
  ),
  commit: async (command: FinanceAssetCardCreateCommand) => {
    try {
      return serviceOk(await executeCreateFinanceAssetCardRouteCommand(command));
    } catch (error) {
      return serviceError(error instanceof Error ? error.message : "资产卡片创建失败", 400);
    }
  },
});

export const financeAssetCardApprovalAdapter: ApprovalAdapter<FinanceAssetCardApprovalPayload> = {
  subjectType: FINANCE_ASSET_APPROVAL_SUBJECT,
  workflowDefaults: () => financeAssetWorkflowDefaults(),
  validatePayload: async ({ actorUserId, operation, payload, request }) => {
    if (operation !== "create") return serviceError("资产建卡审批操作无效", 400);
    const normalized = normalizeAssetApprovalPayload(payload);
    if (!normalized.ok) return normalized;
    const submitterUserId = request?.submitterUserId ?? actorUserId;
    const command = await buildCreateFinanceAssetCardRouteCommand(normalized.data.data, submitterUserId);
    if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
    if (!command.data.category.reviewRequired) {
      return serviceError("当前资产分类不要求录入前复核，请直接保存", 409);
    }
    return serviceOk(preparedAssetApprovalPayload(command.data.input));
  },
  resolveAccess: async ({ actorUserId, action, request }) => {
    if (action === "listRequests") return evaluatePermissionAction(actorUserId, FINANCE_ASSETS_RESOURCE_KEY, "read");
    if (action === "createDraft") return evaluatePermissionAction(actorUserId, FINANCE_ASSETS_RESOURCE_KEY, "submit");
    if (action === "approve" || action === "reject" || action === "reviewUpdate") {
      return Boolean(request && await canProcessFinanceAssetRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (request.submitterUserId === actorUserId || await canProcessFinanceAssetRequest(actorUserId, request)));
    }
    return false;
  },
  resolveHandlers: ({ handlerSource, request }) => resolveFinanceAssetHandlerUserIds(handlerSource, request),
  resolveRecipients: async ({ eventType, actorUserId, request }) => {
    if (eventType === "submit") return resolveFinanceAssetHandlerUserIds(request.handlerSource, request, actorUserId);
    if (eventType === "approve" || eventType === "reject" || eventType === "review") return [request.submitterUserId];
    return [];
  },
  describeRequest: ({ request }) => describeApprovalRequestFromContract(request),
  commitApprovedPayload: async ({ actorUserId, request, approvalAuthorization }) => {
    if (!(await canProcessFinanceAssetRequest(actorUserId, request))) return serviceError("无权审批该资产建卡申请", 403);
    const result = await executeApprovedBusinessActionCommand({
      command: assetCreateCommandAdapter,
      input: request.latestPayload.data,
      context: { userId: request.submitterUserId },
      approvalAuthorization,
      approvalRequest: request,
    });
    if (!result.ok) return result;
    return serviceOk({ entityType: "finance.asset", entityId: result.data.id });
  },
};

const financeAssetApprovalLifecycle = bindApprovalLifecycle(financeAssetCardApprovalAdapter);

export async function executeCreateFinanceAssetCardWithWorkflow(command: {
  input: CreateFinanceAssetCardInput;
  userId: number;
}) {
  return executeBusinessActionCommand({
    command: assetCreateCommandAdapter,
    input: command.input,
    context: { userId: command.userId },
    actorUserId: command.userId,
    authorize: () => evaluatePermissionAction(command.userId, FINANCE_ASSETS_RESOURCE_KEY, "create"),
    forbiddenMessage: "无权创建资产卡片",
    workflow: {
      applicable: (normalized) => normalized.category.reviewRequired,
      adapter: financeAssetCardApprovalAdapter,
      operation: "create",
      prepare: (normalized) => preparedAssetApprovalPayload(normalized.input),
    },
  });
}

export async function resolveFinanceAssetCreateActionRuntimes(actorUserId: number) {
  const [canDirectWrite, canStartWorkflow, canProcessWorkflow] = await Promise.all([
    evaluatePermissionAction(actorUserId, FINANCE_ASSETS_RESOURCE_KEY, "create"),
    evaluatePermissionAction(actorUserId, FINANCE_ASSETS_RESOURCE_KEY, "submit"),
    evaluatePermissionAction(actorUserId, FINANCE_ASSETS_RESOURCE_KEY, "approve"),
  ]);
  const actor = { userId: actorUserId, canDirectWrite, canStartWorkflow, canProcessWorkflow };
  const defaults = financeAssetWorkflowDefaults();
  const [direct, review] = await Promise.all([
    resolveBusinessActionRuntime({
      businessActionKey: FINANCE_ASSET_CREATE_ACTION_KEY,
      actor,
      workflowApplicable: false,
      resourceKey: FINANCE_ASSETS_RESOURCE_KEY,
      scopeType: "global",
      scopeId: null,
      defaults,
    }),
    resolveBusinessActionRuntime({
      businessActionKey: FINANCE_ASSET_CREATE_ACTION_KEY,
      actor,
      workflowApplicable: true,
      resourceKey: FINANCE_ASSETS_RESOURCE_KEY,
      scopeType: "global",
      scopeId: null,
      defaults,
    }),
  ]);
  return { direct, review };
}

export function buildListFinanceAssetSubmissionsRouteCommand(input: {
  userId: number;
  status?: string;
}) {
  return okCommand({
    userId: input.userId,
    statuses: normalizeStatusFilter(input.status),
  });
}

export function executeListFinanceAssetSubmissionsRouteCommand(command: {
  userId: number;
  statuses?: ApprovalStatus[];
}) {
  return listRequests({
    adapter: financeAssetCardApprovalAdapter,
    actorUserId: command.userId,
    resourceKey: FINANCE_ASSETS_RESOURCE_KEY,
    scopeId: null,
    statuses: command.statuses,
  });
}

export function buildFinanceAssetSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  version?: number | null;
  comment?: string | null;
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    expectedVersion: input.version ?? null,
    comment: input.comment ?? null,
  });
}

export const executeApproveFinanceAssetSubmissionRouteCommand = financeAssetApprovalLifecycle.approve;
export const executeRejectFinanceAssetSubmissionRouteCommand = financeAssetApprovalLifecycle.reject;
export const executeWithdrawFinanceAssetSubmissionRouteCommand = financeAssetApprovalLifecycle.withdraw;
export const executeCancelFinanceAssetSubmissionRouteCommand = financeAssetApprovalLifecycle.cancel;

function preparedAssetApprovalPayload(data: CreateFinanceAssetCardInput) {
  return {
    resourceKey: FINANCE_ASSETS_RESOURCE_KEY,
    scopeId: null,
    subjectId: null,
    businessActionKey: FINANCE_ASSET_CREATE_ACTION_KEY,
    workflowScopeType: "global",
    flowType: "approval" as const,
    separationPolicy: "independent_required" as const,
    payload: {
      entityType: "asset_card" as const,
      data,
    },
  };
}

function financeAssetWorkflowDefaults() {
  return {
    businessActionKey: FINANCE_ASSET_CREATE_ACTION_KEY,
    mode: "required" as const,
    flowType: "approval" as const,
    separationPolicy: "independent_required" as const,
    handlerSource: "permission" as const,
  };
}

function normalizeAssetApprovalPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return serviceError("资产建卡审批数据无效", 400);
  const raw = payload as Partial<FinanceAssetCardApprovalPayload>;
  if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) return serviceError("资产建卡审批数据无效", 400);
  return serviceOk({ entityType: "asset_card" as const, data: raw.data as CreateFinanceAssetCardInput });
}

async function canProcessFinanceAssetRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<FinanceAssetCardApprovalPayload>,
) {
  const handlers = await resolveFinanceAssetHandlerUserIds(request.handlerSource, request);
  return handlers.includes(actorUserId);
}

async function resolveFinanceAssetHandlerUserIds(
  handlerSource: ApprovalHandlerSource,
  request: ApprovalRequestRecord<FinanceAssetCardApprovalPayload>,
  excludeUserId: number | null = request.submitterUserId,
): Promise<number[]> {
  if (request.activeWorkflowNodeKey) {
    return resolveWorkflowNodeHandlerUserIds(request, {
      excludeUserId,
      resolveRelationship: (source): Promise<number[]> => resolveFinanceAssetHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }, excludeUserId),
      resolvePermission: () => listFinanceAssetApproverUserIds(excludeUserId),
    });
  }
  if (handlerSource !== "permission") return [];
  return listFinanceAssetApproverUserIds(excludeUserId);
}

async function listFinanceAssetApproverUserIds(excludeUserId: number | null) {
  const users = await prisma.user.findMany({
    where: { canLogin: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  const allowed = await Promise.all(users.map(async ({ id }) => (
    await evaluatePermissionAction(id, FINANCE_ASSETS_RESOURCE_KEY, "approve") ? id : null
  )));
  return allowed.filter((id): id is number => id !== null);
}

function normalizeStatusFilter(status: string | null | undefined): ApprovalStatus[] | undefined {
  return parseApprovalRequestStatusList(status);
}
