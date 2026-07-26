import { prisma } from "@workspace/platform/server/prisma";
import type { AgentExecutionContext } from "@workspace/platform/server/agent/execution";

import {
  intersectAgentWorkReferenceOptions,
  type AgentUpdateWorkItemInput,
  type AgentWorkReferenceOption,
} from "./domain/agent-work-item-proposal-validation";
import type { AgentCreateWorkItemInput } from "./domain/agent-work-item-create-validation";
import { executeWorkReferenceOptionsRouteCommand } from "./work-task-route-command";

type ReferenceField =
  | "ownerEmployeeId"
  | "collaborationId"
  | "parentWorkItemId"
  | "parentPeriodWorkItemId"
  | "previousPeriodWorkItemId"
  | "responsibilityNodeId"
  | "responsibilityPositionId"
  | "evidenceTaskIds";

export type AgentWorkReferenceLabels = Partial<Record<ReferenceField, string | string[]>>;

type WorkItemReferenceSnapshot = {
  id: number;
  targetType: string;
  targetId: number | null;
  planId: number | null;
  category: string;
  itemType: string;
  routineTaskType: string | null;
  ownerEmployeeId: number | null;
  collaborationId: number | null;
  parentWorkItemId: number | null;
};

type WorkItemReferenceChanges = Pick<
  AgentUpdateWorkItemInput,
  ReferenceField
>;

type ReferenceValidationResult =
  | { ok: true; labels: AgentWorkReferenceLabels }
  | { ok: false; error: string };

type CandidateResult =
  | { ok: true; field: ReferenceField; label: string | string[] }
  | { ok: false; error: string };

/** Revalidates every touched ID against the requester/actor candidate intersection. */
export async function validateAgentWorkItemReferenceChanges(input: {
  execution: AgentExecutionContext;
  changes: AgentUpdateWorkItemInput;
  snapshot: WorkItemReferenceSnapshot;
}): Promise<ReferenceValidationResult> {
  return validateAgentWorkItemReferences(input);
}

/** Applies the same requester/actor candidate intersection to a not-yet-created node. */
export async function validateAgentCreateWorkItemReferences(input: {
  execution: AgentExecutionContext;
  changes: AgentCreateWorkItemInput;
  snapshot: Omit<WorkItemReferenceSnapshot, "id">;
}): Promise<ReferenceValidationResult> {
  return validateAgentWorkItemReferences({
    execution: input.execution,
    changes: input.changes,
    snapshot: { id: 0, ...input.snapshot },
  });
}

