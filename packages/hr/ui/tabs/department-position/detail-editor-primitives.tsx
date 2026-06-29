"use client";

import type { ReactNode } from "react";
import {
  createPageBody,
  InputControl,
  PageSurface,
  createPageDataSection,
  createInlineFieldsSection,
} from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import { primitiveListItems } from "./description-details";

export { OptionTagListEditor } from "./option-tag-list-editor";

export function sectionTitle(title: string, extra?: ReactNode) {
  return (
    <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-200 pb-2">
      <span className="min-w-0 text-base font-semibold text-slate-900">{title}</span>
      {extra ? <div className="flex shrink-0 flex-wrap items-center gap-2">{extra}</div> : null}
    </div>
  );
}

export function DetailSectionHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-200 pb-3">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {meta}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DetailStatsRow({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createPageDataSection("detail-stats", {
        kind: "metrics",
        framed: true,


        metrics: items.map((item) => ({ key: item.label, label: item.label, value: item.value })),
      })])}
    />
  );
}

export function selectedEntityName(entity: string, option?: ReferenceOption) {
  if (!option) return "";
  if (entity === "department") {
    return option.name.split(" / ").pop()?.trim() || option.name;
  }
  return option.name;
}

export function EntityValueInput({
  label,
  entity,
  value,
  disabled,
  onChange,
  invalid,
}: {
  label: string;
  entity: string;
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  invalid?: boolean;
}) {
  const current = String(value || "");
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <InputControl
        spec={{
          valueType: "reference",
          control: "reference",
          state: disabled ? "disabled" : "normal",
          options: { source: "remote", fkKey: fkKeyForEntity(entity), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "name" },
        }}
        value={current}
        displayValue={current}
        placeholder={`搜索${label}`}
        onChange={(_label, option) => onChange(selectedEntityName(entity, option as ReferenceOption | undefined) || null)}
      />
      {invalid ? <span className="text-xs text-red-600">当前值不是有效引用，请重新选择。</span> : null}
    </div>
  );
}

export function StringListEditor({
  label,
  value,
  disabled,
  onChange,
  placeholder = "新增条目",
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const items = primitiveListItems(value);

  function appendItems(values: string[]) {
    const nextItems = values.flatMap(primitiveListItems);
    if (nextItems.length === 0) {
      return;
    }
    onChange([...items, ...nextItems].filter((item, index, array) => array.indexOf(item) === index));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <PageSurface kind="standard"
        embedded
        body={createPageBody([createInlineFieldsSection<string>("items", [{
          kind: "tagList",
          key: "items",
          label: "",
          items,
          getKey: (item, index) => `${item}-${index}`,
          getLabel: (item) => item,
          onRemove: (_, index) => removeItem(index),
          disabled,
          confirmMessage: (item) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
          emptyText: disabled ? "未设置" : undefined,
          itemClassName: () => "h-auto min-h-6 items-start rounded-xl py-1 leading-snug",
          shellClassName: "content-start",
          append: disabled ? undefined : {
            textInput: {
              key: "draft",
              placeholder: items.length === 0 ? placeholder : "",
              onAppend: appendItems,
              onRemoveLast: () => {
                if (items.length > 0) removeItem(items.length - 1);
              },
            },
          },
        }])])}
      />
    </div>
  );
}
