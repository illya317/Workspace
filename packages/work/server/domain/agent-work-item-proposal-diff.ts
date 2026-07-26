import type { AgentCreateWorkItemInput } from "./agent-work-item-create-validation";
import type { AgentUpdateWorkItemInput } from "./agent-work-item-proposal-validation";

type ChangeField = Exclude<keyof AgentUpdateWorkItemInput, "workId">;

export type AgentWorkItemDiffReferenceLabels = Partial<Record<ChangeField, string | string[]>>;

const FIELD_LABELS: Record<ChangeField, string> = {
  content: "内容",
  description: "说明",
  importance: "重要度",
  urgency: "紧急度",
  status: "状态",
  krStartValue: "KR起始值",
  krTargetValue: "KR目标值",
  krCurrentValue: "KR当前值",
  krUnit: "KR单位",
  routineRecurrenceType: "周期规则",
  routineRecurrenceTime: "周期时间",
  routineRecurrenceWeekday: "周期星期",
  routineRecurrenceMonthDay: "每月日期",
  routineRecurrenceQuarterDay: "季度第几天",
  routineRecurrenceYearMonth: "年度月份",
  routineRecurrenceYearDay: "年度日期",
  ownerEmployeeId: "负责人",
  collaborationId: "部门协作",
  actualStartDate: "实际开始",
  actualEndDate: "实际结束",
  plannedStartDate: "计划开始",
  plannedEndDate: "计划结束",
  isMilestone: "是否里程碑",
  milestoneDate: "里程碑日期",
  parentWorkItemId: "所属目标或常设职责",
  parentPeriodWorkItemId: "跨期或外部对齐节点",
  previousPeriodWorkItemId: "前序节点",
  responsibilityNodeId: "岗位职责",
  responsibilityPositionId: "岗位",
  evidenceTaskIds: "KR任务证据",
};

const STATUS_LABELS: Record<string, string> = {
  active: "进行中",
  paused: "已暂停",
  done: "已完成",
};

const STANDING_RESPONSIBILITY_STATUS_LABELS: Record<string, string> = {
  active: "生效中",
  paused: "已暂停",
  done: "已失效",
};

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  quarterly: "每季度",
  yearly: "每年",
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

const ITEM_TYPE_LABELS: Record<AgentCreateWorkItemInput["itemType"], string> = {
  objective: "目标",
  key_result: "关键结果",
  task: "任务",
};

type AgentCreateReferenceLabels = Partial<Record<
  "ownerEmployeeId" | "collaborationId" | "parentWorkItemId" | "evidenceTaskIds",
  string | string[]
>>;

export function buildAgentWorkItemCreateDiff(input: {
  spaceName: string;
  planTitle: string;
  changes: AgentCreateWorkItemInput;
  referenceLabels: AgentCreateReferenceLabels;
}) {
  const changes = input.changes;
  const values: Record<string, unknown> = {
    内容: changes.content,
    状态: STATUS_LABELS[changes.status ?? "active"],
  };
  if (changes.description) values.说明 = changes.description;
  if (changes.itemType === "task") {
    values.重要度 = changes.importance ?? 3;
    values.紧急度 = changes.urgency ?? 3;
  }
  if (changes.itemType === "key_result") {
    addDefined(values, "KR起始值", changes.krStartValue);
    addDefined(values, "KR目标值", changes.krTargetValue);
    addDefined(values, "KR当前值", changes.krCurrentValue);
    addDefined(values, "KR单位", changes.krUnit);
    addDefined(values, "任务证据", input.referenceLabels.evidenceTaskIds);
  }
  addDefined(values, "负责人", input.referenceLabels.ownerEmployeeId);
  addDefined(values, "部门协作", input.referenceLabels.collaborationId);
  addDefined(values, "所属目标", input.referenceLabels.parentWorkItemId);
  addDefined(values, "实际开始", changes.actualStartDate);
  addDefined(values, "实际结束", changes.actualEndDate);
  addDefined(values, "计划开始", changes.plannedStartDate);
  addDefined(values, "计划结束", changes.plannedEndDate);
  if (changes.itemType === "objective" && changes.isMilestone !== undefined) {
    values.是否里程碑 = changes.isMilestone ? "是" : "否";
    addDefined(values, "里程碑日期", changes.milestoneDate);
  }
  return {
    动作: "创建工作节点",
    空间: input.spaceName,
    计划: `${input.planTitle} (#${changes.planId})`,
    节点类型: ITEM_TYPE_LABELS[changes.itemType],
    表单值: values,
  };
}

/** Produces a stable, human-readable confirmation snapshot before proposal persistence. */
export function buildAgentWorkItemUpdateDiff(input: {
  spaceName: string;
  workId: number;
  changes: AgentUpdateWorkItemInput;
  currentValues: Partial<Record<ChangeField, unknown>>;
  currentReferenceLabels: AgentWorkItemDiffReferenceLabels;
  nextReferenceLabels: AgentWorkItemDiffReferenceLabels;
  standingResponsibility?: boolean;
}) {
  const statusLabels = input.standingResponsibility
    ? STANDING_RESPONSIBILITY_STATUS_LABELS
    : STATUS_LABELS;
  const changedFields = Object.entries(input.changes)
    .filter(([field]) => field !== "workId")
    .map(([rawField, nextValue]) => {
      const field = rawField as ChangeField;
      return [FIELD_LABELS[field] ?? field, {
        旧值: displayValue(field, input.currentReferenceLabels[field] ?? input.currentValues[field], statusLabels),
        新值: displayValue(field, input.nextReferenceLabels[field] ?? nextValue, statusLabels),
      }];
    });

  return {
    动作: "修改工作节点",
    空间: input.spaceName,
    工作节点ID: input.workId,
    字段变更: Object.fromEntries(changedFields),
  };
}

function displayValue(field: ChangeField, value: unknown, statusLabels: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.length > 0 ? [...value] : "无";
  if (value === null || value === undefined || value === "") return "未设置";
  if (field === "status" && typeof value === "string") return statusLabels[value] ?? value;
  if (field === "routineRecurrenceType" && typeof value === "string") return RECURRENCE_LABELS[value] ?? value;
  if (field === "routineRecurrenceWeekday" && typeof value === "number") return WEEKDAY_LABELS[value] ?? value;
  if (field === "isMilestone" && typeof value === "boolean") return value ? "是" : "否";
  return value;
}

function addDefined(target: Record<string, unknown>, label: string, value: unknown) {
  if (value !== undefined && value !== null && value !== "") target[label] = value;
}
