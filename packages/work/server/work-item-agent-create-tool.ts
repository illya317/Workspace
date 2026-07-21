import { prisma } from "@workspace/platform/server/prisma";
import {
  createProposal,
  type AgentExecutionContext,
  type AgentTool,
  type ProposalExecutorControl,
  type ProposalExecutors,
} from "@workspace/platform/server/agent";

import { canCreateWorkTaskAction, type WorkSpaceTargetType } from "./access";
import {
  buildAgentCreateWorkItemBody,
  parseAgentCreateWorkItemInput,
  parseStoredAgentCreateWorkItem,
  type AgentCreateWorkItemInput,
} from "./domain/agent-work-item-create-validation";
import { buildAgentWorkItemCreateDiff } from "./domain/agent-work-item-proposal-diff";
import { firstAgentWorkItemValidationMessage } from "./domain/agent-work-item-proposal-validation";
import { validateCreateItemApprovalPayload } from "./task-approval-adapter";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import { validateAgentCreateWorkItemReferences } from "./work-item-agent-reference-validation";
import { sharedAgentWorkSpace } from "./work-item-agent-space-access";
import { assertSharedAgentWorkItemStageAllowed } from "./work-item-agent-stage-access";
import { executeCreateWorkItemRouteCommand } from "./work-item-mutation-executor";
import {
  buildCreateWorkItemRouteCommand,
  type CreateWorkItemRouteCommand,
} from "./work-task-route-command";

const WORK_ENTRY = { resourceKey: "work.tasks", action: "entry" } as const;
export const CREATE_WORK_ITEM_ACTION = "work.createWorkItem";
const SEARCH_REFERENCE_OPTIONS_ACTION = "work.searchReferenceOptions";
const nullablePositiveInteger = { type: ["integer", "null"], minimum: 1 };
const nullableDateOnly = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "严格 YYYY-MM-DD；传 null 表示未设置",
};

export const createWorkItemTool: AgentTool = {
  key: CREATE_WORK_ITEM_ACTION,
  label: "创建 Work 工作节点",
  description: "在已有 OKR 计划中创建一个目标、KR 或任务。只接受人工表单中的业务数据并生成待确认提案；用户确认后才按本人同一 create 权限、空间范围、治理阶段和审批策略执行。不能修改源码、文件、部署或服务器配置。KR/任务需引用已确认存在的根目标 ID。",
  parameters: {
    type: "object",
    properties: {
      targetType: { type: "string", enum: ["personal", "department", "project"] },
      targetId: { type: "integer", minimum: 1 },
      planId: { type: "integer", minimum: 1 },
      itemType: { type: "string", enum: ["objective", "key_result", "task"] },
      content: { type: "string", minLength: 1 },
      description: { type: "string" },
      importance: { type: "integer", minimum: 1, maximum: 5, description: "仅任务可用" },
      urgency: { type: "integer", minimum: 1, maximum: 5, description: "仅任务可用" },
      status: { type: "string", enum: ["active", "paused", "done"] },
      krStartValue: { type: ["number", "null"] },
      krTargetValue: { type: ["number", "null"] },
      krCurrentValue: { type: ["number", "null"] },
      krUnit: { type: ["string", "null"] },
      ownerEmployeeId: { ...nullablePositiveInteger, description: `只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的 Employee ID` },
      collaborationId: { ...nullablePositiveInteger, description: `仅部门任务可用；只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的协作 ID` },
      actualStartDate: nullableDateOnly,
      actualEndDate: nullableDateOnly,
      plannedStartDate: nullableDateOnly,
      plannedEndDate: nullableDateOnly,
      isMilestone: { type: "boolean", description: "仅目标可用" },
      milestoneDate: nullableDateOnly,
      parentWorkItemId: { ...nullablePositiveInteger, description: "KR 或任务必填；使用同一计划根目标的 WorkItem ID" },
    },
    required: ["targetType", "targetId", "planId", "itemType", "content"],
    additionalProperties: false,
  },
  examples: [{
    user: "在刚才查到的季度计划里创建目标“完成客户交付”",
    arguments: {
      targetType: "personal",
      targetId: 11,
      planId: 72,
      itemType: "objective",
      content: "完成客户交付",
    },
  }],
  requiredPermissions: [WORK_ENTRY],
  policyActions: ["create"],
  delegatedExecution: true,
  mutates: true,

  async execute(params, execution) {
    const parsed = parseAgentCreateWorkItemInput(params);
    if (!parsed.success) return { type: "error", message: firstAgentWorkItemValidationMessage(parsed.error) };
    const input = parsed.data;
    const space = await sharedAgentWorkSpace(execution, input.targetType, input.targetId);
    if (!space?.actionPermissions.canCreate || !(await sharedScopedCreateAllowed(execution, input.targetType, input.targetId))) {
      return { type: "error", message: "工作空间不存在或不可创建节点" };
    }
    const plan = await availablePlan(input.planId, input.targetType, input.targetId);
    if (!plan) return { type: "error", message: "OKR 计划不存在或不可创建节点" };
    const preflight = await prepareCreateProposal(execution, input, await nextSortOrder(input.planId));
    if (!preflight.ok) return { type: "error", message: preflight.error };
    const diff = buildAgentWorkItemCreateDiff({
      spaceName: space.name,
      planTitle: plan.title,
      changes: input,
      referenceLabels: preflight.referenceLabels,
    });
    const proposal = await createProposal(execution, {
      actionKey: CREATE_WORK_ITEM_ACTION,
      toolKey: CREATE_WORK_ITEM_ACTION,
      targetType: "WorkPlan",
      targetId: String(input.planId),
      payload: { input, sortOrder: preflight.sortOrder },
      diff,
    });
    return {
      type: "proposal",
      message: "工作节点创建提案已生成；用户确认后才会写入或进入现有审批流程。",
      proposal: {
        id: proposal.proposalId,
        actionKey: CREATE_WORK_ITEM_ACTION,
        targetType: "WorkPlan",
        targetId: String(input.planId),
        diff,
      },
    };
  },
};

