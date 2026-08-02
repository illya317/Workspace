export const PROJECT_NOTIFICATION_EVENT_OPTIONS = [
  { value: "project.updated", label: "项目资料变更" },
  { value: "project.archived", label: "项目归档" },
  { value: "project.restored", label: "项目恢复" },
  { value: "project.scheduled", label: "每日监管巡检" },
] as const;

export const PROJECT_NOTIFICATION_PATH_OPTIONS = [
  { value: "project.status", label: "项目状态", kind: "status" },
  { value: "project.projectLevel", label: "项目级别", kind: "level" },
  { value: "project.completionPercent", label: "完成度", kind: "number" },
  { value: "project.plannedStartDate", label: "计划开始日", kind: "date" },
  { value: "project.plannedEndDate", label: "计划结束日", kind: "date" },
  { value: "project.riskPresent", label: "是否登记风险", kind: "boolean" },
  { value: "project.isArchived", label: "是否归档", kind: "boolean" },
  { value: "signal.kind", label: "监管信号", kind: "event" },
  { value: "signal.changedField", label: "发生变化的字段", kind: "text" },
] as const;

export type ProjectNotificationEventType = typeof PROJECT_NOTIFICATION_EVENT_OPTIONS[number]["value"];
export type ProjectNotificationPath = typeof PROJECT_NOTIFICATION_PATH_OPTIONS[number]["value"];
export type ProjectNotificationChannel = "workspace" | "wecom";
export type ProjectNotificationRole = "R" | "A" | "S" | "C" | "I";
export type ProjectNotificationScalarOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type ProjectNotificationSetOperator = "in" | "notIn";
export type ProjectNotificationDateOperator = "withinNextDays" | "daysOverdue";
export type ProjectNotificationPredicate =
  | { op: ProjectNotificationScalarOperator; path: ProjectNotificationPath; value: string | number | boolean | null }
  | { op: ProjectNotificationSetOperator; path: ProjectNotificationPath; value: Array<string | number | boolean | null> }
  | { op: "present"; path: ProjectNotificationPath }
  | { op: ProjectNotificationDateOperator; path: ProjectNotificationPath; value: number };
export type ProjectNotificationCondition =
  | ProjectNotificationPredicate
  | { op: "all" | "any"; conditions: ProjectNotificationCondition[] }
  | { op: "not"; condition: ProjectNotificationCondition };

