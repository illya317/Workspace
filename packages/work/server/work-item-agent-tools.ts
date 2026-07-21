import { prisma } from "@workspace/platform/server/prisma";
import {
  createProposal,
  type AgentExecutionContext,
  type AgentTool,
  type ProposalExecutorControl,
  type ProposalExecutors,
} from "@workspace/platform/server/agent";

import { canUpdateWorkTaskAction, type WorkSpaceTargetType } from "./access";
import {
  buildAgentWorkItemUpdateDiff,
  type AgentWorkItemDiffReferenceLabels,
} from "./domain/agent-work-item-proposal-diff";
import {
  agentWorkItemAvailabilityError,
  expandAgentWorkItemFormPatch,
  firstAgentWorkItemValidationMessage,
  parseAgentUpdateWorkItemInput,
  parseStoredAgentUpdateWorkItem,
  validateAgentWorkItemFormFields,
  type AgentUpdateWorkItemInput,
} from "./domain/agent-work-item-proposal-validation";
import { validateWorkItemCompletion } from "./domain/work-completion-policy";
import { validateUpdateItemApprovalPayload } from "./task-approval-adapter";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import { getWorkSpaceDetailTool, searchWorkReferenceOptionsTool } from "./work-item-agent-read-tools";
import { validateAgentWorkItemReferenceChanges } from "./work-item-agent-reference-validation";
import { sharedAgentWorkSpace } from "./work-item-agent-space-access";
import { assertSharedAgentWorkItemStageAllowed } from "./work-item-agent-stage-access";
import { executeUpdateWorkItemRouteCommand } from "./work-item-mutation-executor";
import { validateKrEvidenceTasks } from "./work-kr-evidence";
import {
  summarizeWorkResponsibilityReference,
  workResponsibilityReferenceSummarySelect,
} from "./work-responsibility-references";
import { validateWorkItemResponsibility } from "./work-item-service-helpers";
import { buildUpdateWorkItemRouteCommand } from "./work-task-route-command";
import {
  createWorkItemTool,
  workItemNewNodeProposalExecutors,
} from "./work-item-agent-create-tool";

const WORK_ENTRY = { resourceKey: "work.tasks", action: "entry" } as const;
const UPDATE_WORK_ITEM_ACTION = "work.updateWorkItem";
const SEARCH_REFERENCE_OPTIONS_ACTION = "work.searchReferenceOptions";
const nullablePositiveInteger = { type: ["integer", "null"], minimum: 1 };
const nullableDateOnly = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "严格 YYYY-MM-DD；传 null 表示清空",
};

