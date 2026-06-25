"use client";

import { useState, type ReactNode } from "react";
import {
  FkFieldInput,
  FormField,
  PanelCard,
  RemovableTag,
  TextField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  getTagInputShellClassName,
  useConfirmDelete,
} from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import { primitiveListItems } from "./description-details";

export const formInputClassName = getFieldInputClassName();
export const compactFormInputClassName = getFieldInputClassName("h-10 py-0");
export const readOnlyInputClassName = getReadOnlyFieldClassName();
export const compactReadOnlyInputClassName = getReadOnlyFieldClassName();
const tagInputShellClassName = getTagInputShellClassName("content-start");
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
        endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
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
          <RemovableTag
            key={`${item}-${index}`}
            label={`删除${label} ${item || index + 1}`}
            confirmMessage={`确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`}
            disabled={disabled}
            onRemove={() => removeItem(index)}
            className="h-auto min-h-6 items-start rounded-xl py-1 leading-snug"
            textClassName="min-w-0 whitespace-normal break-words leading-snug"
          >
            {item}
          </RemovableTag>
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