async function validateAgentWorkItemReferences(input: {
  execution: AgentExecutionContext;
  changes: WorkItemReferenceChanges;
  snapshot: WorkItemReferenceSnapshot;
}): Promise<ReferenceValidationResult> {
  const { changes, snapshot } = input;
  if (!snapshot.targetId) return { ok: false, error: "工作项缺少有效空间" };
  if (hasOwn(changes, "collaborationId")
    && changes.collaborationId !== snapshot.collaborationId
    && !hasOwn(changes, "ownerEmployeeId")) {
    return { ok: false, error: "修改关联协作时必须重新确认执行责任人" };
  }
  const standingCollaborationChanged = snapshot.category === "routine"
    && snapshot.itemType === "task"
    && snapshot.routineTaskType === "standing"
    && hasOwn(changes, "collaborationId")
    && changes.collaborationId !== snapshot.collaborationId;
  if (standingCollaborationChanged
    && (!hasOwn(changes, "responsibilityNodeId") || !hasOwn(changes, "responsibilityPositionId"))) {
    return { ok: false, error: "修改常设职责的关联协作时必须重新确认岗位和岗位职责" };
  }
  if (snapshot.id > 0
    && snapshot.itemType === "key_result"
    && hasOwn(changes, "parentWorkItemId")
    && changes.parentWorkItemId !== snapshot.parentWorkItemId
    && !hasOwn(changes, "evidenceTaskIds")) {
    return { ok: false, error: "修改 KR 所属目标时必须重新确认任务证据" };
  }

  const effectiveOwnerEmployeeId = changedOrCurrent(changes.ownerEmployeeId, snapshot.ownerEmployeeId);
  const effectiveCollaborationId = changedOrCurrent(changes.collaborationId, snapshot.collaborationId);
  const checks: Promise<CandidateResult>[] = [];
  if (hasOwn(changes, "ownerEmployeeId")) {
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "ownerEmployeeId",
      id: changes.ownerEmployeeId,
      fkKeys: ["work.tasks.owner.employee"],
      params: targetParams(snapshot, { collaborationId: effectiveCollaborationId }),
      label: employeeLabel(changes.ownerEmployeeId),
      invalidMessage: "负责人不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "collaborationId")) {
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "collaborationId",
      id: changes.collaborationId,
      fkKeys: ["work.tasks.collaboration"],
      params: targetParams(snapshot),
      label: collaborationLabel(changes.collaborationId),
      invalidMessage: "部门协作不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "responsibilityPositionId")) {
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "responsibilityPositionId",
      id: changes.responsibilityPositionId,
      fkKeys: ["work.tasks.owner.position"],
      params: targetParams(snapshot, {
        ownerEmployeeId: effectiveOwnerEmployeeId,
        collaborationId: effectiveCollaborationId,
      }),
      label: positionLabel(changes.responsibilityPositionId),
      invalidMessage: "岗位不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "responsibilityNodeId")) {
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "responsibilityNodeId",
      id: changes.responsibilityNodeId,
      fkKeys: ["work.tasks.item.responsibility"],
      params: targetParams(snapshot, {
        ownerEmployeeId: effectiveOwnerEmployeeId,
        positionId: changes.responsibilityPositionId,
      }),
      label: responsibilityLabel(changes.responsibilityNodeId),
      lockedEmployeeId: effectiveOwnerEmployeeId,
      lockedPositionId: changes.responsibilityPositionId,
      invalidMessage: "岗位职责不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "parentPeriodWorkItemId")) {
    const fkKeys = snapshot.itemType === "task"
      ? ["work.tasks.assigned.alignment.item"]
      : ["work.tasks.parent.item", "work.tasks.assigned.alignment.item"];
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "parentPeriodWorkItemId",
      id: changes.parentPeriodWorkItemId,
      fkKeys,
      params: targetParams(snapshot, {
        planId: snapshot.planId,
        currentWorkItemId: snapshot.id,
        itemType: snapshot.itemType,
      }),
      label: workItemLabel(changes.parentPeriodWorkItemId),
      invalidMessage: "跨期或外部对齐节点不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "previousPeriodWorkItemId")) {
    checks.push(validateRegisteredCandidate({
      execution: input.execution,
      field: "previousPeriodWorkItemId",
      id: changes.previousPeriodWorkItemId,
      fkKeys: ["work.tasks.previous.item"],
      params: targetParams(snapshot, {
        planId: snapshot.planId,
        currentWorkItemId: snapshot.id,
        itemType: snapshot.itemType,
      }),
      label: workItemLabel(changes.previousPeriodWorkItemId),
      invalidMessage: "前序节点不在请求人和执行身份共同可用的表单候选中",
    }));
  }
  if (hasOwn(changes, "parentWorkItemId")) {
    checks.push(validateLocalParentCandidate(changes.parentWorkItemId, snapshot));
  }
  if (hasOwn(changes, "evidenceTaskIds")) {
    const objectiveId = changedOrCurrent(changes.parentWorkItemId, snapshot.parentWorkItemId);
    checks.push(validateEvidenceCandidates(changes.evidenceTaskIds ?? [], snapshot, objectiveId));
  }

  const results = await Promise.all(checks);
  const failure = results.find((result): result is Extract<CandidateResult, { ok: false }> => !result.ok);
  if (failure) return failure;
  const successes = results.filter((result): result is Extract<CandidateResult, { ok: true }> => result.ok);
  return {
    ok: true,
    labels: Object.fromEntries(successes.map((result) => [result.field, result.label])) as AgentWorkReferenceLabels,
  };
}

async function validateRegisteredCandidate(input: {
  execution: AgentExecutionContext;
  field: ReferenceField;
  id: number | null | undefined;
  fkKeys: string[];
  params: Record<string, string>;
  label: Promise<string | null>;
  invalidMessage: string;
  lockedEmployeeId?: number | null;
  lockedPositionId?: number | null;
}): Promise<CandidateResult> {
  if (!input.id) return { ok: true, field: input.field, label: "清空" };
  const label = await input.label;
  if (!label) return { ok: false, error: input.invalidMessage };
  for (const fkKey of input.fkKeys) {
    const options = await sharedRegisteredCandidates(input.execution, fkKey, label, input.params);
    const candidate = options.find((option) => (
      option.id === input.id
      && (input.lockedEmployeeId == null || option.lockedEmployeeId === input.lockedEmployeeId)
      && (input.lockedPositionId == null || option.lockedPositionId === input.lockedPositionId)
    ));
    if (candidate) return {
      ok: true,
      field: input.field,
      label: formatCandidate(candidate, input.id, input.field),
    };
  }
  return { ok: false, error: input.invalidMessage };
}

async function sharedRegisteredCandidates(
  execution: AgentExecutionContext,
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
  if (results.some((result) => "error" in result)) return [];
  const actorOptions = normalizeOptions(results[0] && "items" in results[0] ? results[0].items : []);
  if (results.length === 1) return actorOptions;
  const requesterOptions = normalizeOptions(results[1] && "items" in results[1] ? results[1].items : []);
  return intersectAgentWorkReferenceOptions(actorOptions, requesterOptions);
}

