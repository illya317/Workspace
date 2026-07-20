import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { AgentTool } from "@workspace/platform/server/agent";

import {
  AGENT_WORK_REFERENCE_KEYS,
  firstAgentWorkItemValidationMessage,
  intersectAgentWorkReferenceOptions,
  parseAgentWorkReferenceOptionsInput,
  parseAgentWorkSpaceDetailInput,
  type AgentWorkReferenceOption,
  type AgentWorkReferenceOptionsInput,
} from "./domain/agent-work-item-proposal-validation";
import type { WorkTaskSpace } from "./task-spaces";
import { executeWorkReferenceOptionsRouteCommand } from "./work-task-route-command";
import { sharedAgentWorkSpace } from "./work-item-agent-space-access";
import {
  summarizeWorkResponsibilityReference,
  workResponsibilityReferenceSummarySelect,
} from "./work-responsibility-references";

const WORK_ENTRY = { resourceKey: "work.tasks", action: "entry" } as const;
const targetTypeSchema = { type: "string", enum: ["personal", "department", "project"] };

export const getWorkSpaceDetailTool: AgentTool = {
  key: "work.getSpaceDetail",
  label: "读取 Work 空间明细",
  description: "按空间、关键词或工作节点 ID 读取可维护表单的当前值。返回真实 ID 和更新时间；修改前必须先定位目标，不得猜测 ID。",
  parameters: {
    type: "object",
    properties: {
      targetType: targetTypeSchema,
      targetId: { type: "integer", minimum: 1 },
      planId: { type: "integer", minimum: 1, description: "可选；只读取指定计划" },
      workId: { type: "integer", minimum: 1, description: "可选；精确读取一个工作节点" },
      keyword: { type: "string", maxLength: 200, description: "可选；按计划标题、节点内容或描述搜索" },
    },
    required: ["targetType", "targetId"],
    additionalProperties: false,
  },
  requiredPermissions: [WORK_ENTRY],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = parseAgentWorkSpaceDetailInput(params);
    if (!parsed.success) return { type: "error", message: firstAgentWorkItemValidationMessage(parsed.error) };
    const { targetType, targetId, planId, workId } = parsed.data;
    const keyword = parsed.data.keyword ?? "";
    const space = await sharedAgentWorkSpace(execution, targetType, targetId);
    if (!space) return { type: "error", message: "无权限读取该 Work 空间" };

    const items = await prisma.workItem.findMany({
      where: {
        targetType,
        targetId,
        isArchived: false,
        ...(planId ? { planId } : {}),
        ...(workId
          ? { id: workId }
          : keyword
            ? { OR: [{ content: { contains: keyword } }, { description: { contains: keyword } }] }
            : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: workId ? 1 : 100,
      select: agentWorkItemDetailSelect,
    });
    const exactPlanIds = workId
      ? Array.from(new Set(items.map((item) => item.planId).filter((id): id is number => Boolean(id))))
      : [];
    const plans = exactPlanIds.length === 0 && workId
      ? []
      : await prisma.workPlan.findMany({
        where: {
          targetType,
          targetId,
          isArchived: false,
          ...(planId ? { id: planId } : exactPlanIds.length > 0 ? { id: { in: exactPlanIds } } : {}),
          ...(!planId && exactPlanIds.length === 0 && keyword
            ? { OR: [{ title: { contains: keyword } }, { description: { contains: keyword } }] }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 50,
        select: agentWorkPlanDetailSelect,
      });
    const data = {
      space: {
        targetType: space.targetType,
        targetId: space.targetId,
        name: space.name,
        allowedActions: allowedActionNames(space),
      },
      filters: { planId: planId ?? null, workId: workId ?? null, keyword: keyword || null },
      plans: plans.map(agentWorkPlanDetail),
      items: items.map(agentWorkItemDetail),
      truncated: { plans: !workId && plans.length === 50, items: !workId && items.length === 100 },
    };
    return {
      type: plans.length || items.length ? "data" : "empty",
      message: `已读取「${space.name}」的 ${plans.length} 个计划和 ${items.length} 个工作节点。`,
      data,
      modelContext: data,
    };
  },
};

export const searchWorkReferenceOptionsTool: AgentTool = {
  key: "work.searchReferenceOptions",
  label: "搜索 Work 表单候选项",
  description: "按人工 Work 表单的同一 FK 注册规则搜索负责人、协作、岗位职责及跨期关系候选。只返回请求人和 Agent 执行身份都可见的交集；写入引用 ID 前必须先调用本工具。",
  parameters: {
    type: "object",
    properties: {
      fkKey: { type: "string", enum: [...AGENT_WORK_REFERENCE_KEYS] },
      keyword: { type: "string", maxLength: 200 },
      targetType: targetTypeSchema,
      targetId: { type: "integer", minimum: 1 },
      planId: { type: "integer", minimum: 1 },
      currentWorkItemId: { type: "integer", minimum: 1 },
      itemType: { type: "string", enum: ["objective", "key_result", "task"] },
      ownerEmployeeId: { type: "integer", minimum: 1 },
      collaborationId: { type: "integer", minimum: 1 },
      positionId: { type: "integer", minimum: 1 },
    },
    required: ["fkKey", "targetType", "targetId"],
    additionalProperties: false,
  },
  requiredPermissions: [WORK_ENTRY],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = parseAgentWorkReferenceOptionsInput(params);
    if (!parsed.success) return { type: "error", message: firstAgentWorkItemValidationMessage(parsed.error) };
    const space = await sharedAgentWorkSpace(execution, parsed.data.targetType, parsed.data.targetId);
    if (!space) return { type: "error", message: "请求人或执行身份无权查询该 Work 空间候选项" };
    const contextAllowed = await validateWorkReferenceSearchContext(execution, parsed.data);
    if (!contextAllowed) {
      return { type: "error", message: "候选查询上下文无效或无权访问" };
    }
    const shared = await sharedReferenceCandidates(
      execution,
      parsed.data.fkKey,
      parsed.data.keyword ?? "",
      workReferenceSearchParams(parsed.data),
    );
    if (!shared.ok) {
      return { type: "error", message: "请求人或执行身份无权查询该候选项" };
    }
    const items = shared.items;
    const data = { fkKey: parsed.data.fkKey, keyword: parsed.data.keyword ?? "", items };
    return {
      type: items.length ? "data" : "empty",
      message: items.length ? `找到 ${items.length} 个双方均可使用的候选项。` : "没有双方均可使用的候选项。",
      data,
      modelContext: data,
    };
  },
};

/** Prevents guessed context IDs from widening registry searches beyond the manual form path. */
export async function validateWorkReferenceSearchContext(
  execution: Parameters<typeof sharedAgentWorkSpace>[0],
  input: AgentWorkReferenceOptionsInput,
) {
  const targetParams = { targetType: input.targetType, targetId: String(input.targetId) };
  if (input.collaborationId !== undefined) {
    const label = await collaborationKeyword(input.collaborationId);
    if (!label || !await isSharedExactCandidate(
      execution,
      "work.tasks.collaboration",
      input.collaborationId,
      label,
      targetParams,
    )) return false;
  }

  const validatesOwner = input.fkKey === "work.tasks.owner.position"
    || input.fkKey === "work.tasks.item.responsibility";
  if (validatesOwner && input.ownerEmployeeId !== undefined) {
    const label = await employeeKeyword(input.ownerEmployeeId);
    if (!label || !await isSharedExactCandidate(
      execution,
      "work.tasks.owner.employee",
      input.ownerEmployeeId,
      label,
      {
        ...targetParams,
        ...(input.collaborationId === undefined ? {} : { collaborationId: String(input.collaborationId) }),
      },
    )) return false;
  }

  if (input.fkKey === "work.tasks.item.responsibility") {
    const label = await positionKeyword(input.positionId);
    if (!input.positionId || !label || !await isSharedExactCandidate(
      execution,
      "work.tasks.owner.position",
      input.positionId,
      label,
      {
        ...targetParams,
        ...(input.ownerEmployeeId === undefined ? {} : { ownerEmployeeId: String(input.ownerEmployeeId) }),
        ...(input.collaborationId === undefined ? {} : { collaborationId: String(input.collaborationId) }),
      },
    )) return false;
  }

  if (input.fkKey === "work.tasks.parent.item"
    || input.fkKey === "work.tasks.previous.item"
    || input.fkKey === "work.tasks.assigned.alignment.item") {
    if (!input.currentWorkItemId) return false;
    const current = await prisma.workItem.findFirst({
      where: {
        id: input.currentWorkItemId,
        targetType: input.targetType,
        targetId: input.targetId,
        isArchived: false,
      },
      select: { planId: true, itemType: true },
    });
    if (!current) return false;
    if (input.fkKey !== "work.tasks.assigned.alignment.item"
      && (current.planId !== input.planId || current.itemType !== input.itemType)) return false;
  }
  return true;
}

async function isSharedExactCandidate(
  execution: Parameters<typeof sharedAgentWorkSpace>[0],
  fkKey: string,
  id: number,
  keyword: string,
  params: Record<string, string>,
) {
  const shared = await sharedReferenceCandidates(execution, fkKey, keyword, params);
  return shared.ok && shared.items.some((item) => item.id === id);
}

async function sharedReferenceCandidates(
  execution: Parameters<typeof sharedAgentWorkSpace>[0],
  fkKey: string,
  keyword: string,
  params: Record<string, string>,
) {
  const userIds = [...new Set([execution.actor.id, execution.requester.id])];
  const results = await Promise.all(userIds.map((userId) => executeWorkReferenceOptionsRouteCommand({
    fkKey,
    keyword,
    lifecycleScope: "active",
    userId,
    params,
  })));
  if (results.some((result) => "error" in result)) return { ok: false as const, items: [] };
  const actorOptions = normalizeReferenceOptions(results[0] && "items" in results[0] ? results[0].items : []);
  const requesterOptions = results.length === 1
    ? actorOptions
    : normalizeReferenceOptions(results[1] && "items" in results[1] ? results[1].items : []);
  return {
    ok: true as const,
    items: results.length === 1
      ? actorOptions
      : intersectAgentWorkReferenceOptions(actorOptions, requesterOptions),
  };
}

async function employeeKeyword(id: number) {
  const row = await prisma.employee.findUnique({ where: { id }, select: { name: true, employeeId: true } });
  return row ? row.employeeId?.trim() || row.name : null;
}

async function collaborationKeyword(id: number) {
  return (await prisma.departmentCollaboration.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
}

async function positionKeyword(id: number | undefined) {
  if (!id) return null;
  return (await prisma.position.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

function allowedActionNames(space: WorkTaskSpace) {
  return Object.entries(space.actionPermissions)
    .filter(([, allowed]) => allowed)
    .map(([action]) => action);
}

function workReferenceSearchParams(input: AgentWorkReferenceOptionsInput) {
  const params: Record<string, string> = {
    targetType: input.targetType,
    targetId: String(input.targetId),
  };
  for (const key of ["planId", "currentWorkItemId", "itemType", "ownerEmployeeId", "collaborationId", "positionId"] as const) {
    if (input[key] !== undefined) params[key] = String(input[key]);
  }
  return params;
}

function normalizeReferenceOptions(options: unknown): AgentWorkReferenceOption[] {
  if (!Array.isArray(options)) return [];
  return options.filter((option): option is AgentWorkReferenceOption => (
    Boolean(option)
    && typeof option === "object"
    && Number.isInteger(Number((option as { id?: unknown }).id))
    && Number((option as { id?: unknown }).id) > 0
  ));
}

const agentWorkItemDetailSelect = {
  id: true,
  planId: true,
  itemType: true,
  category: true,
  content: true,
  description: true,
  importance: true,
  urgency: true,
  status: true,
  krStartValue: true,
  krTargetValue: true,
  krCurrentValue: true,
  krUnit: true,
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
  actualStartDate: true,
  actualEndDate: true,
  plannedStartDate: true,
  plannedEndDate: true,
  isMilestone: true,
  milestoneDate: true,
  parentWorkItemId: true,
  parentPeriodWorkItemId: true,
  previousPeriodWorkItemId: true,
  updatedAt: true,
  plan: { select: { id: true, title: true } },
  owner: { select: { id: true, employeeId: true, name: true } },
  collaboration: { select: { id: true, title: true } },
  parentWorkItem: { select: { id: true, content: true } },
  parentPeriodWorkItem: { select: { id: true, content: true, itemType: true, targetType: true, targetId: true } },
  previousPeriodWorkItem: { select: { id: true, content: true, itemType: true } },
  responsibilityReferences: {
    where: { referenceRole: "execution" },
    orderBy: [{ id: "asc" as const }],
    select: workResponsibilityReferenceSummarySelect,
  },
  krEvidenceTasks: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: { taskWorkItemId: true, taskWorkItem: { select: { content: true } } },
  },
} satisfies Prisma.WorkItemSelect;

const agentWorkPlanDetailSelect = {
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
} satisfies Prisma.WorkPlanSelect;

function agentWorkItemDetail(row: Prisma.WorkItemGetPayload<{ select: typeof agentWorkItemDetailSelect }>) {
  const responsibility = summarizeWorkResponsibilityReference(row.responsibilityReferences);
  return {
    id: row.id,
    planId: row.planId,
    planTitle: row.plan?.title ?? null,
    itemType: row.itemType,
    category: row.category,
    content: row.content,
    description: row.description,
    importance: row.importance,
    urgency: row.urgency,
    status: row.status ?? "active",
    krStartValue: row.krStartValue,
    krTargetValue: row.krTargetValue,
    krCurrentValue: row.krCurrentValue,
    krUnit: row.krUnit,
    routineTaskType: row.routineTaskType,
    routineRecurrenceType: row.routineRecurrenceType,
    routineRecurrenceTime: row.routineRecurrenceTime,
    routineRecurrenceWeekday: row.routineRecurrenceWeekday,
    routineRecurrenceMonthDay: row.routineRecurrenceMonthDay,
    routineRecurrenceQuarterDay: row.routineRecurrenceQuarterDay,
    routineRecurrenceYearMonth: row.routineRecurrenceYearMonth,
    routineRecurrenceYearDay: row.routineRecurrenceYearDay,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    collaborationId: row.collaborationId,
    collaborationTitle: row.collaboration?.title ?? null,
    actualStartDate: dateOnlyValue(row.actualStartDate),
    actualEndDate: dateOnlyValue(row.actualEndDate),
    plannedStartDate: dateOnlyValue(row.plannedStartDate),
    plannedEndDate: dateOnlyValue(row.plannedEndDate),
    isMilestone: row.isMilestone,
    milestoneDate: dateOnlyValue(row.milestoneDate),
    parentWorkItemId: row.parentWorkItemId,
    parentWorkItemContent: row.parentWorkItem?.content ?? null,
    parentPeriodWorkItemId: row.parentPeriodWorkItemId,
    parentPeriodWorkItemContent: row.parentPeriodWorkItem?.content ?? null,
    parentPeriodWorkItemType: row.parentPeriodWorkItem?.itemType ?? null,
    parentPeriodWorkItemTargetType: row.parentPeriodWorkItem?.targetType ?? null,
    parentPeriodWorkItemTargetId: row.parentPeriodWorkItem?.targetId ?? null,
    previousPeriodWorkItemId: row.previousPeriodWorkItemId,
    previousPeriodWorkItemContent: row.previousPeriodWorkItem?.content ?? null,
    ...responsibility,
    evidenceTaskIds: row.krEvidenceTasks.map((evidence) => evidence.taskWorkItemId),
    evidenceTasks: row.krEvidenceTasks.map((evidence) => ({ id: evidence.taskWorkItemId, content: evidence.taskWorkItem.content })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function agentWorkPlanDetail(row: Prisma.WorkPlanGetPayload<{ select: typeof agentWorkPlanDetailSelect }>) {
  return {
    ...row,
    plannedStartDate: dateOnlyValue(row.plannedStartDate),
    plannedEndDate: dateOnlyValue(row.plannedEndDate),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateOnlyValue(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}
