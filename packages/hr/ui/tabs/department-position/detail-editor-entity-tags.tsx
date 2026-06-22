"use client";

import { FkFieldInput, RemovableTag, getTagInputShellClassName } from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../../fk-keys";
import { primitiveListItems } from "./description-details";
import { selectedEntityName } from "./detail-editor-primitives";

const tagInputShellClassName = getTagInputShellClassName("content-start");

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

  function addOption(option?: FkFieldOption) {
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
      <div className={tagInputShellClassName}>
        {items.map((item, index) => {
          const matched = !validNames || validNames.has(item);
          return (
            <RemovableTag
              key={`${item}-${index}`}
              title={matched ? undefined : "当前主数据中未找到对应记录"}
              label={`删除${label} ${item}`}
              confirmMessage={`确定删除「${items[index] || label}」吗？删除后需要保存才会生效。`}
              disabled={disabled}
              onRemove={() => removeItem(index)}
              className={`max-w-full text-xs ${
                matched ? "border-slate-300 bg-white text-slate-800" : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {item}
            </RemovableTag>
          );
        })}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <FkFieldInput
              fkKey={fkKeyForEntity(entity)}
              endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
              value=""
              displayValue=""
              disabled={disabled}
              placeholder={items.length === 0 ? placeholder || `搜索${label}` : `添加${label}`}
              onChange={(_label, option?: FkFieldOption) => addOption(option)}
            />
          </div>
        )}
      </div>
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
      <div className={tagInputShellClassName}>
        {items.map((item, index) => (
          <RemovableTag
            key={`${item}-${index}`}
            label={`下属岗位 ${item}`}
            disabled
            className="max-w-full border-slate-300 bg-white text-xs text-slate-800"
          >
            {item}
          </RemovableTag>
        ))}
        {items.length === 0 ? <span className="text-slate-400">未设置</span> : null}
      </div>
    </div>
  );
}
