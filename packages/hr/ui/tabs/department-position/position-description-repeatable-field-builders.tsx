"use client";

import { type FeedbackApi, type FormSurfaceItemSpec, type FormSurfaceLooseItem } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import {
  DETAIL_FIELD_LABELS,
  ENVIRONMENT_FACTOR_OPTIONS,
  WORK_AREA_OPTIONS,
  pickerOptions,
  primitiveListItems,
} from "./description-details";
import { formatHistoryVersion, normalizeDateValue, versionNumber } from "./draft-utils";

type DetailFeedback = FeedbackApi;
type DetailRecord = Record<string, unknown>;

type DetailFieldContext = {
  disabled?: boolean;
  feedback: DetailFeedback;
  updateDetailValue: (key: string, nextValue: unknown) => void;
};

type WorkEnvironmentItem = {
  area: string;
  factors: string[];
};

type ExperienceRequirementItem = {
  years: string;
  requirement: string;
};

function uniqueStrings(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeWorkEnvironments(value: unknown): WorkEnvironmentItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const area = String(record.area || "").trim();
    if (!area) return null;
    return { area, factors: primitiveListItems(record.factors) };
  }).filter((item): item is WorkEnvironmentItem => Boolean(item));
}

function normalizeExperienceRequirements(value: unknown): ExperienceRequirementItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    return {
      years: String(record.years || "").trim(),
      requirement: String(record.requirement || "").trim(),
    };
  }).filter((item): item is ExperienceRequirementItem => Boolean(item && (item.years || item.requirement)));
}

