"use client";

import type { Ref } from "react";
import { createPageBody, createEmptySection, createPanelSection, PageSurface, type ConfirmOptions, type FormSurfaceItemSpec, type BodySurfaceSectionSpec, useFeedback } from "@workspace/core/ui";
import { useScrollToAddedItem } from "../../hooks/useScrollToAddedItem";
import { detailFieldRows, detailValueToText, isPrimitiveArray, parseDetailsObject, textToDetailValue } from "./description-details";

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
  fieldClassName?: string;
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
    disabled,
    confirmMessage: (item) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
    emptyText: disabled ? "未设置" : undefined,
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

export function buildDepartmentDescriptionDetailsBlocks({
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
      [key]: nextValue
    }, null, 2));
  }
  function dutyDescriptionBlock(): BodySurfaceSectionSpec {
    const key = dutyKey;
    const records = Array.isArray(parsedDetails[key]) ? parsedDetails[key] as Array<Record<string, unknown>> : [];
    function updateRecord(index: number, patch: Record<string, unknown>) {
      updateDetailValue(key, records.map((record, recordIndex) => recordIndex === index ? {
        ...record,
        ...patch
      } : record));
    }
    function addRecord() {
      requestDutyScrollToIndex?.(records.length);
      updateDetailValue(key, [...records, {
        title: "",
        items: []
      }]);
    }
    async function removeRecord(index: number) {
      const confirmed = await confirmDelete({
        message: `确定删除部门职责 ${index + 1} 吗？删除后需要保存才会生效。`
      });
      if (!confirmed) return;
      updateDetailValue(key, records.filter((_, recordIndex) => recordIndex !== index));
    }
    return createPanelSection("duty-description", {
      title: "部门职责描述",
      chrome: "divider",
      actions: disabled ? undefined : [{ key: "add-duty", label: "新增职责", onClick: addRecord }],

      sections: records.length === 0
        ? [createEmptySection("empty", {
          presentation: "plain",
          content: "未设置",
          compact: true
        })]
        : records.map((record, index) => {
        const items = Array.isArray(record.items) ? record.items : [];
        return createPanelSection(`duty-${index}`, {
          itemRef: getDutyItemRef?.(index),
          title: `职责 ${index + 1}`,
          chrome: "divider",
          actions: disabled ? undefined : [{
            key: "delete-duty",
            label: "删除",
            variant: "danger" as const,
            size: "sm" as const,

            onClick: () => void removeRecord(index),
          }],

          sections: [{
            key: "fields",
            chrome: "plain",
            body: { kind: "form", form: {
              kind: "fields" as const,
              content: {
                layout: { columns: 1 },
                items: [
                {
                  key: "title",
                  label: "职责标题",
                  spec: { valueType: "string" as const, control: "text" as const, state: disabled ? "disabled" as const : "normal" as const },
                  value: String(record.title || ""),
                  placeholder: "职责标题",
                  onChange: (next: unknown) => updateRecord(index, { title: String(next ?? "") }),
                },
                stringListField({
                  key: "items",
                  label: "职责条目",
                  value: items,
                  disabled,
                  placeholder: "新增职责条目",
                  onChange: (nextItems) => updateRecord(index, { items: nextItems }),
                }),
                ],
              },
            } },
          }],
        });
      }),
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
    dutyDescriptionBlock(),
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
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const feedback = useFeedback();
  const dutyRecordsForScroll = departmentDescriptionDutyRecords(value);
  const {
    getItemRef,
    requestScrollToIndex
  } = useScrollToAddedItem(dutyRecordsForScroll);
  const sections = buildDepartmentDescriptionDetailsBlocks({
    value,
    disabled,
    onChange,
    confirmDelete: feedback.confirmDelete,
    getDutyItemRef: getItemRef,
    requestDutyScrollToIndex: requestScrollToIndex,
  });
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}