const mutableWorkItemFormProperties = {
  content: { type: "string", minLength: 1 },
  description: { type: "string" },
  importance: { type: "integer", minimum: 1, maximum: 5 },
  urgency: { type: "integer", minimum: 1, maximum: 5 },
  status: { type: "string", enum: ["active", "paused", "done"] },
  krStartValue: { type: ["number", "null"] },
  krTargetValue: { type: ["number", "null"] },
  krCurrentValue: { type: ["number", "null"] },
  krUnit: { type: ["string", "null"] },
  routineRecurrenceType: { type: ["string", "null"], enum: ["daily", "weekly", "monthly", "quarterly", "yearly", null] },
  routineRecurrenceTime: { type: ["string", "null"], pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  routineRecurrenceWeekday: { type: ["integer", "null"], minimum: 1, maximum: 7 },
  routineRecurrenceMonthDay: { type: ["integer", "null"], minimum: 1, maximum: 31 },
  routineRecurrenceQuarterDay: { type: ["integer", "null"], minimum: 1, maximum: 92 },
  routineRecurrenceYearMonth: { type: ["integer", "null"], minimum: 1, maximum: 12 },
  routineRecurrenceYearDay: { type: ["integer", "null"], minimum: 1, maximum: 31 },
  ownerEmployeeId: { ...nullablePositiveInteger, description: `只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的 Employee ID` },
  collaborationId: { ...nullablePositiveInteger, description: `只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的协作 ID` },
  actualStartDate: nullableDateOnly,
  actualEndDate: nullableDateOnly,
  plannedStartDate: nullableDateOnly,
  plannedEndDate: nullableDateOnly,
  isMilestone: { type: "boolean" },
  milestoneDate: nullableDateOnly,
  parentWorkItemId: nullablePositiveInteger,
  parentPeriodWorkItemId: nullablePositiveInteger,
  previousPeriodWorkItemId: nullablePositiveInteger,
  responsibilityNodeId: { ...nullablePositiveInteger, description: `只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的职责 ID` },
  responsibilityPositionId: { ...nullablePositiveInteger, description: `只能使用 ${SEARCH_REFERENCE_OPTIONS_ACTION} 返回的岗位 ID` },
  evidenceTaskIds: { type: "array", items: { type: "integer", minimum: 1 }, uniqueItems: true },
} satisfies Record<string, unknown>;

export const updateWorkItemTool: AgentTool = {
  key: UPDATE_WORK_ITEM_ACTION,
  label: "修改 Work 工作节点",
  description: "根据用户反馈填写已读取工作节点的人工表单可编辑字段。只生成待确认提案；用户确认后才通过网页端同一权限、领域校验和审批策略写入。计划、类别、节点类型、来源、参与人和排序等锁定或隐藏字段不可修改。",
  parameters: {
    type: "object",
    properties: {
      workId: { type: "integer", minimum: 1 },
      ...mutableWorkItemFormProperties,
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
    const availabilityError = agentWorkItemAvailabilityError(snapshot);
    if (availabilityError || !snapshot) return { type: "error", message: availabilityError ?? "工作节点不存在或不可维护" };
    const targetType = supportedTargetType(snapshot.targetType);
    const targetId = positiveInteger(snapshot.targetId);
    if (!targetType || !targetId) return { type: "error", message: "工作节点不存在或不可维护" };
    const space = await sharedAgentWorkSpace(execution, targetType, targetId);
    if (!space?.actionPermissions.canUpdate) return { type: "error", message: "工作节点不存在或不可维护" };
    const formFieldError = validateAgentWorkItemFormFields(parsed.data, snapshot);
    if (formFieldError) return { type: "error", message: formFieldError };
    const expandedInput = expandAgentWorkItemFormPatch(parsed.data, snapshot);
    const expectedUpdatedAt = snapshot.updatedAt.toISOString();
    const validation = await validateUpdateProposalInput(execution, expandedInput, snapshot, expectedUpdatedAt);
    if (!validation.ok) return { type: "error", message: validation.error };
    const diff = buildAgentWorkItemUpdateDiff({
      spaceName: space.name,
      workId: parsed.data.workId,
      changes: expandedInput,
      currentValues: currentFormValues(snapshot),
      currentReferenceLabels: currentReferenceLabels(snapshot),
      nextReferenceLabels: validation.referenceLabels,
      standingResponsibility: snapshot.category === "routine"
        && snapshot.itemType === "task"
        && snapshot.routineTaskType === "standing",
    });
    const proposal = await createProposal(execution, {
      actionKey: UPDATE_WORK_ITEM_ACTION,
      toolKey: UPDATE_WORK_ITEM_ACTION,
      targetType: "WorkItem",
      targetId: String(parsed.data.workId),
      payload: { input: parsed.data, expectedUpdatedAt },
      diff,
    });
    return proposalResult(proposal.proposalId, String(parsed.data.workId), diff);
  },
};

async function executeUpdateWorkItemProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
  control: ProposalExecutorControl,
) {
  const parsed = parseStoredAgentUpdateWorkItem(payload);
  if (!parsed.success) throw new Error(firstAgentWorkItemValidationMessage(parsed.error));
  const snapshot = await workItemSnapshot(parsed.data.input.workId);
  const availabilityError = agentWorkItemAvailabilityError(snapshot);
  if (availabilityError || !snapshot) throw new Error(availabilityError ?? "工作节点不存在或不可维护");
  const targetType = supportedTargetType(snapshot.targetType);
  const targetId = positiveInteger(snapshot.targetId);
  if (!targetType || !targetId) throw new Error("工作节点不存在或不可维护");
  await assertSharedScopedUpdate(execution, targetType, targetId);
  if (snapshot.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
    throw new Error("工作节点已经被修改，请重新读取后生成提案");
  }
  const formFieldError = validateAgentWorkItemFormFields(parsed.data.input, snapshot);
  if (formFieldError) throw new Error(formFieldError);
  const expandedInput = expandAgentWorkItemFormPatch(parsed.data.input, snapshot);
  const validation = await validateUpdateProposalInput(
    execution,
    expandedInput,
    snapshot,
    parsed.data.expectedUpdatedAt,
  );
  if (!validation.ok) throw new Error(validation.error);
  const command = await buildUpdateWorkItemRouteCommand({
    userId: execution.actor.id,
    workId: expandedInput.workId,
    body: withoutWorkId(expandedInput),
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });
  if (!command.ok) throw new Error(command.issue.message);
  control.markExternalDispatchStarted();
  const result = await executeUpdateWorkItemRouteCommand(command.data);
  if (!result.ok) throw new Error(result.error);
  return { success: true, ...result.data };
}

export const workItemAgentProposalExecutors: ProposalExecutors = {
  ...workItemNewNodeProposalExecutors,
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
  searchWorkReferenceOptionsTool,
  createWorkItemTool,
  updateWorkItemTool,
];

async function validateUpdateProposalInput(
  execution: AgentExecutionContext,
  input: AgentUpdateWorkItemInput,
  snapshot: NonNullable<Awaited<ReturnType<typeof workItemSnapshot>>>,
  expectedUpdatedAt: string,
) {
  const references = await validateAgentWorkItemReferenceChanges({ execution, changes: input, snapshot });
  if (!references.ok) return references;
  const command = await buildUpdateWorkItemRouteCommand({
    userId: execution.actor.id,
    workId: input.workId,
    body: withoutWorkId(input),
    expectedUpdatedAt,
  });
  if (!command.ok) return { ok: false as const, error: command.issue.message };
  const payload = {
    entityType: "item",
    targetType: command.data.targetType,
    targetId: command.data.targetId,
    workId: input.workId,
    expectedUpdatedAt: command.data.expectedUpdatedAt,
    data: command.data.data,
  } as unknown as WorkTaskItemApprovalPayload;
  const approval = await validateUpdateItemApprovalPayload(execution.actor.id, String(input.workId), payload);
  if (!approval.ok) return approval;

  const stage = await assertSharedAgentWorkItemStageAllowed({
    execution,
    planId: snapshot.planId,
    itemType: snapshot.itemType,
    changesKrCurrentValue: snapshot.itemType === "key_result"
      && input.krCurrentValue !== undefined
      && input.krCurrentValue !== snapshot.krCurrentValue,
  });
  if (!stage.ok) return stage;

  const effectiveParentWorkItemId = input.parentWorkItemId === undefined
    ? snapshot.parentWorkItemId
    : input.parentWorkItemId;
  const evidenceError = await validateKrEvidenceTasks(prisma, {
    planId: snapshot.planId,
    objectiveId: effectiveParentWorkItemId,
    evidenceTaskIds: input.evidenceTaskIds,
  });
  if (evidenceError) return { ok: false as const, error: evidenceError, status: 400 };

  const responsibilityError = await preflightResponsibility(input, snapshot);
  if (responsibilityError) return { ok: false as const, error: responsibilityError, status: 400 };
  if (input.status === "done" && snapshot.status !== "done") {
    const completionError = await validateWorkItemCompletion(prisma, input.workId, input.evidenceTaskIds);
    if (completionError) return { ok: false as const, error: completionError, status: 409 };
  }
  return { ok: true as const, referenceLabels: references.labels };
}

async function preflightResponsibility(
  input: AgentUpdateWorkItemInput,
  snapshot: NonNullable<Awaited<ReturnType<typeof workItemSnapshot>>>,
) {
  const nodeTouched = hasOwn(input, "responsibilityNodeId");
  const positionTouched = hasOwn(input, "responsibilityPositionId");
  const standingOwnerChanged = snapshot.category === "routine"
    && snapshot.itemType === "task"
    && snapshot.routineTaskType === "standing"
    && input.ownerEmployeeId !== undefined
    && input.ownerEmployeeId !== snapshot.ownerEmployeeId;
  if (positionTouched && !nodeTouched) return "修改关联岗位时必须同时提交职责候选";
  if (standingOwnerChanged && !nodeTouched) return "修改常设职责负责人时必须重新选择关联岗位职责";
  if (!nodeTouched) return null;
  if (input.responsibilityNodeId && !input.responsibilityPositionId) return "选择关联职责时必须使用候选项返回的岗位 ID";
  if (!input.responsibilityNodeId && input.responsibilityPositionId) return "清空关联职责时必须同时清空岗位";
  return validateWorkItemResponsibility({
    planId: snapshot.planId,
    itemType: snapshot.itemType,
    category: snapshot.category,
    routineTaskType: snapshot.routineTaskType,
    ownerEmployeeId: input.ownerEmployeeId === undefined ? snapshot.ownerEmployeeId : input.ownerEmployeeId,
    responsibilityNodeId: input.responsibilityNodeId,
    responsibilityPositionId: input.responsibilityPositionId,
    responsibilityTouched: true,
  });
}

async function assertSharedScopedUpdate(
  execution: AgentExecutionContext,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  const userIds = [...new Set([execution.requester.id, execution.actor.id])];
  const allowed = await Promise.all(userIds.map((userId) => canUpdateWorkTaskAction(userId, targetType, targetId)));
  if (!allowed.every(Boolean)) throw new Error("工作节点不存在或不可维护");
}

async function workItemSnapshot(workId: number) {
  return prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      planId: true,
      category: true,
      itemType: true,
      routineTaskType: true,
      routineRecurrenceType: true,
      routineRecurrenceTime: true,
      routineRecurrenceWeekday: true,
      routineRecurrenceMonthDay: true,
      routineRecurrenceQuarterDay: true,
      routineRecurrenceYearMonth: true,
      routineRecurrenceYearDay: true,
      ownerEmployeeId: true,
      collaborationId: true,
      parentWorkItemId: true,
      parentPeriodWorkItemId: true,
      previousPeriodWorkItemId: true,
      description: true,
      importance: true,
      urgency: true,
      status: true,
      krStartValue: true,
      krTargetValue: true,
      krCurrentValue: true,
      krUnit: true,
      actualStartDate: true,
      actualEndDate: true,
      plannedStartDate: true,
      plannedEndDate: true,
      isMilestone: true,
      milestoneDate: true,
      isArchived: true,
      content: true,
      updatedAt: true,
      owner: { select: { id: true, employeeId: true, name: true } },
      collaboration: { select: { id: true, title: true } },
      parentWorkItem: { select: { id: true, content: true } },
      parentPeriodWorkItem: { select: { id: true, content: true } },
      previousPeriodWorkItem: { select: { id: true, content: true } },
      responsibilityReferences: {
        where: { referenceRole: "execution" },
        orderBy: [{ id: "asc" as const }],
        select: workResponsibilityReferenceSummarySelect,
      },
      krEvidenceTasks: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
        select: { taskWorkItemId: true, taskWorkItem: { select: { content: true } } },
      },
    },
  });
}

