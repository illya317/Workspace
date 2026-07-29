import type { FormSurfaceItemSpec } from "@workspace/core/ui";
import {
  BUSINESS_CODE_FIELDS,
  businessCodeFieldDefinition,
  type BusinessCodeFieldTransform,
  type BusinessCodeTemplateRule,
  type BusinessCodeTemplateSegment,
  type BusinessCodeTemplateSettings,
} from "@workspace/platform/business-code-registry";
import {
  businessCodeTemplateExample,
  parseBusinessCodeTemplateSettings,
  renderBusinessCodeTemplateRule,
} from "@workspace/platform/business-code-template";
import { readOnlyBusinessCodeEditorItems } from "./BusinessCodeTemplateEditorReadOnly";
export type BusinessCodeTemplateDraft = {
  key?: string;
  name: string;
  settings: BusinessCodeTemplateSettings;
};

function newRule(index = 0): BusinessCodeTemplateRule {
  return {
    key: `rule-${Date.now()}-${index + 1}`,
    name: index === 0 ? "默认规则" : `规则 ${index + 1}`,
    priority: Math.max(1, 1000 - (index * 100)),
    conditions: [],
    segments: [],
  };
}

export function emptyBusinessCodeTemplateDraft(): BusinessCodeTemplateDraft {
  return { name: "", settings: { version: 2, rules: [newRule()] } };
}

export function businessCodeTemplateDraftError(draft: BusinessCodeTemplateDraft) {
  if (!draft.name.trim()) return "模板名称不能为空";
  try {
    parseBusinessCodeTemplateSettings(draft.settings);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "模板规则无效";
  }
}

type EditorInput = {
  draft: BusinessCodeTemplateDraft;
  onChange: (draft: BusinessCodeTemplateDraft) => void;
  readOnly?: boolean;
};

const numberSpec = (min: number, max: number) => ({
  valueType: "number" as const,
  control: "number" as const,
  validation: { min, max },
});
const textSpec = { valueType: "string" as const, control: "text" as const };

function choiceSpec(items: Array<{ value: string; label: string; disabled?: boolean }>) {
  return {
    valueType: "string" as const,
    control: "choice" as const,
    options: { source: "static" as const, items, visibleCount: Math.min(items.length, 12) },
  };
}

const CONDITION_FIELDS = BUSINESS_CODE_FIELDS.filter((field) => field.conditionOptions);
const CONTENT_FIELDS = BUSINESS_CODE_FIELDS.filter((field) => !field.conditionOptions);
const TEMPORAL_FIELDS = CONTENT_FIELDS.filter((field) => field.valueKind === "date" || field.valueKind === "datetime");
const SCOPE_FIELDS = BUSINESS_CODE_FIELDS.filter((field) => field.scopeEligible);

const TRANSFORM_LABELS: Record<BusinessCodeFieldTransform["kind"], string> = {
  none: "原值",
  uppercaseLetters: "大写字母",
  uppercaseAlphanumeric: "大写字母或数字",
  compactText: "去空格文本",
  integer: "正整数",
  padInteger: "整数补零",
};

function normalizeRuleOrder(rules: BusinessCodeTemplateRule[]) {
  return rules.map((rule, index) => ({ ...rule, priority: (rules.length - index) * 100 }));
}

function updateRule(input: EditorInput, ruleKey: string, update: (rule: BusinessCodeTemplateRule) => BusinessCodeTemplateRule) {
  input.onChange({
    ...input.draft,
    settings: {
      ...input.draft.settings,
      rules: input.draft.settings.rules.map((rule) => rule.key === ruleKey ? update(rule) : rule),
    },
  });
}

function segmentForKind(kind: BusinessCodeTemplateSegment["kind"]): BusinessCodeTemplateSegment {
  if (kind === "literal") return { kind, value: "-" };
  if (kind === "field") return { kind, field: "companyCode", transform: { kind: "none" } };
  if (kind === "sequence") return { kind, length: 5 };
  return { kind, field: "createdAt", format: kind === "datetime" ? "YYMMDDHHmmss" : "YYMMDD" };
}

