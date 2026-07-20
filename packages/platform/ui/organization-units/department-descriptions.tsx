"use client";

import type { Ref } from "react";
import { useScrollToIndexedItem } from "@workspace/core/hooks";
import {
  createEmptySection,
  createPageBody,
  createPanelSection,
  BodySurface,
  useFeedback,
  type BodySurfaceSectionSpec,
  type ConfirmOptions,
  type CreateSurfaceSectionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import { responsibilityFieldSpec, responsibilityFrameSectionSpec } from "../responsibility-fields";

export type OrganizationUnitDescriptionDraft = {
  id: number | null;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string;
  details: string;
};

type DepartmentDescriptionsBlockOptions = {
  drafts: OrganizationUnitDescriptionDraft[];
  dirty: boolean;
  canEditDepartment: boolean;
  onUpdateDraft: <K extends keyof OrganizationUnitDescriptionDraft>(index: number, key: K, value: OrganizationUnitDescriptionDraft[K]) => void;
};

export function DepartmentDescriptionsPanel({
  drafts,
  dirty,
  canEditDepartment,
  onUpdateDraft,
}: DepartmentDescriptionsBlockOptions) {
  const section = useDepartmentDescriptionsSection({ drafts, dirty, canEditDepartment, onUpdateDraft });
  return (
    <BodySurface {...createPageBody([section])} />
  );
}

export function useDepartmentDescriptionsSection(options: DepartmentDescriptionsBlockOptions): BodySurfaceSectionSpec {
  const feedback = useFeedback();
  const dutyRecords = options.drafts.flatMap((draft) => departmentDescriptionDutyRecords(draft.details));
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem(dutyRecords.length);
  return createDepartmentDescriptionsSection({
    ...options,
    confirmDelete: feedback.confirmDelete,
    getDutyItemRef: getItemRef,
    requestDutyScrollToIndex: requestScrollToIndex,
  });
}

export function useDepartmentDescriptionCreateSections(options: DepartmentDescriptionsBlockOptions): CreateSurfaceSectionSpec[] {
  const feedback = useFeedback();
  const dutyRecords = options.drafts.flatMap((draft) => departmentDescriptionDutyRecords(draft.details));
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem(dutyRecords.length);
  return options.drafts.flatMap((draft, draftIndex) => {
    const offset = options.drafts
      .slice(0, draftIndex)
      .reduce((total, item) => total + departmentDescriptionDutyRecords(item.details).length, 0);
    return createDepartmentDescriptionFormSections({
      value: draft.details,
      disabled: !options.canEditDepartment,
      onChange: (value) => options.onUpdateDraft(draftIndex, "details", value),
      confirmDelete: feedback.confirmDelete,
      getDutyItemRef: (itemIndex) => getItemRef(offset + itemIndex),
      requestDutyScrollToIndex: (itemIndex) => requestScrollToIndex(offset + itemIndex),
    }).map((section) => ({
      ...section,
      key: `${draft.id ?? `new-${draftIndex}`}-${section.key}`,
      title: section.title ?? (draftIndex === 0 ? undefined : draft.name || `部门说明书 ${draftIndex + 1}`),
    }));
  });
}

function createDepartmentDescriptionFormSections({
  value,
  disabled,
  onChange,
  confirmDelete,
  getDutyItemRef,
  requestDutyScrollToIndex,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  getDutyItemRef?: (index: number) => Ref<HTMLDivElement>;
  requestDutyScrollToIndex?: (index: number) => void;
}): CreateSurfaceSectionSpec[] {
  const details = parseDetailsObject(value);
  if (!details) {
    return [{
      key: "invalid-json",
      items: [{
        key: "invalid-json",
        label: "部门说明书 JSON 格式错误",
        error: "请检查 JSON 内容后重新保存。",
        spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" },
        value,
        rows: 12,
        onChange: (next: unknown) => onChange(String(next ?? "")),
      }],
    }];
  }
  const dutyKey = "部门职责描述";
  const updateDetailValue = (key: string, nextValue: unknown) => onChange(JSON.stringify({ ...details, [key]: nextValue }, null, 2));
  const dutyRecords = Array.isArray(details[dutyKey]) ? details[dutyKey] as Array<Record<string, unknown>> : [];
  const sections: CreateSurfaceSectionSpec[] = [
    {
      key: "summary",
      title: "部门职责概要",
      layout: { columns: 1 },
      items: [stringListField({
        key: "summary",
        label: "部门职责概要",
        value: details["部门职责概要"],
        disabled,
        placeholder: "新增概要",
        onChange: (items) => updateDetailValue("部门职责概要", items),
      })],
    },
    {
      key: "duty-description",
      title: "部门职责描述",
      layout: { columns: 1 },
      items: [responsibilityFieldSpec({
        key: dutyKey,
        title: "部门职责描述",
        records: dutyRecords,
        disabled,
        confirmDelete,
        getItemRef: getDutyItemRef,
        requestScrollToIndex: requestDutyScrollToIndex,
        onChange: (records) => updateDetailValue(dutyKey, records),
      })],
    },
  ];
  const remainingKeys = Object.keys(details).filter((key) => !["基本信息", "部门职责概要", dutyKey].includes(key));
  if (remainingKeys.length > 0) {
    sections.push({
      key: "other-fields",
      title: "其他字段",
      layout: { columns: 2 },
      items: remainingKeys.map((key): FormSurfaceItemSpec<string> => {
        if (isPrimitiveArray(details[key])) {
          return stringListField({ key, label: key, value: details[key], disabled, onChange: (items) => updateDetailValue(key, items) });
        }
        return {
          key,
          label: key,
          spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" },
          value: detailValueToText(details[key]),
          rows: detailFieldRows(details[key]),
          onChange: (next) => updateDetailValue(key, textToDetailValue(details[key], String(next ?? ""))),
        };
      }),
    });
  }
  return sections;
}

function createDepartmentDescriptionsSection({
  drafts,
  dirty,
  canEditDepartment,
  onUpdateDraft,
  confirmDelete,
  getDutyItemRef,
  requestDutyScrollToIndex,
}: DepartmentDescriptionsBlockOptions & {
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  getDutyItemRef?: (index: number) => Ref<HTMLDivElement>;
  requestDutyScrollToIndex?: (index: number) => void;
}): BodySurfaceSectionSpec {
  let dutyOffset = 0;
  const sections: BodySurfaceSectionSpec[] = drafts.length === 0
    ? [createEmptySection("empty", {
      presentation: "plain",
      content: "暂无部门说明书",
    })]
    : drafts.map((draft, index) => {
        const offset = dutyOffset;
        dutyOffset += departmentDescriptionDutyRecords(draft.details).length;
        return createPanelSection(String(draft.id || `new-${index}`), {
          title: draft.name || `部门说明书 ${index + 1}`,
          sections: createDepartmentDescriptionDetailsSections({
            value: draft.details,
            disabled: !canEditDepartment,
            onChange: (value) => onUpdateDraft(index, "details", value),
            confirmDelete,
            getDutyItemRef: getDutyItemRef ? (itemIndex) => getDutyItemRef(offset + itemIndex) : undefined,
            requestDutyScrollToIndex: requestDutyScrollToIndex ? (itemIndex) => requestDutyScrollToIndex(offset + itemIndex) : undefined,
          }),
        });
      });

  return createPanelSection("department-descriptions", {
    title: dirty ? "部门说明书 · 有未保存修改" : "部门说明书",
    sections,
  });
}

function stringListField({
  key,
  label,
  value,
  disabled,
  onChange,
  placeholder = "新增条目",
}: {
  key: string;
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}): FormSurfaceItemSpec<string> {
  const items = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : typeof value === "string"
      ? value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean)
      : [];
  return {
    kind: "tagList",
    key,
    label,
    items,
    getKey: (item, index) => `${item}-${index}`,
    getLabel: (item) => item,
    onRemove: (_, index) => onChange(items.filter((__, itemIndex) => itemIndex !== index)),
    onUpdateLabel: (_, index, next) => onChange([...new Set(items.map((item, itemIndex) => itemIndex === index ? next : item))]),
    disabled,
    removeConfirmMessage: (item) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
    itemClassName: () => "h-auto min-h-6 items-start rounded-xl py-1 leading-snug",
    shellClassName: "content-start",
    append: disabled
      ? undefined
      : {
          textInput: {
            key: `${key}-append`,
            placeholder: items.length === 0 ? placeholder : "",
            onAppend: (values) => onChange([...items, ...values].filter((item, index, array) => array.indexOf(item) === index)),
            onRemoveLast: () => {
              if (items.length > 0) onChange(items.slice(0, -1));
            },
          },
        },
  };
}

