"use client";

import { FormSurface } from "@workspace/core/ui";
import type { ReferenceOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import { primitiveListItems } from "./description-details";
import { selectedEntityName } from "./detail-editor-primitives";

export function EntityTagListEditor({
  label,
  value,
  entity,
  disabled,
  onChange,
  validNames,
  placeholder,
}: {
  label: string;
  value: unknown;
  entity: string;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  validNames?: Set<string>;
  placeholder?: string;
}) {
  const items = primitiveListItems(value);

  function addOption(option?: ReferenceOption) {
    const next = selectedEntityName(entity, option);
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <FormSurface<string>
        kind="inline"
        fields={[{
          kind: "tagList",
          key: "entityTags",
          label: "",
          items,
          getKey: (item, index) => `${item}-${index}`,
          getLabel: (item) => item,
          onRemove: (_, index) => removeItem(index),
          disabled,
          confirmMessage: (item) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`,
          itemTitle: (item) => (validNames && !validNames.has(item) ? "当前主数据中未找到对应记录" : undefined),
          itemClassName: (item) =>
            `max-w-full text-xs ${
              validNames && !validNames.has(item)
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-slate-300 bg-white text-slate-800"
            }`,
          emptyText: disabled ? "未设置" : undefined,
          shellClassName: "content-start",
          fieldClassName: "w-full",
          append: disabled
            ? undefined
            : {
                field: {
                  key: "append",
                  label: "",
                  spec: {
                    valueType: "reference",
                    editor: "autocomplete",
                    state: disabled ? "disabled" : "normal",
                    options: { source: "remote", fkKey: fkKeyForEntity(entity), endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
                  },
                  value: "",
                  displayValue: "",
                  placeholder: items.length === 0 ? placeholder || `搜索${label}` : `添加${label}`,
                  onChange: (_label, option) => addOption(option as ReferenceOption | undefined),
                },
              },
        }]}
      />
    </div>
  );
}

export function SubordinateTagsEditor({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <FormSurface<string>
        kind="inline"
        fields={[{
          kind: "tagList",
          key: "subordinates",
          label: "",
          items,
          getKey: (item, index) => `${item}-${index}`,
          getLabel: (item) => item,
          disabled: true,
          emptyText: "未设置",
          itemClassName: () => "max-w-full border-slate-300 bg-white text-xs text-slate-800",
          shellClassName: "content-start",
          fieldClassName: "w-full",
        }]}
      />
    </div>
  );
}