function conditionItems(input: EditorInput, rule: BusinessCodeTemplateRule): FormSurfaceItemSpec {
  const usedFields = new Set(rule.conditions.map((condition) => condition.field));
  return {
    kind: "repeatable",
    key: `${rule.key}-conditions`,
    title: "适用条件",
    subtitle: "同一分支内的条件必须同时满足；不配置表示默认规则。",
    layout: { columns: 2, density: "compact" },
    empty: "默认匹配",
    addAction: usedFields.size >= CONDITION_FIELDS.length ? undefined : {
      key: `${rule.key}-add-condition`,
      label: "添加条件",
      icon: "add",
      onClick: () => {
        const definition = CONDITION_FIELDS.find((field) => !usedFields.has(field.key));
        const option = definition?.conditionOptions?.[0];
        if (!definition || !option) return;
        updateRule(input, rule.key, (current) => ({
          ...current,
          conditions: [...current.conditions, { field: definition.key, operator: "equals", value: option.value }],
        }));
      },
    },
    items: rule.conditions.map((condition, index) => {
      const definition = businessCodeFieldDefinition(condition.field);
      return {
        key: `${rule.key}-condition-${index}`,
        title: `条件 ${index + 1}`,
        actions: [{
          key: `${rule.key}-delete-condition-${index}`,
          label: "删除",
          icon: "delete",
          presentation: "icon",
          size: "sm",
          variant: "danger",
          onClick: () => updateRule(input, rule.key, (current) => ({
            ...current,
            conditions: current.conditions.filter((_, itemIndex) => itemIndex !== index),
          })),
        }],
        items: [
          {
            key: `${rule.key}-condition-field-${index}`,
            label: "条件字段",
            spec: choiceSpec(CONDITION_FIELDS.map((field) => ({
              value: field.key,
              label: field.label,
              disabled: usedFields.has(field.key) && field.key !== condition.field,
            }))),
            value: condition.field,
            onChange: (value) => {
              const field = String(value ?? "");
              const first = businessCodeFieldDefinition(field)?.conditionOptions?.[0];
              if (!first) return;
              updateRule(input, rule.key, (current) => ({
                ...current,
                conditions: current.conditions.map((item, itemIndex) => itemIndex === index
                  ? { field, operator: "equals", value: first.value }
                  : item),
              }));
            },
          },
          {
            key: `${rule.key}-condition-value-${index}`,
            label: "等于",
            spec: choiceSpec((definition?.conditionOptions ?? []).map((option) => ({ ...option }))),
            value: condition.value,
            onChange: (value) => updateRule(input, rule.key, (current) => ({
              ...current,
              conditions: current.conditions.map((item, itemIndex) => itemIndex === index
                ? { ...item, value: String(value ?? "") }
                : item),
            })),
          },
        ],
      };
    }),
  };
}

function transformItems(
  input: EditorInput,
  rule: BusinessCodeTemplateRule,
  segment: Extract<BusinessCodeTemplateSegment, { kind: "field" }>,
  segmentIndex: number,
): FormSurfaceItemSpec[] {
  const transforms = businessCodeFieldDefinition(segment.field)?.transforms ?? ["none"];
  if (transforms.length <= 1) return [];
  const selected = segment.transform?.kind ?? "none";
  const items: FormSurfaceItemSpec[] = [{
    key: `${rule.key}-segment-transform-${segmentIndex}`,
    label: "安全转换",
    spec: choiceSpec(transforms.map((kind) => ({ value: kind, label: TRANSFORM_LABELS[kind] }))),
    value: selected,
    onChange: (value) => {
      const kind = String(value) as BusinessCodeFieldTransform["kind"];
      const transform: BusinessCodeFieldTransform = kind === "none" ? { kind } : { kind, length: 3 };
      updateRule(input, rule.key, (current) => ({
        ...current,
        segments: current.segments.map((item, itemIndex) => itemIndex === segmentIndex
          ? { ...segment, transform }
          : item),
      }));
    },
  }];
  if (selected !== "none") {
    items.push({
      key: `${rule.key}-segment-transform-length-${segmentIndex}`,
      label: selected === "integer" ? "最大位数" : "位数",
      spec: numberSpec(1, 12),
      value: segment.transform && segment.transform.kind !== "none" ? segment.transform.length : 3,
      onChange: (value) => updateRule(input, rule.key, (current) => ({
        ...current,
        segments: current.segments.map((item, itemIndex) => itemIndex === segmentIndex
          ? { ...segment, transform: { kind: selected, length: Number(value) } as BusinessCodeFieldTransform }
          : item),
      })),
    });
  }
  return items;
}

