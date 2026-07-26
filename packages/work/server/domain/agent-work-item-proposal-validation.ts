import { z } from "zod";

const positiveId = z.number().int().positive();
const nullablePositiveId = positiveId.nullable().optional();
const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须使用 YYYY-MM-DD 格式")
  .refine(isRealDateOnly, "日期无效");
const nullableDateOnly = dateOnly.nullable().optional();
const nullableFiniteNumber = z.number().finite().nullable().optional();
const nullableRecurrenceInteger = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum).nullable().optional();

const workItemFormMutationFields = {
  content: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  importance: z.number().int().min(1).max(5).optional(),
  urgency: z.number().int().min(1).max(5).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  krStartValue: nullableFiniteNumber,
  krTargetValue: nullableFiniteNumber,
  krCurrentValue: nullableFiniteNumber,
  krUnit: z.string().trim().transform((value) => value || null).nullable().optional(),
  routineRecurrenceType: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).nullable().optional(),
  routineRecurrenceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "周期时间必须使用 HH:mm 格式").nullable().optional(),
  routineRecurrenceWeekday: nullableRecurrenceInteger(1, 7),
  routineRecurrenceMonthDay: nullableRecurrenceInteger(1, 31),
  routineRecurrenceQuarterDay: nullableRecurrenceInteger(1, 92),
  routineRecurrenceYearMonth: nullableRecurrenceInteger(1, 12),
  routineRecurrenceYearDay: nullableRecurrenceInteger(1, 31),
  ownerEmployeeId: nullablePositiveId,
  collaborationId: nullablePositiveId,
  actualStartDate: nullableDateOnly,
  actualEndDate: nullableDateOnly,
  plannedStartDate: nullableDateOnly,
  plannedEndDate: nullableDateOnly,
  isMilestone: z.boolean().optional(),
  milestoneDate: nullableDateOnly,
  parentWorkItemId: nullablePositiveId,
  parentPeriodWorkItemId: nullablePositiveId,
  previousPeriodWorkItemId: nullablePositiveId,
  responsibilityNodeId: nullablePositiveId,
  responsibilityPositionId: nullablePositiveId,
  evidenceTaskIds: z.array(positiveId).transform((ids) => [...new Set(ids)]).optional(),
} satisfies z.ZodRawShape;

const updateWorkItemSchema = z.object({
  workId: positiveId,
  ...workItemFormMutationFields,
}).strict().superRefine((value, context) => {
  if (Object.keys(value).some((key) => key !== "workId")) return;
  context.addIssue({ code: "custom", message: "至少提供一个需要修改的字段" });
});

const storedUpdateWorkItemSchema = z.object({
  input: updateWorkItemSchema,
  expectedUpdatedAt: z.string().datetime(),
}).strict();

const workSpaceDetailSchema = z.object({
  targetType: z.enum(["personal", "department", "project"]),
  targetId: positiveId,
  planId: positiveId.optional(),
  workId: positiveId.optional(),
  keyword: z.string().trim().max(200).optional(),
}).strict();

export const AGENT_WORK_REFERENCE_KEYS = [
  "work.tasks.owner.employee",
  "work.tasks.collaboration",
  "work.tasks.owner.position",
  "work.tasks.item.responsibility",
  "work.tasks.parent.item",
  "work.tasks.previous.item",
  "work.tasks.assigned.alignment.item",
] as const;

const workReferenceOptionsSchema = z.object({
  fkKey: z.enum(AGENT_WORK_REFERENCE_KEYS),
  keyword: z.string().trim().max(200).optional(),
  targetType: z.enum(["personal", "department", "project"]),
  targetId: positiveId,
  planId: positiveId.optional(),
  currentWorkItemId: positiveId.optional(),
  itemType: z.enum(["objective", "key_result", "task"]).optional(),
  ownerEmployeeId: positiveId.optional(),
  collaborationId: positiveId.optional(),
  positionId: positiveId.optional(),
}).strict().superRefine((value, context) => {
  const requireField = (field: keyof typeof value, message: string) => {
    if (value[field] !== undefined) return;
    context.addIssue({ code: "custom", path: [field], message });
  };
  if (value.fkKey === "work.tasks.item.responsibility") {
    requireField("positionId", "搜索岗位职责前必须先选择岗位");
    if (value.targetType !== "personal") requireField("ownerEmployeeId", "搜索岗位职责前必须先选择负责人");
  }
  if (value.fkKey === "work.tasks.owner.position" && value.targetType !== "personal") {
    requireField("ownerEmployeeId", "搜索岗位前必须先选择负责人");
  }
  if (value.fkKey === "work.tasks.parent.item" || value.fkKey === "work.tasks.previous.item") {
    requireField("planId", "搜索跨期关系前必须提供当前计划");
    requireField("currentWorkItemId", "搜索跨期关系前必须提供当前工作项");
    requireField("itemType", "搜索跨期关系前必须提供当前节点类型");
  }
  if (value.fkKey === "work.tasks.assigned.alignment.item") {
    requireField("currentWorkItemId", "搜索外部对齐关系前必须提供当前工作项");
  }
});

