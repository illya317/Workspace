import { prisma } from "@workspace/platform/server/prisma";
import {
  createProposal,
  type AgentExecutionContext,
  type AgentTool,
  type ProposalExecutorControl,
  type ProposalExecutors,
} from "@workspace/platform/server/agent";
import {
  canCreateWorkTaskAction,
  canUpdateWorkTaskAction,
  type WorkSpaceTargetType,
} from "./access";
import { intersectWorkSpaces } from "./agent-work-overview-model";
import {
  firstAgentWorkItemValidationMessage,
  parseAgentCreateWorkItemInput,
  parseAgentUpdateWorkItemInput,
  parseStoredAgentCreateWorkItem,
  parseStoredAgentUpdateWorkItem,
  type AgentCreateWorkItemInput,
  type AgentUpdateWorkItemInput,
} from "./domain/agent-work-item-proposal-validation";
import {
  validateCreateItemApprovalPayload,
  validateUpdateItemApprovalPayload,
} from "./task-approval-adapter";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import { listWorkTaskSpaces, type WorkTaskSpace } from "./task-spaces";
import {
  buildCreateWorkItemRouteCommand,
  buildUpdateWorkItemRouteCommand,
} from "./work-task-route-command";
import {
  executeCreateWorkItemRouteCommand,
  executeUpdateWorkItemRouteCommand,
} from "./work-item-mutation-executor";

const WORK_ENTRY = { resourceKey: "work.tasks", action: "entry" } as const;
const CREATE_WORK_ITEM_ACTION = "work.createWorkItem";
const UPDATE_WORK_ITEM_ACTION = "work.updateWorkItem";
const targetTypeSchema = { type: "string", enum: ["personal", "department", "project"] };
const nullablePositiveInteger = { type: ["integer", "null"], minimum: 1 };
const nullableDate = { type: ["string", "null"], description: "YYYY-MM-DD；传 null 表示清空" };

const mutableWorkItemProperties = {
  planId: { ...nullablePositiveInteger, description: "所属工作计划 ID" },
  category: { type: "string", enum: ["routine", "non-routine"] },
  itemType: { type: "string", enum: ["objective", "key_result", "task"] },
  content: { type: "string", minLength: 1, maxLength: 2000 },
  description: { type: "string", maxLength: 8000 },
  importance: { type: "integer", minimum: 0, maximum: 10 },
  urgency: { type: "integer", minimum: 0, maximum: 10 },
  status: { type: ["string", "null"], enum: ["active", "paused", "done", null] },
  krStartValue: { type: ["number", "null"] },
  krTargetValue: { type: ["number", "null"] },
  krCurrentValue: { type: ["number", "null"] },
  krUnit: { type: ["string", "null"], maxLength: 100 },
  routineTaskType: { type: ["string", "null"], enum: ["standing", "task", null] },
  ownerEmployeeId: { ...nullablePositiveInteger, description: "负责人 Employee 数字 ID" },
  collaborationId: nullablePositiveInteger,
  actualStartDate: nullableDate,
  actualEndDate: nullableDate,
  plannedStartDate: nullableDate,
  plannedEndDate: nullableDate,
  isMilestone: { type: "boolean" },
  milestoneDate: nullableDate,
  sourceDepartmentId: nullablePositiveInteger,
  linkedProjectId: nullablePositiveInteger,
  linkedProjectPhaseId: nullablePositiveInteger,
  parentWorkItemId: nullablePositiveInteger,
  responsibilityNodeId: nullablePositiveInteger,
  responsibilityPositionId: nullablePositiveInteger,
  participants: { type: "string", maxLength: 2000, description: "参与人姓名，使用逗号分隔" },
  sortOrder: { type: "integer" },
} satisfies Record<string, unknown>;