function segmentItems(input: EditorInput, rule: BusinessCodeTemplateRule): FormSurfaceItemSpec {
  const hasSequence = rule.segments.some((segment) => segment.kind === "sequence");
  return {
    kind: "repeatable",
    key: `${rule.key}-segments`,
    title: "编码组成",
    subtitle: "按顺序拼接。业务字段的真实值由后端登记的编码对象提供。",
    layout: { columns: 3, density: "compact" },
    empty: "还没有组成部分",
    addAction: {
      key: `${rule.key}-add-segment`,
      label: "添加组成部分",
      icon: "add",
      onClick: () => updateRule(input, rule.key, (current) => ({
        ...current,
        segments: [...current.segments, { kind: "literal", value: "-" }],
      })),
    },
    items: rule.segments.map((segment, index) => {
      const move = (offset: number) => updateRule(input, rule.key, (current) => {
        const target = index + offset;
        if (target < 0 || target >= current.segments.length) return current;
        const segments = [...current.segments];
        [segments[index], segments[target]] = [segments[target]!, segments[index]!];
        return { ...current, segments };
      });
      const replace = (next: BusinessCodeTemplateSegment) => updateRule(input, rule.key, (current) => ({
        ...current,
        segments: current.segments.map((item, itemIndex) => itemIndex === index ? next : item),
        ...(next.kind === "sequence" && !current.sequence ? { sequence: { start: 1, scope: [] } } : {}),
      }));
      const items: FormSurfaceItemSpec[] = [{
        key: `${rule.key}-segment-kind-${index}`,
        label: "组成类型",
        spec: choiceSpec([
          { value: "literal", label: "固定文本" },
          { value: "field", label: "业务字段" },
          { value: "date", label: "日期" },
          { value: "datetime", label: "完整时间" },
          { value: "sequence", label: "流水号", disabled: hasSequence && segment.kind !== "sequence" },
        ]),
        value: segment.kind,
        onChange: (value) => replace(segmentForKind(String(value) as BusinessCodeTemplateSegment["kind"])),
      }];
      if (segment.kind === "literal") {
        items.push({
          key: `${rule.key}-segment-value-${index}`,
          label: "内容",
          spec: textSpec,
          value: segment.value,
          onChange: (value) => replace({ ...segment, value: String(value ?? "") }),
        });
      } else if (segment.kind === "field") {
        items.push({
          key: `${rule.key}-segment-field-${index}`,
          label: "业务字段",
          spec: choiceSpec(CONTENT_FIELDS.map((field) => ({ value: field.key, label: field.label }))),
          value: segment.field,
          onChange: (value) => replace({ kind: "field", field: String(value), transform: { kind: "none" } }),
        }, ...transformItems(input, rule, segment, index));
      } else if (segment.kind === "date" || segment.kind === "datetime") {
        const formats = segment.kind === "datetime"
          ? ["YYYYMMDDHHmm", "YYMMDDHHmm", "YYYYMMDDHHmmss", "YYMMDDHHmmss", "YYYY-MM-DD-HH-mm-ss"]
          : ["YYYY", "YY", "YYYYMM", "YYMM", "YYYYMMM", "YYMMM", "YYYYMMDD", "YYMMDD", "YYYY-MM-DD", "YY-MM-DD"];
        items.push(
          {
            key: `${rule.key}-segment-date-field-${index}`,
            label: "日期字段",
            spec: choiceSpec(TEMPORAL_FIELDS.map((field) => ({ value: field.key, label: field.label }))),
            value: segment.field,
            onChange: (value) => replace({ ...segment, field: String(value) }),
          },
          {
            key: `${rule.key}-segment-date-format-${index}`,
            label: "格式",
            spec: choiceSpec(formats.map((format) => ({ value: format, label: format }))),
            value: segment.format,
            onChange: (value) => replace({ ...segment, format: String(value) }),
          },
        );
      } else {
        items.push({
          key: `${rule.key}-segment-sequence-length-${index}`,
          label: "流水位数",
          spec: numberSpec(1, 12),
          value: segment.length,
          onChange: (value) => replace({ ...segment, length: Number(value) }),
        });
      }
      return {
        key: `${rule.key}-segment-${index}`,
        title: `第 ${index + 1} 段`,
        actions: [
          { key: `${rule.key}-segment-up-${index}`, label: "上移", icon: "move-up", presentation: "icon", size: "sm", disabled: index === 0, onClick: () => move(-1) },
          { key: `${rule.key}-segment-down-${index}`, label: "下移", icon: "move-down", presentation: "icon", size: "sm", disabled: index === rule.segments.length - 1, onClick: () => move(1) },
          {
            key: `${rule.key}-segment-delete-${index}`,
            label: "删除",
            icon: "delete",
            presentation: "icon",
            size: "sm",
            variant: "danger",
            onClick: () => updateRule(input, rule.key, (current) => {
              const segments = current.segments.filter((_, itemIndex) => itemIndex !== index);
              return { ...current, segments, ...(segment.kind === "sequence" ? { sequence: undefined } : {}) };
            }),
          },
        ],
        items,
      };
    }),
  };
}

