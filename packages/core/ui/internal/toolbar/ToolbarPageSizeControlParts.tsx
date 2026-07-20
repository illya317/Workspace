"use client";

import { ActionGlyph } from "../action/ActionGlyphs";
import DropdownSurface, { getDropdownItemClassName } from "../common/DropdownSurface";
import type { InputOption } from "../input/InputSurfaceTypes";

export default function ToolbarPageSizeControl({
  value,
  options,
  onChange,
  label = "每页条数",
  triggerClassName,
}: {
  value: string;
  options: InputOption[];
  onChange: (value: string) => void;
  label?: string;
  triggerClassName: string;
}) {
  const activeOption = options.find((option) => option.value === value);
  const activeLabel = activeOption?.label ?? (value || label);

  return (
    <DropdownSurface
      align="right"
      surfaceClassName="min-w-32 overflow-hidden p-1"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          title={activeLabel}
          onClick={toggle}
          className={triggerClassName}
        >
          <span className="block truncate">{activeLabel}</span>
        </button>
      )}
    >
      {({ close }) => (
        <div role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={`${getDropdownItemClassName({ layout: "flex" })} justify-between gap-3 rounded-md disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-emerald-50 font-semibold !text-emerald-700" : ""}`}
              >
                <span>{option.label ?? option.value}</span>
                {selected ? <ActionGlyph kind="check" className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </DropdownSurface>
  );
}
