"use client";

import {
  OptionPicker,
  TagListInput,
} from "@workspace/core/ui";
import { pickerOptions, primitiveListItems } from "./description-details";

export function OptionTagListEditor({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder = "添加选项",
}: {
  label: string;
  value: unknown;
  options: string[];
  disabled?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const items = primitiveListItems(value);
  const availableOptions = options.filter((option) => !items.includes(option));

  function addOption(next: string | null) {
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <TagListInput
        items={items}
        getKey={(item, index) => `${item}-${index}`}
        getLabel={(item) => item}
        onRemove={(_, index) => removeItem(index)}
        disabled={disabled}
        confirmMessage={(item) => `确定删除「${item || label}」吗？删除后需要保存才会生效。`}
        emptyText={disabled ? "未设置" : undefined}
        shellClassName="content-start"
      >
        {!disabled && (
          <div className="min-w-40 flex-1">
            <OptionPicker
              value=""
              options={pickerOptions(availableOptions)}
              disabled={disabled || availableOptions.length === 0}
              placeholder={items.length === 0 ? placeholder : "继续添加"}
              searchPlaceholder={`搜索${label}`}
              visibleCount={6}
              onChange={addOption}
            />
          </div>
        )}
      </TagListInput>
    </div>
  );
}