export type AgentUpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;
export type AgentWorkSpaceDetailInput = z.infer<typeof workSpaceDetailSchema>;
export type AgentWorkReferenceOptionsInput = z.infer<typeof workReferenceOptionsSchema>;

export type AgentWorkItemFormSnapshot = {
  targetType: string;
  category: string;
  itemType: string;
  routineTaskType: string | null;
  routineRecurrenceType: string | null;
  routineRecurrenceTime?: string | null;
  status?: string | null;
  isMilestone: boolean;
};

export type AgentWorkReferenceOption = Record<string, unknown> & {
  id: number;
};

export function parseAgentUpdateWorkItemInput(value: unknown) {
  return updateWorkItemSchema.safeParse(value);
}

export function parseStoredAgentUpdateWorkItem(value: unknown) {
  return storedUpdateWorkItemSchema.safeParse(value);
}

export function parseAgentWorkSpaceDetailInput(value: unknown) {
  return workSpaceDetailSchema.safeParse(value);
}

export function parseAgentWorkReferenceOptionsInput(value: unknown) {
  return workReferenceOptionsSchema.safeParse(value);
}

export function agentWorkItemAvailabilityError(snapshot: { isArchived: boolean } | null | undefined) {
  return !snapshot || snapshot.isArchived ? "工作节点不存在或不可维护" : null;
}

/** Mirrors the conditional fields rendered by WorkTaskForm for an existing item. */
export function validateAgentWorkItemFormFields(
  input: AgentUpdateWorkItemInput,
  snapshot: AgentWorkItemFormSnapshot,
) {
  const isTask = snapshot.itemType === "task";
  const isKr = snapshot.itemType === "key_result";
  const isObjective = snapshot.itemType === "objective";
  const isRoutineTask = isTask && snapshot.category === "routine";
  const isStandingResponsibility = isRoutineTask && snapshot.routineTaskType === "standing";
  const isOrdinaryRoutineTask = isRoutineTask && snapshot.routineTaskType === "task";
  const effectiveRecurrenceType = input.routineRecurrenceType === undefined
    ? snapshot.routineRecurrenceType
    : input.routineRecurrenceType;
  const effectiveIsMilestone = input.isMilestone === undefined ? snapshot.isMilestone : input.isMilestone;
  const effectiveStatus = input.status === undefined ? snapshot.status : input.status;

  const issue = firstTouchedField(input, ["krStartValue", "krTargetValue", "krCurrentValue", "krUnit", "evidenceTaskIds"]);
  if (issue && !isKr) return "只有 KR 表单可以修改指标或任务证据";
  if (firstTouchedField(input, RECURRENCE_FIELDS) && !isOrdinaryRoutineTask) return "只有普通日常任务表单可以修改周期规则";
  if (firstTouchedField(input, ["responsibilityNodeId", "responsibilityPositionId"]) && !isStandingResponsibility) {
    return "只有常设职责表单可以修改关联岗位职责";
  }
  if (firstTouchedField(input, ["importance", "urgency"]) && (!isTask || isStandingResponsibility)) {
    return "当前工作项表单不能修改重要度或紧急度";
  }
  if (firstTouchedField(input, ["actualStartDate", "actualEndDate", "plannedStartDate", "plannedEndDate"]) && !(isObjective || (isTask && !isStandingResponsibility))) {
    return "当前工作项表单不能修改起止日期";
  }
  if (firstTouchedField(input, ["isMilestone", "milestoneDate"]) && !isObjective) return "只有目标表单可以修改里程碑";
  if (hasOwn(input, "milestoneDate") && !effectiveIsMilestone) return "仅启用里程碑后才能修改里程碑日期";
  if (input.actualEndDate && effectiveStatus !== "done") return "请先选择已完成，再填写实际结束";
  if (hasOwn(input, "routineRecurrenceWeekday") && effectiveRecurrenceType !== "weekly") return "仅每周周期可以修改星期";
  if (hasOwn(input, "routineRecurrenceMonthDay") && effectiveRecurrenceType !== "monthly") return "仅每月周期可以修改日期";
  if (hasOwn(input, "routineRecurrenceQuarterDay") && effectiveRecurrenceType !== "quarterly") return "仅每季度周期可以修改季度天数";
  if (firstTouchedField(input, ["routineRecurrenceYearMonth", "routineRecurrenceYearDay"]) && effectiveRecurrenceType !== "yearly") {
    return "仅每年周期可以修改月份或日期";
  }
  if (hasOwn(input, "collaborationId") && !(snapshot.targetType === "department" && isTask)) return "只有部门任务表单可以修改关联协作";
  if (hasOwn(input, "parentWorkItemId") && (isObjective || isStandingResponsibility)) return "当前工作项表单不能修改所属目标或常设职责";
  if (hasOwn(input, "parentPeriodWorkItemId") && isRoutineTask) return "日常任务表单不能修改跨期或外部对齐关系";
  if (hasOwn(input, "previousPeriodWorkItemId") && !(isObjective || isKr)) return "只有目标或 KR 表单可以修改前序节点";
  return null;
}