export function departmentDescriptionDutyRecords(value: string) {
  const details = parseDetailsObject(value);
  const dutyKey = "部门职责描述";
  return details && Array.isArray(details[dutyKey]) ? details[dutyKey] as Array<Record<string, unknown>> : [];
}

export function createDepartmentDescriptionDetailsSections({
  value,
  disabled,
  onChange,
  confirmDelete,
  getDutyItemRef,
  requestDutyScrollToIndex,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  getDutyItemRef?: (index: number) => Ref<HTMLDivElement>;
  requestDutyScrollToIndex?: (index: number) => void;
}): BodySurfaceSectionSpec[] {
  const details = parseDetailsObject(value);
  const dutyKey = "部门职责描述";
  if (!details) {
    return [{
      key: "invalid-json",
      body: { kind: "form", form: {
        kind: "fields",
        content: { items: [{
          key: "invalid-json",
          label: "部门说明书 JSON 格式错误",
          error: "请检查 JSON 内容后重新保存。",
          spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" },
          value,
          rows: 12,
          onChange: (next: unknown) => onChange(String(next ?? "")),
        }] },
      } },
    }];
  }
  const parsedDetails = details;
  function updateDetailValue(key: string, nextValue: unknown) {
    onChange(JSON.stringify({
      ...parsedDetails,
      [key]: nextValue,
    }, null, 2));
  }
  function createDutyDescriptionSection(): BodySurfaceSectionSpec {
    const key = dutyKey;
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    return responsibilityFrameSectionSpec({
      sectionKey: "duty-description",
      key,
      title: "部门职责描述",
      records,
      disabled,
      confirmDelete,
      getItemRef: getDutyItemRef,
      requestScrollToIndex: requestDutyScrollToIndex,
      onChange: (nextRecords) => updateDetailValue(key, nextRecords),
    });
  }
  const remainingKeys = Object.keys(parsedDetails).filter(key => !["基本信息", "部门职责概要", "部门职责描述"].includes(key));
  const sections: BodySurfaceSectionSpec[] = [
    {
      key: "summary",
      chrome: "plain",
      body: { kind: "form", form: {
        kind: "fields",
        content: {
          layout: { columns: 1 },
          items: [
          stringListField({
            key: "summary",
            label: "部门职责概要",
            value: parsedDetails["部门职责概要"],
            disabled,
            placeholder: "新增概要",
            onChange: (items: string[]) => updateDetailValue("部门职责概要", items),
          }),
          ],
        },
      } },
    },
    createDutyDescriptionSection(),
  ];
  if (remainingKeys.length > 0) {
    sections.push(createPanelSection("other-fields", {
      title: "其他字段",
      chrome: "divider",
      sections: [{
        key: "fields",
        chrome: "plain",
        body: { kind: "form", form: {
          kind: "fields",
          content: {
            layout: { columns: 2 },
            items: remainingKeys.map((key): FormSurfaceItemSpec<string> => {
            if (isPrimitiveArray(parsedDetails[key])) {
              return stringListField({
                key,
                label: key,
                value: parsedDetails[key],
                disabled,
                onChange: (items) => updateDetailValue(key, items),
              });
            }
            return {
              key,
              label: key,
              spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" },
              value: detailValueToText(parsedDetails[key]),
              rows: detailFieldRows(parsedDetails[key]),
              onChange: (next) => updateDetailValue(key, textToDetailValue(parsedDetails[key], String(next ?? ""))),
            };
            }),
          },
        } },
      }],
    }));
  }
  return sections;
}

export function DepartmentDescriptionDetailsEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const feedback = useFeedback();
  const dutyRecordsForScroll = departmentDescriptionDutyRecords(value);
  const { getItemRef, requestScrollToIndex } = useScrollToIndexedItem(dutyRecordsForScroll.length);
  const sections = createDepartmentDescriptionDetailsSections({
    value,
    disabled,
    onChange,
    confirmDelete: feedback.confirmDelete,
    getDutyItemRef: getItemRef,
    requestDutyScrollToIndex: requestScrollToIndex,
  });
  return <BodySurface {...createPageBody(sections)} />;
}

function parseDetailsObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isPrimitiveArray(value: unknown): value is Array<string | number | boolean | null> {
  return Array.isArray(value) && value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
}

function detailValueToText(value: unknown) {
  if (isPrimitiveArray(value)) return value.map((item) => item === null ? "" : String(item)).join("\n");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? "" : String(value);
}

function textToDetailValue(previousValue: unknown, raw: string) {
  if (isPrimitiveArray(previousValue)) return raw.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (typeof previousValue === "number") {
    const next = Number(raw);
    return Number.isFinite(next) ? next : raw;
  }
  if (typeof previousValue === "boolean") return raw === "true" || raw === "是";
  if (previousValue && typeof previousValue === "object") {
    try {
      return JSON.parse(raw || "null");
    } catch {
      return raw;
    }
  }
  return raw;
}

function detailFieldRows(value: unknown) {
  if (value && typeof value === "object" && !isPrimitiveArray(value)) return 8;
  if (isPrimitiveArray(value)) return Math.min(6, Math.max(3, value.length));
  const length = String(value || "").length;
  return length > 60 ? 3 : 1;
}
