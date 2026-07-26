import { z } from "zod";

const positiveId = z.number().int().positive();
const nullablePositiveId = positiveId.nullable().optional();
const requiredNullablePositiveId = positiveId.nullable();
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须使用 YYYY-MM-DD 格式")
  .refine(isRealDateOnly, "日期无效");
const nullableDateOnly = dateOnly.nullable().optional();
const nullableFiniteNumber = z.number().finite().nullable().optional();

const createWorkItemSchema = z.object({
  targetType: z.enum(["personal", "department", "project"]),
  targetId: positiveId,
  planId: positiveId,
  itemType: z.enum(["objective", "key_result", "task"]),
  content: z.string().trim().min(1),
  description: z.string().trim().optional(),
  importance: z.number().int().min(1).max(5).optional(),
  urgency: z.number().int().min(1).max(5).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  krStartValue: nullableFiniteNumber,
  krTargetValue: nullableFiniteNumber,
  krCurrentValue: nullableFiniteNumber,
  krUnit: z.string().trim().transform((value) => value || null).nullable().optional(),
  ownerEmployeeId: nullablePositiveId,
  collaborationId: nullablePositiveId,
  actualStartDate: nullableDateOnly,
  actualEndDate: nullableDateOnly,
  plannedStartDate: nullableDateOnly,
  plannedEndDate: nullableDateOnly,
  isMilestone: z.boolean().optional(),
  milestoneDate: nullableDateOnly,
  parentWorkItemId: requiredNullablePositiveId,
  evidenceTaskIds: z.array(positiveId).transform((ids) => [...new Set(ids)]).optional(),
}).strict().superRefine((value, context) => {
  const isObjective = value.itemType === "objective";
  const isKr = value.itemType === "key_result";
  const isTask = value.itemType === "task";
  if (!isObjective && !value.parentWorkItemId) {
    context.addIssue({ code: "custom", path: ["parentWorkItemId"], message: "KR 或任务必须选择所属目标" });
  }
  if (isObjective && value.parentWorkItemId !== null) {
    context.addIssue({ code: "custom", path: ["parentWorkItemId"], message: "目标不能设置所属目标" });
  }
  if (!isKr && firstTouchedField(value, ["krStartValue", "krTargetValue", "krCurrentValue", "krUnit"])) {
    context.addIssue({ code: "custom", message: "只有 KR 表单可以填写指标" });
  }
  if (!isKr && hasOwn(value, "evidenceTaskIds")) {
    context.addIssue({ code: "custom", path: ["evidenceTaskIds"], message: "只有 KR 表单可以选择任务证据" });
  }
  if (!isTask && firstTouchedField(value, ["importance", "urgency"])) {
    context.addIssue({ code: "custom", message: "只有任务表单可以填写重要度或紧急度" });
  }
  if (isKr && firstTouchedField(value, ["actualStartDate", "actualEndDate", "plannedStartDate", "plannedEndDate"])) {
    context.addIssue({ code: "custom", message: "KR 表单不能填写起止日期" });
  }
  if (!isObjective && firstTouchedField(value, ["isMilestone", "milestoneDate"])) {
    context.addIssue({ code: "custom", message: "只有目标表单可以填写里程碑" });
  }
  if (value.milestoneDate && value.isMilestone !== true) {
    context.addIssue({ code: "custom", path: ["milestoneDate"], message: "仅启用里程碑后才能填写里程碑日期" });
  }
  if (value.actualEndDate && value.status !== "done") {
    context.addIssue({ code: "custom", path: ["actualEndDate"], message: "请先选择已完成，再填写实际结束" });
  }
  if (hasOwn(value, "collaborationId") && !(value.targetType === "department" && isTask)) {
    context.addIssue({ code: "custom", path: ["collaborationId"], message: "只有部门任务表单可以选择关联协作" });
  }
});

const storedCreateWorkItemSchema = z.object({
  input: createWorkItemSchema,
  sortOrder: z.number().int().nonnegative(),
}).strict();

export type AgentCreateWorkItemInput = z.infer<typeof createWorkItemSchema>;

export function parseAgentCreateWorkItemInput(value: unknown) {
  return createWorkItemSchema.safeParse(value);
}

export function parseStoredAgentCreateWorkItem(value: unknown) {
  return storedCreateWorkItemSchema.safeParse(value);
}

/** Derives the same non-routine hidden defaults as the canonical Work create form. */
export function buildAgentCreateWorkItemBody(input: AgentCreateWorkItemInput, sortOrder: number) {
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    planId: input.planId,
    category: "non-routine",
    itemType: input.itemType,
    content: input.content,
    description: input.description ?? "",
    importance: input.importance ?? 3,
    urgency: input.urgency ?? 3,
    status: input.status ?? "active",
    krStartValue: input.krStartValue ?? null,
    krTargetValue: input.krTargetValue ?? null,
    krCurrentValue: input.krCurrentValue ?? null,
    krUnit: input.krUnit ?? null,
    routineTaskType: null,
    routineRecurrenceType: null,
    ownerEmployeeId: input.ownerEmployeeId ?? null,
    collaborationId: input.collaborationId ?? null,
    actualStartDate: input.actualStartDate ?? null,
    actualEndDate: input.actualEndDate ?? null,
    plannedStartDate: input.plannedStartDate ?? null,
    plannedEndDate: input.plannedEndDate ?? null,
    isMilestone: input.isMilestone ?? false,
    milestoneDate: input.milestoneDate ?? null,
    periodType: null,
    periodStart: null,
    periodEnd: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingDecisionId: null,
    sourceMeetingActionCandidateId: null,
    sourceDepartmentId: null,
    linkedProjectId: null,
    linkedProjectPhaseId: null,
    parentWorkItemId: input.parentWorkItemId ?? null,
    ...(input.evidenceTaskIds !== undefined && { evidenceTaskIds: input.evidenceTaskIds }),
    parentPeriodWorkItemId: null,
    previousPeriodWorkItemId: null,
    responsibilityNodeId: null,
    responsibilityPositionId: null,
    participants: "",
    sortOrder,
  };
}

function firstTouchedField(
  input: AgentCreateWorkItemInput,
  fields: readonly (keyof AgentCreateWorkItemInput)[],
) {
  return fields.find((field) => hasOwn(input, field)) ?? null;
}

function hasOwn(input: object, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function isRealDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