/** Expands side effects produced by the manual form before validating and presenting the proposal. */
export function expandAgentWorkItemFormPatch(
  input: AgentUpdateWorkItemInput,
  snapshot: AgentWorkItemFormSnapshot,
): AgentUpdateWorkItemInput {
  let expanded = { ...input };
  if (hasOwn(input, "routineRecurrenceType")
    && input.routineRecurrenceType !== snapshot.routineRecurrenceType) {
    const defaults = input.routineRecurrenceType
      ? {
          routineRecurrenceTime: null,
          routineRecurrenceWeekday: 1,
          routineRecurrenceMonthDay: 1,
          routineRecurrenceQuarterDay: 1,
          routineRecurrenceYearMonth: 1,
          routineRecurrenceYearDay: 1,
        }
      : {
          routineRecurrenceTime: snapshot.routineRecurrenceTime ?? null,
          routineRecurrenceWeekday: null,
          routineRecurrenceMonthDay: null,
          routineRecurrenceQuarterDay: null,
          routineRecurrenceYearMonth: null,
          routineRecurrenceYearDay: null,
        };
    expanded = { ...defaults, ...expanded };
  }
  if (input.status !== undefined && input.status !== "done") expanded.actualEndDate = null;
  if (input.isMilestone === false) expanded.milestoneDate = null;
  return expanded;
}

/** Candidate identity includes locked responsibility context, not only the node id. */
export function intersectAgentWorkReferenceOptions(
  actorOptions: AgentWorkReferenceOption[],
  requesterOptions: AgentWorkReferenceOption[],
) {
  const requesterKeys = new Set(requesterOptions.map(agentReferenceOptionKey));
  return actorOptions.filter((option) => requesterKeys.has(agentReferenceOptionKey(option)));
}

export function firstAgentWorkItemValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message || "工作项参数无效";
}

const RECURRENCE_FIELDS = [
  "routineRecurrenceType",
  "routineRecurrenceTime",
  "routineRecurrenceWeekday",
  "routineRecurrenceMonthDay",
  "routineRecurrenceQuarterDay",
  "routineRecurrenceYearMonth",
  "routineRecurrenceYearDay",
] as const;

function firstTouchedField(input: AgentUpdateWorkItemInput, fields: readonly (keyof AgentUpdateWorkItemInput)[]) {
  return fields.find((field) => hasOwn(input, field)) ?? null;
}

function hasOwn(input: object, field: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function isRealDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function agentReferenceOptionKey(option: AgentWorkReferenceOption) {
  return [option.id, option.lockedEmployeeId ?? "", option.lockedPositionId ?? ""].join(":");
}
