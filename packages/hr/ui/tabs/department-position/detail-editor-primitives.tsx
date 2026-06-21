"use client";

import { useState, type ReactNode } from "react";
import {
  ActionToolbar,
  FkFieldInput,
  FormField,
  OptionPicker,
  PanelCard,
  TextField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  getTagInputShellClassName,
  getTagPillClassName,
  useConfirmDelete,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { fkKeyForEntity } from "../../fk-keys";
import { pickerOptions, primitiveListItems } from "./description-details";

export const formInputClassName = getFieldInputClassName();
export const compactFormInputClassName = getFieldInputClassName("h-10 py-0");
export const readOnlyInputClassName = getReadOnlyFieldClassName("h-10 py-0");
export const compactReadOnlyInputClassName = getReadOnlyFieldClassName();
const tagInputShellClassName = getTagInputShellClassName("content-start");
const tagPillClassName = getTagPillClassName();
const longTextTagPillClassName = getTagPillClassName(
  "h-auto min-h-6 items-start rounded-xl py-1 leading-snug"
);

function InlineTagRemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-sky-200 bg-sky-50 text-[12px] font-semibold leading-none text-sky-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
    >
      −
    </button>
  );
}

export function sectionTitle(title: string, extra?: ReactNode) {
  return (
    <ActionToolbar
      leftSlot={title}
      rightSlot={extra}
      className="mb-3 border-0 border-b border-slate-200 p-0 pb-2 shadow-none"
    />
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DetailStatsRow({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <PanelCard className="md:col-span-2" bodyClassName="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="inline-flex items-baseline gap-2">
            <span className="text-xs font-medium text-slate-500">{item.label}</span>
            <span className="text-sm font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

export function selectedEntityName(entity: string, option?: FkFieldOption) {
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
    <FormField
      label={label}
      error={invalid ? "当前值不是有效引用，请重新选择。" : undefined}
    >
      <FkFieldInput
        fkKey={fkKeyForEntity(entity)}
        value={current}
        displayValue={current}
        disabled={disabled}
        placeholder={`搜索${label}`}
        onChange={(_label, option?: FkFieldOption) => onChange(selectedEntityName(entity, option) || null)}
      />
    </FormField>
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
  const confirmDelete = useConfirmDelete();
  const [draft, setDraft] = useState("");
  const items = primitiveListItems(value);

  function commitDraft() {
    const nextItems = primitiveListItems(draft);
    if (nextItems.length === 0) return;
    onChange([...items, ...nextItems].filter((item, index, array) => array.indexOf(item) === index));
    setDraft("");
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
          <span
            key={`${item}-${index}`}
            className={longTextTagPillClassName}
          >
            <span className="min-w-0 whitespace-normal break-words leading-snug">{item}</span>
            {!disabled && (
              <InlineTagRemoveButton
                label={`删除${label} ${item || index + 1}`}
                onClick={() => void removeItem(index)}
              />
            )}
          </span>
        ))}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <TextField
            value={draft}
            onChange={setDraft}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === "，" || event.key === "、") {
                if (draft.trim()) {
                  event.preventDefault();
                  commitDraft();
                }
              }
              if (event.key === "Backspace" && !draft && items.length > 0) {
                void removeItem(items.length - 1);
              }
            }}
            placeholder={items.length === 0 ? placeholder : ""}
            unstyled
            className={`${items.length === 0 ? "min-w-32 flex-1" : "w-6 flex-none"} border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400`}
          />
        )}
      </div>
    </div>
  );
}

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
          <span
            key={`${item}-${index}`}
            className={tagPillClassName}
          >
            <span className="truncate">{item}</span>
            {!disabled && (
              <InlineTagRemoveButton
                label={`删除${label} ${item}`}
                onClick={() => void removeItem(index)}
              />
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
