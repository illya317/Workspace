import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import {
  PROJECT_NOTIFICATION_PATH_OPTIONS,
  projectNotificationOperators,
  projectNotificationPathKind,
  projectNotificationPredicateInputValue,
  updateProjectNotificationPredicate,
  type ProjectNotificationPath,
  type ProjectNotificationPredicate,
  type ProjectNotificationRule,
} from "./notification-governance-model";

export const PROJECT_NOTIFICATION_ROLE_OPTIONS = [
  { value: "A", label: "A · 最终负责" },
  { value: "R", label: "R · 执行负责" },
  { value: "S", label: "S · 支持" },
  { value: "C", label: "C · 咨询" },
  { value: "I", label: "I · 知会" },
];

export const PROJECT_NOTIFICATION_CHANNEL_OPTIONS = [
  { value: "workspace", label: "Workspace 站内" },
  { value: "wecom", label: "企业微信 Bot 私聊" },
];

export function projectNotificationConditionFields(
  predicate: ProjectNotificationPredicate,
  index: number,
  disabled: boolean,
  predicates: ProjectNotificationPredicate[],
  onChange: (predicates: ProjectNotificationPredicate[]) => void,
): FormSurfaceFieldSpec[] {
  const patch = (next: ProjectNotificationPredicate) => {
    const copy = [...predicates];
    copy[index] = next;
    onChange(copy);
  };
  return [
    {
      key: `condition-path-${index}`,
      label: "项目事实",
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: [...PROJECT_NOTIFICATION_PATH_OPTIONS] },
      },
      value: predicate.path,
      onChange: (value: unknown) => patch(updateProjectNotificationPredicate(predicate, { path: value as ProjectNotificationPath })),
    },
    {
      key: `condition-op-${index}`,
      label: "判断",
      spec: {
        valueType: "string",
        control: "choice",
        state: disabled ? "disabled" : "normal",
        options: { source: "static", items: projectNotificationOperators(predicate.path) },
      },
      value: predicate.op,
      onChange: (value: unknown) => patch(updateProjectNotificationPredicate(predicate, { op: value as ProjectNotificationPredicate["op"] })),
    },
    predicateValueField(predicate, index, disabled, patch),
  ];
}

export function projectNotificationRuleState(rule: ProjectNotificationRule) {
  if (rule.status === "archived") return { label: "已归档", tone: "muted" as const };
  if (rule.publishedRevision !== null && rule.publishedRevision !== rule.revision) return { label: "有待发布改动", tone: "warning" as const };
  if (rule.publishedRevision !== null) return { label: "监管中", tone: "success" as const };
  return { label: "草稿", tone: "warning" as const };
}

export function projectNotificationOutcomeLabel(outcome: string) {
  if (outcome === "published") return "已发布";
  if (outcome === "condition_not_matched") return "条件未命中";
  if (outcome === "cooldown") return "冷却抑制";
  if (outcome === "no_recipients") return "无接收人";
  if (outcome === "error") return "异常";
  return outcome;
}

export function projectNotificationOutcomeTone(outcome: string) {
  if (outcome === "published") return "green" as const;
  if (outcome === "error") return "red" as const;
  if (outcome === "cooldown") return "amber" as const;
  return "slate" as const;
}

function predicateValueField(
  predicate: ProjectNotificationPredicate,
  index: number,
  disabled: boolean,
  onChange: (predicate: ProjectNotificationPredicate) => void,
): FormSurfaceFieldSpec {
  const state = disabled || predicate.op === "present" ? "disabled" as const : "normal" as const;
  const kind = projectNotificationPathKind(predicate.path);
  const base = {
    key: `condition-value-${index}`,
    label: predicate.op === "withinNextDays" || predicate.op === "daysOverdue" ? "天数" : "比较值",
    value: projectNotificationPredicateInputValue(predicate),
    onChange: (value: unknown) => onChange(updateProjectNotificationPredicate(predicate, { rawValue: value })),
  };
  if ((predicate.op === "eq" || predicate.op === "neq" || predicate.op === "in" || predicate.op === "notIn") && kind === "status") {
    return {
      ...base,
      spec: {
        valueType: predicate.op === "in" || predicate.op === "notIn" ? "array" : "string",
        control: "choice",
        multiple: predicate.op === "in" || predicate.op === "notIn",
        state,
        options: { source: "static", items: [{ value: "pending", label: "未开始" }, { value: "active", label: "进行中" }, { value: "done", label: "已完成" }] },
      },
      value: "value" in predicate ? predicate.value : "",
    };
  }
  if ((predicate.op === "eq" || predicate.op === "neq" || predicate.op === "in" || predicate.op === "notIn") && kind === "level") {
    return {
      ...base,
      spec: {
        valueType: predicate.op === "in" || predicate.op === "notIn" ? "array" : "string",
        control: "choice",
        multiple: predicate.op === "in" || predicate.op === "notIn",
        state,
        options: { source: "static", items: [{ value: "普通", label: "普通" }, { value: "重点", label: "重点" }, { value: "特殊", label: "特殊" }] },
      },
      value: "value" in predicate ? predicate.value : "",
    };
  }
  if ((predicate.op === "eq" || predicate.op === "neq") && kind === "boolean") {
    return {
      ...base,
      spec: {
        valueType: "boolean",
        control: "choice",
        state,
        options: { source: "static", items: [{ value: "true", label: "是" }, { value: "false", label: "否" }] },
      },
      value: "value" in predicate ? String(predicate.value) : "true",
    };
  }
  const numberInput = (
    kind === "number"
    && predicate.op !== "in"
    && predicate.op !== "notIn"
  ) || predicate.op === "withinNextDays" || predicate.op === "daysOverdue";
  return {
    ...base,
    placeholder: predicate.op === "in" || predicate.op === "notIn" ? "多个值用逗号分隔" : undefined,
    spec: numberInput
      ? { valueType: "number", control: "number", state, validation: { min: predicate.op === "withinNextDays" || predicate.op === "daysOverdue" ? 0 : undefined } }
      : { valueType: "string", control: "text", state },
  };
}