export const getWorkSpaceDetailTool: AgentTool = {
  key: "work.getSpaceDetail",
  label: "读取 Work 空间明细",
  description: "读取一个有权访问的个人、部门或项目 Work 空间中的计划与工作节点，返回后续修改所需的真实 ID、当前内容和更新时间。修改前必须先用本工具定位目标，不得猜测 ID。",
  parameters: {
    type: "object",
    properties: {
      targetType: targetTypeSchema,
      targetId: { type: "integer", minimum: 1 },
      planId: { type: "integer", minimum: 1, description: "可选；只读取指定计划的节点" },
    },
    required: ["targetType", "targetId"],
    additionalProperties: false,
  },
  requiredPermissions: [WORK_ENTRY],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const target = parseTarget(params);
    if (!target) return { type: "error", message: "Work 空间参数无效" };
    const planId = positiveInteger(params.planId);
    if (params.planId !== undefined && !planId) return { type: "error", message: "工作计划 ID 无效" };
    const space = await sharedWorkSpace(execution, target.targetType, target.targetId);
    if (!space) return { type: "error", message: "无权限读取该 Work 空间" };
    const [plans, items] = await Promise.all([
      prisma.workPlan.findMany({
        where: { targetType: target.targetType, targetId: target.targetId, isArchived: false },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          kind: true,
          title: true,
          description: true,
          status: true,
          ownerEmployeeId: true,
          okrCycleId: true,
          periodType: true,
          plannedStartDate: true,
          plannedEndDate: true,
          updatedAt: true,
        },
      }),
      prisma.workItem.findMany({
        where: {
          targetType: target.targetType,
          targetId: target.targetId,
          isArchived: false,
          ...(planId ? { planId } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          planId: true,
          itemType: true,
          category: true,
          content: true,
          description: true,
          status: true,
          ownerEmployeeId: true,
          plannedStartDate: true,
          plannedEndDate: true,
          actualStartDate: true,
          actualEndDate: true,
          parentWorkItemId: true,
          krCurrentValue: true,
          krTargetValue: true,
          krUnit: true,
          updatedAt: true,
        },
      }),
    ]);
    const data = {
      space: {
        targetType: space.targetType,
        targetId: space.targetId,
        name: space.name,
        allowedActions: allowedActionNames(space),
      },
      plans: plans.map(serializeDates),
      items: items.map(serializeDates),
      truncated: { plans: plans.length === 50, items: items.length === 100 },
    };
    return {
      type: plans.length || items.length ? "data" : "empty",
      message: `已读取「${space.name}」的 ${plans.length} 个计划和 ${items.length} 个工作节点。`,
      data,
      modelContext: data,
    };
  },
};

export const createWorkItemTool: AgentTool = {
  key: CREATE_WORK_ITEM_ACTION,
  label: "新建 Work 工作节点",
  description: "在用户明确要求写入后，为其有 create 权限的个人、部门或项目空间生成目标、KR 或任务的新建提案。只生成待确认提案；确认后复用网页端同一领域校验、scoped 权限和审批策略。",
  parameters: {
    type: "object",
    properties: {
      targetType: targetTypeSchema,
      targetId: { type: "integer", minimum: 1 },
      ...mutableWorkItemProperties,
      content: { type: "string", minLength: 1, maxLength: 2000 },
    },
    required: ["targetType", "targetId", "content"],
    additionalProperties: false,
  },
  examples: [{
    user: "在部门空间 825 的计划 12 下新增任务：完成月度经营分析，7 月 31 日前完成",
    arguments: {
      targetType: "department",
      targetId: 825,
      planId: 12,
      category: "non-routine",
      itemType: "task",
      content: "完成月度经营分析",
      plannedEndDate: "2026-07-31",
    },
  }],
  requiredPermissions: [WORK_ENTRY],
  policyActions: ["create"],
  delegatedExecution: true,
  mutates: true,

  async execute(params, execution) {
    const parsed = parseAgentCreateWorkItemInput(params);
    if (!parsed.success) return { type: "error", message: firstAgentWorkItemValidationMessage(parsed.error) };
    const space = await sharedWorkSpace(execution, parsed.data.targetType, parsed.data.targetId);
    if (!space?.actionPermissions.canCreate) return { type: "error", message: "请求人或执行身份无权在该 Work 空间新建内容" };
    const validation = await validateCreateProposalInput(execution, parsed.data);
    if (!validation.ok) return { type: "error", message: validation.error };
    const diff = createDiff(space, parsed.data);
    const proposal = await createProposal(execution, {
      actionKey: CREATE_WORK_ITEM_ACTION,
      toolKey: CREATE_WORK_ITEM_ACTION,
      targetType: "WorkItem",
      targetId: `${parsed.data.targetType}:${parsed.data.targetId}:new`,
      payload: { input: parsed.data },
      diff,
    });
    return proposalResult(proposal.proposalId, CREATE_WORK_ITEM_ACTION, undefined, diff, "工作节点新建提案已生成；确认后才会写入或进入现有审批流程。");
  },
};