async function validateLocalParentCandidate(
  parentId: number | null | undefined,
  snapshot: WorkItemReferenceSnapshot,
): Promise<CandidateResult> {
  if (!parentId) return { ok: true, field: "parentWorkItemId", label: "清空" };
  const parent = await prisma.workItem.findFirst({
    where: {
      id: parentId,
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      planId: snapshot.planId,
      isArchived: false,
    },
    select: { id: true, content: true, itemType: true, routineTaskType: true, parentWorkItemId: true, status: true },
  });
  const ordinaryRoutineTask = snapshot.category === "routine"
    && snapshot.itemType === "task"
    && snapshot.routineTaskType === "task";
  const valid = parent && (ordinaryRoutineTask
    ? parent.itemType === "task"
      && parent.routineTaskType === "standing"
      && !parent.parentWorkItemId
      && parent.status === "active"
    : parent.itemType === "objective");
  return valid
    ? { ok: true, field: "parentWorkItemId", label: `${parent.content} (#${parent.id})` }
    : { ok: false, error: "所属目标或常设职责不在人工表单候选中" };
}

async function validateEvidenceCandidates(
  evidenceTaskIds: number[],
  snapshot: WorkItemReferenceSnapshot,
  objectiveId: number | null | undefined,
): Promise<CandidateResult> {
  if (evidenceTaskIds.length === 0) return { ok: true, field: "evidenceTaskIds", label: [] };
  const tasks = await prisma.workItem.findMany({
    where: {
      id: { in: evidenceTaskIds },
      targetType: snapshot.targetType,
      targetId: snapshot.targetId,
      planId: snapshot.planId,
      itemType: "task",
      parentWorkItemId: objectiveId,
      isArchived: false,
    },
    select: { id: true, content: true },
  });
  if (tasks.length !== evidenceTaskIds.length) {
    return { ok: false, error: "任务证据不在同一目标的人工表单候选中" };
  }
  const labelById = new Map(tasks.map((task) => [task.id, `${task.content} (#${task.id})`]));
  return {
    ok: true,
    field: "evidenceTaskIds",
    label: evidenceTaskIds.map((id) => labelById.get(id) as string),
  };
}

function targetParams(snapshot: WorkItemReferenceSnapshot, extra: Record<string, unknown> = {}) {
  return stringParams({ targetType: snapshot.targetType, targetId: snapshot.targetId, ...extra });
}

function stringParams(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [key, String(value)]));
}

function normalizeOptions(options: unknown): AgentWorkReferenceOption[] {
  if (!Array.isArray(options)) return [];
  return options.filter((option): option is AgentWorkReferenceOption => (
    Boolean(option) && typeof option === "object" && Number.isInteger((option as { id?: unknown }).id)
  ));
}

function formatCandidate(option: AgentWorkReferenceOption, id: number, field: ReferenceField) {
  const name = typeof option.name === "string" && option.name.trim() ? option.name : "候选项";
  const base = `${name} (#${id})`;
  if (field !== "responsibilityNodeId") return base;
  return `${base} · 负责人 ${lockedReferenceLabel(option, "lockedEmployeeName", "lockedEmployeeId")} · 岗位 ${lockedReferenceLabel(option, "lockedPositionName", "lockedPositionId")}`;
}

function lockedReferenceLabel(
  option: AgentWorkReferenceOption,
  nameKey: "lockedEmployeeName" | "lockedPositionName",
  idKey: "lockedEmployeeId" | "lockedPositionId",
) {
  const name = typeof option[nameKey] === "string" && option[nameKey].trim()
    ? option[nameKey]
    : "候选项";
  const id = Number(option[idKey]);
  return Number.isInteger(id) && id > 0 ? `${name} (#${id})` : name;
}

async function employeeLabel(id: number | null | undefined) {
  if (!id) return null;
  const row = await prisma.employee.findUnique({ where: { id }, select: { name: true, employeeId: true } });
  return row ? row.employeeId?.trim() || row.name : null;
}

async function collaborationLabel(id: number | null | undefined) {
  if (!id) return null;
  return (await prisma.departmentCollaboration.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
}

async function positionLabel(id: number | null | undefined) {
  if (!id) return null;
  return (await prisma.position.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

async function responsibilityLabel(id: number | null | undefined) {
  if (!id) return null;
  const row = await prisma.positionResponsibilityNode.findUnique({
    where: { id },
    select: { pathLabel: true, title: true, content: true },
  });
  return row ? [row.pathLabel, row.title || row.content].filter(Boolean).join(" · ") : null;
}

async function workItemLabel(id: number | null | undefined) {
  if (!id) return null;
  return (await prisma.workItem.findUnique({ where: { id }, select: { content: true } }))?.content ?? null;
}

function changedOrCurrent<T>(changed: T | undefined, current: T) {
  return changed === undefined ? current : changed;
}

function hasOwn(input: object, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, field);
}