function supportedTargetType(value: unknown): Extract<WorkSpaceTargetType, "personal" | "department" | "project"> | null {
  return value === "personal" || value === "department" || value === "project" ? value : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function withoutWorkId(input: AgentUpdateWorkItemInput) {
  const { workId: _workId, ...changes } = input;
  return changes;
}

function currentFormValues(snapshot: NonNullable<Awaited<ReturnType<typeof workItemSnapshot>>>) {
  const responsibility = summarizeWorkResponsibilityReference(snapshot.responsibilityReferences);
  return {
    content: snapshot.content,
    description: snapshot.description,
    importance: snapshot.importance,
    urgency: snapshot.urgency,
    status: snapshot.status ?? "active",
    krStartValue: snapshot.krStartValue,
    krTargetValue: snapshot.krTargetValue,
    krCurrentValue: snapshot.krCurrentValue,
    krUnit: snapshot.krUnit,
    routineRecurrenceType: snapshot.routineRecurrenceType,
    routineRecurrenceTime: snapshot.routineRecurrenceTime,
    routineRecurrenceWeekday: snapshot.routineRecurrenceWeekday,
    routineRecurrenceMonthDay: snapshot.routineRecurrenceMonthDay,
    routineRecurrenceQuarterDay: snapshot.routineRecurrenceQuarterDay,
    routineRecurrenceYearMonth: snapshot.routineRecurrenceYearMonth,
    routineRecurrenceYearDay: snapshot.routineRecurrenceYearDay,
    ownerEmployeeId: snapshot.ownerEmployeeId,
    collaborationId: snapshot.collaborationId,
    actualStartDate: dateOnlyValue(snapshot.actualStartDate),
    actualEndDate: dateOnlyValue(snapshot.actualEndDate),
    plannedStartDate: dateOnlyValue(snapshot.plannedStartDate),
    plannedEndDate: dateOnlyValue(snapshot.plannedEndDate),
    isMilestone: snapshot.isMilestone,
    milestoneDate: dateOnlyValue(snapshot.milestoneDate),
    parentWorkItemId: snapshot.parentWorkItemId,
    parentPeriodWorkItemId: snapshot.parentPeriodWorkItemId,
    previousPeriodWorkItemId: snapshot.previousPeriodWorkItemId,
    responsibilityNodeId: responsibility.responsibilityNodeId,
    responsibilityPositionId: responsibility.responsibilityPositionId,
    evidenceTaskIds: snapshot.krEvidenceTasks.map((evidence) => evidence.taskWorkItemId),
  };
}

function currentReferenceLabels(
  snapshot: NonNullable<Awaited<ReturnType<typeof workItemSnapshot>>>,
): AgentWorkItemDiffReferenceLabels {
  const responsibility = summarizeWorkResponsibilityReference(snapshot.responsibilityReferences);
  return {
    ownerEmployeeId: employeeReferenceLabel(snapshot.owner),
    collaborationId: entityReferenceLabel(snapshot.collaboration?.title, snapshot.collaboration?.id),
    parentWorkItemId: entityReferenceLabel(snapshot.parentWorkItem?.content, snapshot.parentWorkItem?.id),
    parentPeriodWorkItemId: entityReferenceLabel(snapshot.parentPeriodWorkItem?.content, snapshot.parentPeriodWorkItem?.id),
    previousPeriodWorkItemId: entityReferenceLabel(snapshot.previousPeriodWorkItem?.content, snapshot.previousPeriodWorkItem?.id),
    responsibilityNodeId: responsibilityContextLabel(snapshot, responsibility),
    responsibilityPositionId: entityReferenceLabel(
      responsibility.responsibilityPositionName,
      responsibility.responsibilityPositionId,
    ),
    evidenceTaskIds: snapshot.krEvidenceTasks.map((evidence) => (
      `${evidence.taskWorkItem.content} (#${evidence.taskWorkItemId})`
    )),
  };
}

function employeeReferenceLabel(employee: { id: number; employeeId: string | null; name: string } | null) {
  if (!employee) return "未设置";
  return `${[employee.name, employee.employeeId].filter(Boolean).join(" ")} (#${employee.id})`;
}

function entityReferenceLabel(label: string | null | undefined, id: number | null | undefined) {
  return label && id ? `${label} (#${id})` : "未设置";
}

function responsibilityContextLabel(
  snapshot: NonNullable<Awaited<ReturnType<typeof workItemSnapshot>>>,
  responsibility: ReturnType<typeof summarizeWorkResponsibilityReference>,
) {
  if (!responsibility.responsibilityNodeId || !responsibility.responsibilityLabel) return "未设置";
  const owner = employeeReferenceLabel(snapshot.owner);
  const position = entityReferenceLabel(
    responsibility.responsibilityPositionName,
    responsibility.responsibilityPositionId,
  );
  return `${responsibility.responsibilityLabel} (#${responsibility.responsibilityNodeId}) · 负责人 ${owner} · 岗位 ${position}`;
}

function dateOnlyValue(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function proposalResult(id: number, targetId: string, diff: Record<string, unknown>) {
  return {
    type: "proposal" as const,
    message: "工作节点表单提案已生成；用户确认后才会写入或进入现有审批流程。",
    proposal: { id, actionKey: UPDATE_WORK_ITEM_ACTION, targetType: "WorkItem", targetId, diff },
  };
}

function hasOwn(input: object, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, field);
}
