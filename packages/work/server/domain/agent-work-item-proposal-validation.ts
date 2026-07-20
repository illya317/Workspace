import { z } from "zod";

const positiveId = z.coerce.number().int().positive();
const nullablePositiveId = positiveId.nullable().optional();
const nullableDate = z.string().trim().min(1).nullable().optional();

const workItemMutationFields = {
  planId: nullablePositiveId,
  category: z.enum(["routine", "non-routine"]).optional(),
  itemType: z.enum(["objective", "key_result", "task"]).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  description: z.string().max(8000).optional(),
  importance: z.coerce.number().int().min(0).max(10).optional(),
  urgency: z.coerce.number().int().min(0).max(10).optional(),
  status: z.enum(["active", "paused", "done"]).nullable().optional(),
  krStartValue: z.coerce.number().nullable().optional(),
  krTargetValue: z.coerce.number().nullable().optional(),
  krCurrentValue: z.coerce.number().nullable().optional(),
  krUnit: z.string().max(100).nullable().optional(),
  routineTaskType: z.enum(["standing", "task"]).nullable().optional(),
  ownerEmployeeId: nullablePositiveId,
  collaborationId: nullablePositiveId,
  actualStartDate: nullableDate,
  actualEndDate: nullableDate,
  plannedStartDate: nullableDate,
  plannedEndDate: nullableDate,
  isMilestone: z.boolean().optional(),
  milestoneDate: nullableDate,
  sourceDepartmentId: nullablePositiveId,
  linkedProjectId: nullablePositiveId,
  linkedProjectPhaseId: nullablePositiveId,
  parentWorkItemId: nullablePositiveId,
  responsibilityNodeId: nullablePositiveId,
  responsibilityPositionId: nullablePositiveId,
  participants: z.string().max(2000).optional(),
  sortOrder: z.coerce.number().int().optional(),
} satisfies z.ZodRawShape;

const createWorkItemSchema = z.object({
  targetType: z.enum(["personal", "department", "project"]),
  targetId: positiveId,
  ...workItemMutationFields,
  category: z.enum(["routine", "non-routine"]).default("non-routine"),
  itemType: z.enum(["objective", "key_result", "task"]).default("task"),
  content: z.string().trim().min(1).max(2000),
}).strict();

const updateWorkItemSchema = z.object({
  workId: positiveId,
  ...workItemMutationFields,
}).strict().superRefine((value, context) => {
  if (Object.keys(value).some((key) => key !== "workId")) return;
  context.addIssue({ code: "custom", message: "至少提供一个需要修改的字段" });
});

const storedCreateWorkItemSchema = z.object({
  input: createWorkItemSchema,
}).strict();

const storedUpdateWorkItemSchema = z.object({
  input: updateWorkItemSchema,
  expectedUpdatedAt: z.string().datetime(),
}).strict();

export type AgentCreateWorkItemInput = z.infer<typeof createWorkItemSchema>;
export type AgentUpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>;

export function parseAgentCreateWorkItemInput(value: unknown) {
  return createWorkItemSchema.safeParse(value);
}

export function parseAgentUpdateWorkItemInput(value: unknown) {
  return updateWorkItemSchema.safeParse(value);
}

export function parseStoredAgentCreateWorkItem(value: unknown) {
  return storedCreateWorkItemSchema.safeParse(value);
}

export function parseStoredAgentUpdateWorkItem(value: unknown) {
  return storedUpdateWorkItemSchema.safeParse(value);
}

export function firstAgentWorkItemValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message || "工作项参数无效";
}