function sequenceItems(input: EditorInput, rule: BusinessCodeTemplateRule): FormSurfaceItemSpec[] {
  if (!rule.segments.some((segment) => segment.kind === "sequence") || !rule.sequence) return [];
  return [{
    kind: "section",
    key: `${rule.key}-sequence-settings`,
    title: "流水设置",
    subtitle: "作用域决定流水在哪些业务范围内独立计数，不要求这些字段显示在编号中。",
    layout: { columns: 3, density: "compact" },
    items: [
      {
        key: `${rule.key}-sequence-start`,
        label: "起始值",
        spec: numberSpec(1, 999_999_999),
        value: rule.sequence.start,
        onChange: (value) => updateRule(input, rule.key, (current) => ({
          ...current,
          sequence: current.sequence ? { ...current.sequence, start: Number(value) } : undefined,
        })),
      },
      {
        key: `${rule.key}-sequence-end`,
        label: "结束值（可选）",
        spec: numberSpec(1, 999_999_999),
        value: rule.sequence.end ?? "",
        onChange: (value) => updateRule(input, rule.key, (current) => ({
          ...current,
          sequence: current.sequence ? {
            ...current.sequence,
            ...(value === "" || value === null || value === undefined ? { end: undefined } : { end: Number(value) }),
          } : undefined,
        })),
      },
      {
        kind: "repeatable",
        key: `${rule.key}-sequence-scope`,
        title: "流水作用域",
        empty: "全局共用一组流水",
        layout: { columns: 1, density: "compact" },
        addAction: rule.sequence.scope.length >= SCOPE_FIELDS.length ? undefined : {
          key: `${rule.key}-add-scope`,
          label: "添加作用域",
          icon: "add",
          onClick: () => {
            const field = SCOPE_FIELDS.find((item) => !rule.sequence?.scope.includes(item.key));
            if (!field) return;
            updateRule(input, rule.key, (current) => ({
              ...current,
              sequence: current.sequence ? { ...current.sequence, scope: [...current.sequence.scope, field.key] } : undefined,
            }));
          },
        },
        items: rule.sequence.scope.map((field, index) => ({
          key: `${rule.key}-scope-${index}`,
          title: `作用域 ${index + 1}`,
          actions: [{
            key: `${rule.key}-delete-scope-${index}`,
            label: "删除",
            icon: "delete",
            presentation: "icon",
            size: "sm",
            variant: "danger",
            onClick: () => updateRule(input, rule.key, (current) => ({
              ...current,
              sequence: current.sequence ? { ...current.sequence, scope: current.sequence.scope.filter((_, itemIndex) => itemIndex !== index) } : undefined,
            })),
          }],
          items: [{
            key: `${rule.key}-scope-field-${index}`,
            label: "业务字段",
            spec: choiceSpec(SCOPE_FIELDS.map((item) => ({
              value: item.key,
              label: item.label,
              disabled: rule.sequence?.scope.includes(item.key) && item.key !== field,
            }))),
            value: field,
            onChange: (value) => updateRule(input, rule.key, (current) => ({
              ...current,
              sequence: current.sequence ? {
                ...current.sequence,
                scope: current.sequence.scope.map((item, itemIndex) => itemIndex === index ? String(value) : item),
              } : undefined,
            })),
          }],
        })),
      },
    ],
  }];
}