export const updateWorkItemTool: AgentTool = {
  key: UPDATE_WORK_ITEM_ACTION,
  label: "修改 Work 工作节点",
  description: "修改已经通过 work.getSpaceDetail 读取并由用户明确指定的目标、KR 或任务。只提交需要变化的字段并生成待确认提案；确认时会重新校验对象版本、scoped update 权限、领域规则和审批策略。",
  parameters: {
    type: "object",
    properties: {
      workId: { type: "integer", minimum: 1 },
      ...mutableWorkItemProperties,
    },
    required: ["workId"],
    additionalProperties: false,
  },
  examples: [{
    user: "把刚才查到的任务 42 标记完成",
    arguments: { workId: 42, status: "done" },
  }],
  requiredPermissions: [WORK_ENTRY],
  policyActions: ["update"],
  delegatedExecution: true,
  mutates: true,

  async execute(params, execution) {
    const parsed = parseAgentUpdateWorkItemInput(params);
    if (!parsed.success) return { type: "error", message: firstAgentWorkItemValidationMessage(parsed.error) };
    const snapshot = await workItemSnapshot(parsed.data.workId);
    if (!snapshot) return { type: "error", message: "工作节点不存在" };
    const targetType = supportedTargetType(snapshot.targetType);
    const targetId = positiveInteger(snapshot.targetId);
    if (!targetType || !targetId) return { type: "error", message: "该工作节点不属于 Agent 支持的 Work 空间" };
    const space = await sharedWorkSpace(execution, targetType, targetId);
    if (!space?.actionPermissions.canUpdate) return { type: "error", message: "请求人或执行身份无权修改该 Work 空间" };
    const validation = await validateUpdateProposalInput(execution, parsed.data);
    if (!validation.ok) return { type: "error", message: validation.error };
    const diff = updateDiff(space, snapshot.content, parsed.data);
    const proposal = await createProposal(execution, {
      actionKey: UPDATE_WORK_ITEM_ACTION,
      toolKey: UPDATE_WORK_ITEM_ACTION,
      targetType: "WorkItem",
      targetId: String(parsed.data.workId),
      payload: { input: parsed.data, expectedUpdatedAt: snapshot.updatedAt.toISOString() },
      diff,
    });
    return proposalResult(proposal.proposalId, UPDATE_WORK_ITEM_ACTION, String(parsed.data.workId), diff, "工作节点修改提案已生成；确认后才会写入或进入现有审批流程。");
  },
};

async function executeCreateWorkItemProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
  control: ProposalExecutorControl,
) {
  const parsed = parseStoredAgentCreateWorkItem(payload);
  if (!parsed.success) throw new Error(firstAgentWorkItemValidationMessage(parsed.error));
  const { targetType, targetId } = parsed.data.input;
  await assertSharedScopedAction(execution, targetType, targetId, "create");
  const command = await buildCreateWorkItemRouteCommand({ user: actorUser(execution), body: parsed.data.input });
  if (!command.ok) throw new Error(command.issue.message);
  control.markExternalDispatchStarted();
  const result = await executeCreateWorkItemRouteCommand(command.data);
  if (!result.ok) throw new Error(result.error);
  return { success: true, ...result.data };
}

