"use client";

import {
  ActionButton,
  OptionPicker,
  getTagInputShellClassName,
  getTagPillClassName,
  useConfirmDelete,
} from "@workspace/core/ui";
import { pickerOptions, primitiveListItems } from "./description-details";

const tagInputShellClassName = getTagInputShellClassName("content-start");
const tagPillClassName = getTagPillClassName();

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
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);
  const availableOptions = options.filter((option) => !items.includes(option));

  function addOption(next: string | null) {
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className={tagPillClassName}>
            <span className="truncate">{item}</span>
            {!disabled && (
              <ActionButton
                aria-label={`删除${label} ${item}`}
                title={`删除${label} ${item}`}
                onClick={() => void removeItem(index)}
                className="ml-0.5 !grid !size-4 shrink-0 !place-items-center rounded-full !border-sky-200 !bg-sky-50 !p-0 text-[12px] !text-sky-700 hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-600"
              >
                −
              </ActionButton>
            )}
          </span>
        ))}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
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
      </div>
    </div>
  );
}
