"use client";

import { FkFieldInput, useConfirmDelete } from "@workspace/core/ui";
import type { FkFieldOption } from "@workspace/core/ui";
import { fkKeyForEntity } from "../../fk-keys";
import { primitiveListItems } from "./description-details";
import { selectedEntityName } from "./detail-editor-primitives";

const tagInputShellClassName = "flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm shadow-sm focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500";

function EntityTagRemoveButton({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`ml-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[12px] font-semibold leading-none transition ${
        danger
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-sky-200 bg-sky-50 text-sky-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
      }`}
    >
      −
    </button>
  );
}

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
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);

  function addOption(option?: FkFieldOption) {
    const next = selectedEntityName(entity, option);
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
        {items.map((item, index) => {
          const matched = !validNames || validNames.has(item);
          return (
            <span
              key={`${item}-${index}`}
              title={matched ? undefined : "当前主数据中未找到对应记录"}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                matched ? "border-slate-300 bg-white text-slate-800" : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <span className="truncate">{item}</span>
              {!disabled && (
                <EntityTagRemoveButton
                  label={`删除${label} ${item}`}
                  danger={!matched}
                  onClick={() => void removeItem(index)}
                />
              )}
            </span>
          );
        })}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <FkFieldInput
              fkKey={fkKeyForEntity(entity)}
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
  value,
  disabled,
  onChange,
  positionNames,
}: {
  label: string;
  value: unknown;
  disabled?: boolean;
  onChange: (items: string[]) => void;
  positionNames: Set<string>;
}) {
  const confirmDelete = useConfirmDelete();
  const items = primitiveListItems(value);

  function addOption(option?: FkFieldOption) {
    const next = selectedEntityName("position", option);
    if (!next) return;
    onChange([...items, next].filter((item, index, array) => array.indexOf(item) === index));
  }

  async function removeItem(index: number) {
    const confirmed = await confirmDelete({
      message: `确定删除下属岗位「${items[index]}」吗？删除后需要保存才会生效。`,
    });
    if (!confirmed) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className={tagInputShellClassName}>
        {items.map((item, index) => {
          const matched = item === "无" || positionNames.has(item);
          return (
            <span
              key={`${item}-${index}`}
              title={matched ? undefined : "当前岗位主数据中未找到对应岗位"}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                matched
                  ? "border-slate-300 bg-white text-slate-800"
                  : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <span className="truncate">{item}</span>
              {!disabled && (
                <EntityTagRemoveButton
                  label={`删除下属岗位 ${item}`}
                  danger={!matched}
                  onClick={() => void removeItem(index)}
                />
              )}
            </span>
          );
        })}
        {disabled ? (
          items.length === 0 ? <span className="text-slate-400">未设置</span> : null
        ) : (
          <div className="min-w-40 flex-1">
            <FkFieldInput
              fkKey="hr.position"
              value=""
              displayValue=""
              disabled={disabled}
              placeholder={items.length === 0 ? "搜索下属岗位" : "添加下属岗位"}
              onChange={(_label, option?: FkFieldOption) => addOption(option)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