async function executeUpdateWorkItemProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
  control: ProposalExecutorControl,
) {
  const parsed = parseStoredAgentUpdateWorkItem(payload);
  if (!parsed.success) throw new Error(firstAgentWorkItemValidationMessage(parsed.error));
  const snapshot = await workItemSnapshot(parsed.data.input.workId);
  if (!snapshot) throw new Error("工作节点不存在");
  if (snapshot.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
    throw new Error("工作节点已经被修改，请重新读取后生成提案");
  }
  const targetType = supportedTargetType(snapshot.targetType);
  const targetId = positiveInteger(snapshot.targetId);
  if (!targetType || !targetId) throw new Error("该工作节点不属于 Agent 支持的 Work 空间");
  await assertSharedScopedAction(execution, targetType, targetId, "update");
  const command = await buildUpdateWorkItemRouteCommand({
    userId: execution.actor.id,
    workId: parsed.data.input.workId,
    body: withoutWorkId(parsed.data.input),
  });
  if (!command.ok) throw new Error(command.issue.message);
  control.markExternalDispatchStarted();
  const result = await executeUpdateWorkItemRouteCommand(command.data);
  if (!result.ok) throw new Error(result.error);
  return { success: true, ...result.data };
}

export const workItemAgentProposalExecutors: ProposalExecutors = {
  [CREATE_WORK_ITEM_ACTION]: {
    toolKey: CREATE_WORK_ITEM_ACTION,
    requiredPermissions: [WORK_ENTRY],
    policyActions: ["create"],
    delegatedExecution: true,
    failureMayHaveSideEffects: true,
    uncertainFailureBoundary: "external_dispatch",
    execute: executeCreateWorkItemProposal,
  },
  [UPDATE_WORK_ITEM_ACTION]: {
    toolKey: UPDATE_WORK_ITEM_ACTION,
    requiredPermissions: [WORK_ENTRY],
    policyActions: ["update"],
    delegatedExecution: true,
    failureMayHaveSideEffects: true,
    uncertainFailureBoundary: "external_dispatch",
    execute: executeUpdateWorkItemProposal,
  },
};

export const workItemAgentTools: AgentTool[] = [
  getWorkSpaceDetailTool,
  createWorkItemTool,
  updateWorkItemTool,
];

async function validateCreateProposalInput(execution: AgentExecutionContext, input: AgentCreateWorkItemInput) {
  const command = await buildCreateWorkItemRouteCommand({ user: actorUser(execution), body: input });
  if (!command.ok) return { ok: false as const, error: command.issue.message };
  const { actorUserId: _actorUserId, targetType, targetId, ...data } = command.data;
  const payload = { entityType: "item", targetType, targetId, workId: null, data } as unknown as WorkTaskItemApprovalPayload;
  return validateCreateItemApprovalPayload(execution.actor.id, payload);
}

async function validateUpdateProposalInput(execution: AgentExecutionContext, input: AgentUpdateWorkItemInput) {
  const command = await buildUpdateWorkItemRouteCommand({
    userId: execution.actor.id,
    workId: input.workId,
    body: withoutWorkId(input),
  });
  if (!command.ok) return { ok: false as const, error: command.issue.message };
  const payload = {
    entityType: "item",
    targetType: command.data.targetType,
    targetId: command.data.targetId,
    workId: input.workId,
    data: command.data.data,
  } as unknown as WorkTaskItemApprovalPayload;
  return validateUpdateItemApprovalPayload(execution.actor.id, String(input.workId), payload);
}

async function sharedWorkSpace(execution: AgentExecutionContext, targetType: WorkSpaceTargetType, targetId: number) {
  const [actorResult, requesterResult] = await Promise.all([
    listWorkTaskSpaces(execution.actor.id),
    execution.actor.id === execution.requester.id
      ? Promise.resolve(null)
      : listWorkTaskSpaces(execution.requester.id),
  ]);
  const spaces = requesterResult
    ? intersectWorkSpaces(actorResult.spaces, requesterResult.spaces)
    : actorResult.spaces;
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) ?? null;
}