export type ProjectNotificationRule = {
  id: number;
  projectId: number;
  key: string;
  label: string;
  definitionKey: string;
  eventType: ProjectNotificationEventType;
  condition: ProjectNotificationCondition;
  audiencePolicy: { roles: ProjectNotificationRole[] };
  channelPolicy: { channels: ProjectNotificationChannel[] };
  cooldownSeconds: number;
  status: "draft" | "published" | "archived";
  revision: number;
  publishedRevision: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type ProjectNotificationRuleDraft = Pick<
  ProjectNotificationRule,
  "key" | "label" | "definitionKey" | "eventType" | "condition" | "audiencePolicy" | "channelPolicy" | "cooldownSeconds"
>;

export async function applyProjectNotificationAuditResponse<T>(
  request: Promise<T>,
  isCurrent: () => boolean,
  apply: (value: T) => void,
) {
  const value = await request;
  if (isCurrent()) apply(value);
}

export const EMPTY_PROJECT_NOTIFICATION_RULE: ProjectNotificationRuleDraft = {
  key: "",
  label: "",
  definitionKey: "",
  eventType: "project.updated",
  condition: {
    op: "all",
    conditions: [{ op: "eq", path: "project.status", value: "active" }],
  },
  audiencePolicy: { roles: ["A", "R"] },
  channelPolicy: { channels: ["workspace"] },
  cooldownSeconds: 0,
};

export function toProjectNotificationRuleDraft(rule: ProjectNotificationRule): ProjectNotificationRuleDraft {
  return {
    key: rule.key,
    label: rule.label,
    definitionKey: rule.definitionKey,
    eventType: rule.eventType,
    condition: rule.condition,
    audiencePolicy: { roles: [...rule.audiencePolicy.roles] },
    channelPolicy: { channels: [...rule.channelPolicy.channels] },
    cooldownSeconds: rule.cooldownSeconds,
  };
}

export function flatProjectNotificationCondition(condition: ProjectNotificationCondition) {
  if ((condition.op !== "all" && condition.op !== "any") || condition.conditions.some((item) => !isPredicate(item))) {
    return null;
  }
  return { logic: condition.op, predicates: condition.conditions as ProjectNotificationPredicate[] };
}

export function replaceFlatProjectNotificationCondition(
  condition: ProjectNotificationCondition,
  logic: "all" | "any",
  predicates: ProjectNotificationPredicate[],
): ProjectNotificationCondition {
  return flatProjectNotificationCondition(condition) ? { op: logic, conditions: predicates } : condition;
}

export function defaultProjectNotificationPredicate(): ProjectNotificationPredicate {
  return { op: "eq", path: "project.status", value: "active" };
}

export function normalizeProjectNotificationRedriveReason(value: string) {
  const reason = value.trim();
  return reason.length > 0 && reason.length <= 500 ? reason : null;
}

export function projectNotificationPathKind(path: ProjectNotificationPath) {
  return PROJECT_NOTIFICATION_PATH_OPTIONS.find((item) => item.value === path)?.kind ?? "text";
}

export function projectNotificationOperators(path: ProjectNotificationPath) {
  const kind = projectNotificationPathKind(path);
  const common = [
    { value: "eq", label: "等于" },
    { value: "neq", label: "不等于" },
    { value: "in", label: "属于其中" },
    { value: "notIn", label: "不属于其中" },
    { value: "present", label: "已填写" },
  ];
  if (kind === "number") return [...common, { value: "gt", label: "大于" }, { value: "gte", label: "大于等于" }, { value: "lt", label: "小于" }, { value: "lte", label: "小于等于" }];
  if (kind === "date") return [...common, { value: "withinNextDays", label: "未来若干天内" }, { value: "daysOverdue", label: "已逾期若干天" }];
  return common;
}

export function updateProjectNotificationPredicate(
  predicate: ProjectNotificationPredicate,
  patch: { path?: ProjectNotificationPath; op?: ProjectNotificationPredicate["op"]; rawValue?: unknown },
): ProjectNotificationPredicate {
  const path = patch.path ?? predicate.path;
  const requestedOp = patch.op ?? predicate.op;
  const op = projectNotificationOperators(path).some((option) => option.value === requestedOp)
    ? requestedOp
    : "eq";
  if (op === "present") return { op, path };
  const kind = projectNotificationPathKind(path);
  const pathChanged = patch.path !== undefined && patch.path !== predicate.path;
  const sourceValue = patch.rawValue ?? (
    pathChanged
      ? defaultValueForKind(kind)
      : "value" in predicate ? predicate.value : defaultValueForKind(kind)
  );
  if (op === "in" || op === "notIn") {
    const values = Array.isArray(sourceValue) ? sourceValue : String(sourceValue ?? "").split(/[，,]/);
    return { op, path, value: values.map((value) => coerceValue(kind, value)).filter((value) => value !== "") };
  }
  if (op === "withinNextDays" || op === "daysOverdue") {
    const numeric = Number(sourceValue);
    return { op, path, value: Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0 };
  }
  return { op, path, value: coerceValue(kind, sourceValue) };
}

export function projectNotificationPredicateInputValue(predicate: ProjectNotificationPredicate) {
  if (!("value" in predicate)) return "";
  return Array.isArray(predicate.value) ? predicate.value.join("，") : predicate.value ?? "";
}

function isPredicate(condition: ProjectNotificationCondition): condition is ProjectNotificationPredicate {
  return condition.op !== "all" && condition.op !== "any" && condition.op !== "not";
}

function defaultValueForKind(kind: string) {
  if (kind === "boolean") return true;
  if (kind === "number") return 0;
  return "";
}

function coerceValue(kind: string, value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (kind === "boolean") return value === true || value === "true" || value === "是";
  if (kind === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return String(value ?? "").trim();
}