function ruleItems(input: EditorInput): FormSurfaceItemSpec {
  return {
    kind: "repeatable",
    key: "template-rules",
    title: "规则分支",
    subtitle: "系统按从上到下的优先级匹配第一条满足条件的规则。",
    layout: { columns: 1, density: "compact" },
    addAction: input.draft.settings.rules.length >= 8 ? undefined : {
      key: "add-template-rule",
      label: "添加规则分支",
      icon: "add",
      onClick: () => input.onChange({
        ...input.draft,
        settings: {
          ...input.draft.settings,
          rules: normalizeRuleOrder([...input.draft.settings.rules, newRule(input.draft.settings.rules.length)]),
        },
      }),
    },
    items: input.draft.settings.rules.map((rule, index) => {
      let branchExample = "—";
      try {
        branchExample = renderBusinessCodeTemplateRule(rule);
      } catch {
        // The template validation message remains the source of actionable draft feedback.
      }
      const conditionSummary = rule.conditions.length
        ? rule.conditions.map((condition) => {
            const definition = businessCodeFieldDefinition(condition.field);
            const value = definition?.conditionOptions?.find((option) => option.value === condition.value)?.label;
            return `${definition?.label ?? condition.field} = ${value ?? condition.value}`;
          }).join("，")
        : "默认匹配";
      const move = (offset: number) => {
        const target = index + offset;
        if (target < 0 || target >= input.draft.settings.rules.length) return;
        const rules = [...input.draft.settings.rules];
        [rules[index], rules[target]] = [rules[target]!, rules[index]!];
        input.onChange({ ...input.draft, settings: { ...input.draft.settings, rules: normalizeRuleOrder(rules) } });
      };
      return {
        key: rule.key,
        title: `${index + 1}. ${rule.name}`,
        subtitle: `${conditionSummary} · 完整示例 ${branchExample}`,
        actions: [
          { key: `${rule.key}-up`, label: "上移", icon: "move-up", presentation: "icon", size: "sm", disabled: index === 0, onClick: () => move(-1) },
          { key: `${rule.key}-down`, label: "下移", icon: "move-down", presentation: "icon", size: "sm", disabled: index === input.draft.settings.rules.length - 1, onClick: () => move(1) },
          {
            key: `${rule.key}-delete`,
            label: "删除",
            icon: "delete",
            presentation: "icon",
            size: "sm",
            variant: "danger",
            disabled: input.draft.settings.rules.length === 1,
            onClick: () => input.onChange({
              ...input.draft,
              settings: {
                ...input.draft.settings,
                rules: normalizeRuleOrder(input.draft.settings.rules.filter((item) => item.key !== rule.key)),
              },
            }),
          },
        ],
        items: [
          {
            kind: "readonly",
            key: `${rule.key}-complete-example`,
            label: "完整示例",
            value: branchExample,
          },
          {
            key: `${rule.key}-name`,
            label: "规则名称",
            spec: textSpec,
            value: rule.name,
            onChange: (value) => updateRule(input, rule.key, (current) => ({ ...current, name: String(value ?? "") })),
          },
          conditionItems(input, rule),
          segmentItems(input, rule),
          ...sequenceItems(input, rule),
        ],
      };
    }),
  };
}

export function businessCodeTemplateEditorItems(input: EditorInput): FormSurfaceItemSpec[] {
  let preview = "—";
  try {
    preview = businessCodeTemplateExample(input.draft.settings);
  } catch {
    // Draft validation below provides the actionable message while the user is composing a rule.
  }
  const items: FormSurfaceItemSpec[] = [
    {
      key: "template-name",
      label: "模板名称",
      spec: textSpec,
      value: input.draft.name,
      onChange: (value) => input.onChange({ ...input.draft, name: String(value ?? "") }),
    },
    {
      kind: "readonly",
      key: "template-preview",
      label: "模板样例",
      value: preview,
      error: businessCodeTemplateDraftError(input.draft),
    },
    ruleItems(input),
  ];
  return input.readOnly ? readOnlyBusinessCodeEditorItems(items) : items;
}