function positiveIntegerText(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

export function buildDutyField(
  { disabled, feedback, updateDetailValue }: DetailFieldContext,
  detailKey: string,
  label: string,
  records: DetailRecord[],
): FormSurfaceItemSpec<FormSurfaceLooseItem> {
  function updateDuty(index: number, patch: DetailRecord) {
    updateDetailValue(detailKey, records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
  }
  return {
    kind: "repeatable",
    key: detailKey,
    title: label,
    addAction: disabled ? undefined : {
      key: `add-${detailKey}`,
      label: `新增${label}`,
      onClick: () => updateDetailValue(detailKey, [...records, { title: "", items: [] }]),
    },
    empty: "未设置",
    layout: { columns: 1 },
    items: records.map((record, index) => {
      const items = Array.isArray(record.items) ? record.items.map((item) => String(item)) : [];
      return {
        key: `${detailKey}-${index}`,
        title: `职责 ${index + 1}`,
        actions: disabled ? undefined : [{
          key: "delete-duty",
          label: "删除",
          variant: "danger" as const,
          size: "sm" as const,
          onClick: async () => {
            const confirmed = await feedback.confirmDelete({ message: `确定删除「${label} ${index + 1}」吗？删除后需要保存才会生效。` });
            if (confirmed) updateDetailValue(detailKey, records.filter((_, recordIndex) => recordIndex !== index));
          },

        }],
        items: [
          {
            key: "title",
            label: "职责标题",
            spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" },
            value: String(record.title || ""),
            placeholder: "职责标题",
            onChange: next => updateDuty(index, { title: String(next ?? "") }),
          },
          {
            kind: "tagList" as const,
            key: "items",
            label: "职责条目",
            items,
            getKey: (item: string, itemIndex: number) => `${item}-${itemIndex}`,
            getLabel: (item: string) => item,
            onRemove: (_item: string, itemIndex: number) => updateDuty(index, { items: items.filter((__, currentIndex) => currentIndex !== itemIndex) }),
            onUpdateLabel: (_item: string, itemIndex: number, next: string) => updateDuty(index, { items: uniqueStrings(items.map((item, currentIndex) => currentIndex === itemIndex ? next : item)) }),
            disabled,
            confirmMessage: (item: string) => `确定删除「${item || "职责条目"}」吗？删除后需要保存才会生效。`,
            emptyText: disabled ? "未设置" : undefined,
            shellClassName: "content-start",
            append: disabled ? undefined : {
              textInput: {
                key: `${detailKey}-${index}-append`,
                placeholder: "新增职责条目",
                onAppend: (values) => updateDuty(index, { items: uniqueStrings([...items, ...values]) }),
                onRemoveLast: () => updateDuty(index, { items: items.slice(0, -1) }),
              },
            },
          },
        ],
      };
    }),
  };
}

export function buildChangeHistoryField(
  { disabled, feedback, updateDetailValue }: DetailFieldContext,
  records: DetailRecord[],
): FormSurfaceItemSpec<FormSurfaceLooseItem> {
  function updateRecord(index: number, patch: DetailRecord) {
    updateDetailValue("changeHistory", records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
  }
  return {
    kind: "repeatable",
    key: "changeHistory",
    title: "变更历史",
    addAction: disabled ? undefined : {
      key: "add-history",
      label: "新增变更历史",
      onClick: () => {
        const nextVersion = formatHistoryVersion(Math.max(-1, ...records.map(record => versionNumber(record.version))) + 1);
        updateDetailValue("changeHistory", [...records, { version: nextVersion, documentName: "", effectiveDate: "", approver: "" }]);
      },
    },
    empty: "未设置",
    layout: { columns: 2 },
    items: records.map((record, index) => {
      const rawDate = String(record.effectiveDate || "");
      const approver = String(record.approver || "");
      return {
        key: `history-${index}`,
        title: `变更历史 ${index + 1}`,
        actions: disabled ? undefined : [{
          key: "delete-history",
          label: "删除",
          variant: "danger" as const,
          size: "sm" as const,
          onClick: async () => {
            const confirmed = await feedback.confirmDelete({ message: `确定删除变更历史 ${index + 1} 吗？删除后需要保存才会生效。` });
            if (confirmed) updateDetailValue("changeHistory", records.filter((_, recordIndex) => recordIndex !== index));
          },

        }],
        items: [
          { key: "version", label: "版本", spec: { valueType: "string", control: "text", state: "readonly" as const }, value: String(record.version || formatHistoryVersion(index)) },
          { key: "documentName", label: "文件名", spec: { valueType: "string", control: "text", state: disabled ? "disabled" as const : "normal" as const }, value: String(record.documentName || ""), onChange: next => updateRecord(index, { documentName: String(next ?? "") }) },
          { key: "effectiveDate", label: "生效日期", error: rawDate && !normalizeDateValue(rawDate) ? "日期格式错误，请重新选择。" : undefined, spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" as const : "normal" as const }, value: rawDate, onChange: next => updateRecord(index, { effectiveDate: next || "" }) },
          {
            key: "approver",
            label: "批准",
            error: approver.includes("见首页") ? "当前值不是有效引用，请重新选择。" : undefined,
            spec: {
              valueType: "reference",
              control: "reference",
              state: disabled ? "disabled" as const : "normal" as const,
              options: { source: "remote", fkKey: fkKeyForEntity("employee"), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
            },
            value: approver,
            displayValue: approver,
            placeholder: "搜索批准",
            onChange: (next) => updateRecord(index, { approver: next || "" }),
          },
        ],
      };
    }),
  };
}

export function buildWorkEnvironmentFields(
  { disabled, feedback, updateDetailValue }: DetailFieldContext,
  key: string,
  label: string,
  fieldValue: unknown,
): FormSurfaceItemSpec<FormSurfaceLooseItem>[] {
  const items = normalizeWorkEnvironments(fieldValue);
  const usedAreas = new Set(items.map(item => item.area));
  const availableAreas = WORK_AREA_OPTIONS.filter(area => !usedAreas.has(area));
  const updateItem = (index: number, patch: Partial<WorkEnvironmentItem>) => updateDetailValue(key, items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return [
    {
      kind: "repeatable",
      key,
      title: label,
      empty: "未设置",
      layout: { columns: 2 },
      items: items.map((item, index) => {
        const areaOptions = [item.area, ...availableAreas].filter((area, areaIndex, array) => array.indexOf(area) === areaIndex);
        const availableFactors = ENVIRONMENT_FACTOR_OPTIONS.filter((factor) => !item.factors.includes(factor));
        return {
          key: `${item.area}-${index}`,
          actions: disabled ? undefined : [{
            key: "delete-area",
            label: "删除",
            variant: "danger" as const,
            size: "sm" as const,
            onClick: async () => {
              const confirmed = await feedback.confirmDelete({ message: `确定删除工作区域「${item.area || "未设置"}」吗？删除后需要保存才会生效。` });
              if (confirmed) updateDetailValue(key, items.filter((_, itemIndex) => itemIndex !== index));
            },

          }],
          items: [
            {
              key: "area",
              label: "工作区域",
              spec: { valueType: "string", control: "choice", state: disabled ? "disabled" as const : "normal" as const, options: { source: "static", items: pickerOptions(areaOptions), searchPlaceholder: "搜索工作区域" } },
              value: item.area,
              placeholder: "选择工作区域",
              onChange: next => updateItem(index, { area: String(next ?? "") }),
            },
            {
              kind: "tagList" as const,
              key: "factors",
              label: "环境因素",
              items: item.factors,
              getKey: (factor: string, factorIndex: number) => `${factor}-${factorIndex}`,
              getLabel: (factor: string) => factor,
              onRemove: (_factor: string, factorIndex: number) => updateItem(index, { factors: item.factors.filter((__, currentIndex) => currentIndex !== factorIndex) }),
              onUpdateLabel: (_factor: string, factorIndex: number, next: string) => updateItem(index, { factors: uniqueStrings(item.factors.map((factor, currentIndex) => currentIndex === factorIndex ? next : factor)) }),
              disabled,
              confirmDelete: feedback.confirmDelete,
              removeConfirmMessage: (factor: string) => `确定删除「${factor || "环境因素"}」吗？删除后需要保存才会生效。`,
              emptyText: disabled ? "未设置" : undefined,
              shellClassName: "content-start",

              append: disabled ? undefined : {
                field: {
                  key: "appendFactor",
                  label: "",
                  spec: { valueType: "string", control: "choice", state: availableFactors.length === 0 ? "disabled" as const : "normal" as const, options: { source: "static", items: pickerOptions(availableFactors), visibleCount: 6, searchPlaceholder: "搜索环境因素" } },
                  value: "",
                  placeholder: item.factors.length === 0 ? "添加环境因素" : "继续添加",
                  onChange: (next) => {
                    const factor = next == null ? "" : String(next);
                    if (factor) updateItem(index, { factors: uniqueStrings([...item.factors, factor]) });
                  },
                },
              },
            },
          ],
        };
      }),
    },
    ...(!disabled ? [{
      key: `${key}-addArea`,
      label: "新增工作区域",
      spec: { valueType: "string", control: "choice", state: availableAreas.length === 0 ? "disabled" as const : "normal" as const, options: { source: "static", items: pickerOptions(availableAreas), searchPlaceholder: "搜索工作区域" } },
      value: "",
      placeholder: "新增工作区域",
      onChange: (next: unknown) => {
        const area = next == null ? "" : String(next);
        if (area) updateDetailValue(key, [...items, { area, factors: [] }]);
      },

    } satisfies FormSurfaceItemSpec<FormSurfaceLooseItem>] : []),
  ];
}

export function buildExperienceRequirementField(
  { disabled, feedback, updateDetailValue }: DetailFieldContext,
  key: string,
  label: string,
  fieldValue: unknown,
): FormSurfaceItemSpec<FormSurfaceLooseItem> {
  const items = normalizeExperienceRequirements(fieldValue);
  const updateItem = (index: number, patch: Partial<ExperienceRequirementItem>) => updateDetailValue(key, items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return {
    kind: "repeatable",
    key,
    title: label,
    addAction: disabled ? undefined : { key: "add-experience", label: "新增", size: "sm", onClick: () => updateDetailValue(key, [...items, { years: "1", requirement: "" }]),  },
    empty: "未设置",
    layout: { columns: 2 },
    items: items.map((item, index) => ({
      key: `experience-${index}`,
      actions: disabled ? undefined : [{
        key: "delete-experience",
        label: "删除",
        variant: "danger" as const,
        size: "sm" as const,
        onClick: async () => {
          const confirmed = await feedback.confirmDelete({ message: `确定删除「${item.requirement || DETAIL_FIELD_LABELS[key] || key}」吗？删除后需要保存才会生效。` });
          if (confirmed) updateDetailValue(key, items.filter((_, itemIndex) => itemIndex !== index));
        },

      }],
      items: [
        { key: "years", label: "年限（年以上）", spec: { valueType: "number", control: "text", state: disabled ? "disabled" as const : "normal" as const }, value: item.years, inputMode: "numeric" as const, placeholder: "1", onChange: next => updateItem(index, { years: positiveIntegerText(String(next ?? "")) }) },
        { key: "requirement", label: "要求内容", spec: { valueType: "string", control: "text", state: disabled ? "disabled" as const : "normal" as const }, value: item.requirement, placeholder: "经验要求", onChange: next => updateItem(index, { requirement: String(next ?? "") }) },
      ],
    })),
  };
}
