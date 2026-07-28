"use client";

import { ActionButton } from "../action/ActionControls";
import DropdownSurface from "../common/DropdownSurface";
import { joinClassNames } from "../common/card-utils";
import type { ControlSize } from "../common/interactionTokens";
import RemovableTag from "../input/RemovableTag";
import { SelectionOptionButton } from "../selection/SelectionParts";
import {
  getActiveToolbarFilterPanelFields,
  TOOLBAR_FILTER_PANEL_SURFACE_CLASS_NAME,
} from "./ToolbarFilterPanel.model";
import type { ToolbarFilterPanelFieldSpec, ToolbarFilterPanelItem } from "./Toolbar.types";

export default function ToolbarFilterPanel({
  item,
  size,
}: {
  item: ToolbarFilterPanelItem;
  size: ControlSize;
}) {
  const activeFields = getActiveToolbarFilterPanelFields(item.fields);
  const label = item.label ?? "筛选";

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2">
      <DropdownSurface
        className="shrink-0"
        surfaceClassName={TOOLBAR_FILTER_PANEL_SURFACE_CLASS_NAME}
        trigger={({ open, toggle }) => (
          <span className="relative inline-flex">
            <ActionButton
              kind="filter"
              label={activeFields.length > 0 ? `${label}，已选 ${activeFields.length} 项` : label}
              variant="secondary"
              size={size}
              onClick={toggle}
              className={activeFields.length > 0 ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : undefined}
              aria-haspopup="dialog"
              aria-expanded={open}
            />
            {activeFields.length > 0 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-emerald-600 px-1 py-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white"
              >
                {activeFields.length}
              </span>
            ) : null}
          </span>
        )}
      >
        <div role="dialog" aria-label={`${label}条件`}>
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
            <div className="text-sm font-bold text-slate-800">筛选条件</div>
            {activeFields.length > 0 ? (
              <button
                type="button"
                onClick={() => resetFilterPanel(item)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                重置
              </button>
            ) : null}
          </div>
          <ToolbarFilterPanelFields item={item} />
        </div>
      </DropdownSurface>

      {activeFields.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {activeFields.map((field) => (
            <RemovableTag
              key={field.key}
              label={`清除${field.label}筛选`}
              title={`${field.label}：${field.valueLabel}`}
              maxLength={12}
              confirmRemove={false}
              onRemove={field.onClear}
            >
              {`${field.label}：${field.valueLabel}`}
            </RemovableTag>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ToolbarFilterPanelFields({
  item,
  compact = false,
}: {
  item: ToolbarFilterPanelItem;
  compact?: boolean;
}) {
  return (
    <div
      className={joinClassNames("grid min-w-0", compact ? "gap-3 p-1" : "gap-4 p-4")}
      data-toolbar-filter-panel-fields="true"
    >
      {item.fields.map((field) => (
        <FilterPanelField key={field.key} field={field} />
      ))}
    </div>
  );
}

function FilterPanelField({ field }: { field: ToolbarFilterPanelFieldSpec }) {
  const options = [
    { value: "", label: field.allLabel ?? "全部" },
    ...field.options.filter((option) => option.value !== ""),
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold text-slate-500">{field.label}</legend>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {options.map((option) => (
          <SelectionOptionButton
            key={option.value || "__all__"}
            selected={field.value === option.value}
            disabled={option.disabled}
            onClick={() => field.onChange(option.value)}
            size="compact"
          >
            {option.label}
          </SelectionOptionButton>
        ))}
      </div>
    </fieldset>
  );
}

function resetFilterPanel(item: ToolbarFilterPanelItem) {
  if (item.onReset) {
    item.onReset();
    return;
  }
  for (const field of item.fields) {
    if (field.value) field.onChange("");
  }
}