async function assertSharedScopedAction(
  execution: AgentExecutionContext,
  targetType: WorkSpaceTargetType,
  targetId: number,
  action: "create" | "update",
) {
  const checker = action === "create" ? canCreateWorkTaskAction : canUpdateWorkTaskAction;
  const userIds = [...new Set([execution.requester.id, execution.actor.id])];
  const allowed = await Promise.all(userIds.map((userId) => checker(userId, targetType, targetId)));
  if (!allowed.every(Boolean)) throw new Error(`请求人或执行身份的 Work ${action} 权限已失效`);
}

async function workItemSnapshot(workId: number) {
  return prisma.workItem.findUnique({
    where: { id: workId },
    select: { targetType: true, targetId: true, content: true, updatedAt: true },
  });
}

function parseTarget(params: Record<string, unknown>) {
  const targetType = supportedTargetType(params.targetType);
  const targetId = positiveInteger(params.targetId);
  return targetType && targetId ? { targetType, targetId } : null;
}

function supportedTargetType(value: unknown): Extract<WorkSpaceTargetType, "personal" | "department" | "project"> | null {
  return value === "personal" || value === "department" || value === "project" ? value : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function actorUser(execution: AgentExecutionContext) {
  return { userId: execution.actor.id, departmentId: execution.actor.departmentId ?? null };
}

function withoutWorkId(input: AgentUpdateWorkItemInput) {
  const { workId: _workId, ...changes } = input;
  return changes;
}

function allowedActionNames(space: WorkTaskSpace) {
  return Object.entries(space.actionPermissions)
    .filter(([, allowed]) => allowed)
    .map(([action]) => action);
}

function serializeDates<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ]));
}

function createDiff(space: WorkTaskSpace, input: AgentCreateWorkItemInput) {
  const { targetType: _targetType, targetId: _targetId, ...changes } = input;
  return { 动作: "新建工作节点", 空间: space.name, ...localizedChanges(changes) };
}

function updateDiff(space: WorkTaskSpace, currentContent: string, input: AgentUpdateWorkItemInput) {
  const { workId, ...changes } = input;
  return {
    动作: "修改工作节点",
    空间: space.name,
    工作节点ID: workId,
    当前内容: currentContent,
    ...localizedChanges(changes),
  };
}

function localizedChanges(changes: Record<string, unknown>) {
  const labels: Record<string, string> = {
    planId: "工作计划ID",
    category: "工作类别",
    itemType: "节点类型",
    content: "内容",
    description: "说明",
    importance: "重要度",
    urgency: "紧急度",
    status: "状态",
    krStartValue: "KR起始值",
    krTargetValue: "KR目标值",
    krCurrentValue: "KR当前值",
    krUnit: "KR单位",
    routineTaskType: "日常任务类型",
    ownerEmployeeId: "负责人EmployeeID",
    collaborationId: "部门协作ID",
    actualStartDate: "实际开始",
    actualEndDate: "实际结束",
    plannedStartDate: "计划开始",
    plannedEndDate: "计划结束",
    isMilestone: "是否里程碑",
    milestoneDate: "里程碑日期",
    sourceDepartmentId: "来源部门ID",
    linkedProjectId: "关联项目ID",
    linkedProjectPhaseId: "关联项目阶段ID",
    parentWorkItemId: "父节点ID",
    responsibilityNodeId: "岗位职责节点ID",
    responsibilityPositionId: "岗位ID",
    participants: "参与人",
    sortOrder: "排序",
  };
  return Object.fromEntries(Object.entries(changes).map(([key, value]) => [labels[key] ?? key, value]));
}

function proposalResult(
  id: number,
  actionKey: string,
  targetId: string | undefined,
  diff: Record<string, unknown>,
  message: string,
) {
  return {
    type: "proposal" as const,
    message,
    proposal: { id, actionKey, targetType: "WorkItem", targetId, diff },
  };
}