async function executeCreateWorkItemProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
  control: ProposalExecutorControl,
) {
  const parsed = parseStoredAgentCreateWorkItem(payload);
  if (!parsed.success) throw new Error(firstAgentWorkItemValidationMessage(parsed.error));
  const input = parsed.data.input;
  await assertSharedScopedCreate(execution, input.targetType, input.targetId);
  const plan = await availablePlan(input.planId, input.targetType, input.targetId);
  if (!plan) throw new Error("OKR 计划不存在或不可创建节点");
  const prepared = await prepareCreateProposal(execution, input, parsed.data.sortOrder);
  if (!prepared.ok) throw new Error(prepared.error);
  control.markExternalDispatchStarted();
  const result = await executeCreateWorkItemRouteCommand(prepared.command);
  if (!result.ok) throw new Error(result.error);
  return { success: true, ...result.data };
}

export const workItemNewNodeProposalExecutors: ProposalExecutors = {
  [CREATE_WORK_ITEM_ACTION]: {
    toolKey: CREATE_WORK_ITEM_ACTION,
    requiredPermissions: [WORK_ENTRY],
    policyActions: ["create"],
    delegatedExecution: true,
    failureMayHaveSideEffects: true,
    uncertainFailureBoundary: "external_dispatch",
    execute: executeCreateWorkItemProposal,
  },
};

async function prepareCreateProposal(
  execution: AgentExecutionContext,
  input: AgentCreateWorkItemInput,
  sortOrder: number,
) {
  const stage = await assertSharedAgentWorkItemStageAllowed({
    execution,
    action: "create",
    planId: input.planId,
    itemType: input.itemType,
    changesKrCurrentValue: input.itemType === "key_result" && input.krCurrentValue != null,
  });
  if (!stage.ok) return { ok: false as const, error: stage.error };
  const references = await validateAgentCreateWorkItemReferences({
    execution,
    changes: input,
    snapshot: {
      targetType: input.targetType,
      targetId: input.targetId,
      planId: input.planId,
      category: "non-routine",
      itemType: input.itemType,
      routineTaskType: null,
      ownerEmployeeId: null,
      collaborationId: null,
      parentWorkItemId: null,
    },
  });
  if (!references.ok) return references;
  const command = await buildCreateWorkItemRouteCommand({
    user: { userId: execution.actor.id },
    body: buildAgentCreateWorkItemBody(input, sortOrder),
  });
  if (!command.ok) return { ok: false as const, error: command.issue.message };
  const approval = await validateSharedCreateApproval(execution, command.data);
  if (!approval.ok) return { ok: false as const, error: approval.error };
  return {
    ok: true as const,
    command: command.data,
    referenceLabels: references.labels,
    sortOrder,
  };
}

async function validateSharedCreateApproval(
  execution: AgentExecutionContext,
  command: CreateWorkItemRouteCommand,
) {
  const { actorUserId: _actorUserId, targetType, targetId, ...data } = command;
  const payload = {
    entityType: "item",
    targetType,
    targetId,
    workId: null,
    data,
  } as unknown as WorkTaskItemApprovalPayload;
  const userIds = [...new Set([execution.requester.id, execution.actor.id])];
  const results = await Promise.all(userIds.map((userId) => validateCreateItemApprovalPayload(userId, payload)));
  return results.find((result) => !result.ok) ?? results[0] ?? { ok: false as const, error: "工作节点创建校验失败" };
}

async function availablePlan(
  planId: number,
  targetType: "personal" | "department" | "project",
  targetId: number,
) {
  return prisma.workPlan.findFirst({
    where: {
      id: planId,
      targetType,
      targetId,
      kind: "okr",
      status: { not: "done" },
      isArchived: false,
    },
    select: { id: true, title: true },
  });
}

async function nextSortOrder(planId: number) {
  const aggregate = await prisma.workItem.aggregate({
    where: { planId },
    _max: { sortOrder: true },
  });
  return Math.max(0, (aggregate._max.sortOrder ?? -1) + 1);
}

async function sharedScopedCreateAllowed(
  execution: AgentExecutionContext,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  const userIds = [...new Set([execution.requester.id, execution.actor.id])];
  const allowed = await Promise.all(userIds.map((userId) => canCreateWorkTaskAction(userId, targetType, targetId)));
  return allowed.every(Boolean);
}

async function assertSharedScopedCreate(
  execution: AgentExecutionContext,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  if (!(await sharedScopedCreateAllowed(execution, targetType, targetId))) {
    throw new Error("工作空间不存在或不可创建节点");
  }
}
