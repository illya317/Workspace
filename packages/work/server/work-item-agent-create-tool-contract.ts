import type { AgentToolParameters } from "@workspace/platform/server/agent/tools";

const SEARCH_REFERENCE_OPTIONS_ACTION = "work.searchReferenceOptions";
const nullablePositiveInteger = { type: ["integer", "null"], minimum: 1 };
const nullableDateOnly = {
  type: ["string", "null"],
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "严格 YYYY-MM-DD；传 null 表示未设置",
};

export const createWorkItemToolParameters: AgentToolParameters = {
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
    parentWorkItemId: { ...nullablePositiveInteger, description: "必须显式传入；目标传 null，KR 或任务传同一计划根目标的 WorkItem ID" },
    evidenceTaskIds: {
      type: "array",
      items: { type: "integer", minimum: 1 },
      uniqueItems: true,
      description: "仅 KR 可用；同一目标下作为结果证据的任务 WorkItem ID，可传空数组",
    },
  },
  required: ["targetType", "targetId", "planId", "itemType", "content", "parentWorkItemId"],
  additionalProperties: false,
};
