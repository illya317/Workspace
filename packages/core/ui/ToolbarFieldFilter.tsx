"use client";

import DropdownSurface from "./DropdownSurface";
import { PickerOptionButton } from "./PickerParts";

export interface ToolbarFieldFilterOption {
  value: string;
  label: string;
}

export interface ToolbarFieldFilterProps {
  label: string;
  value: string;
  options: ToolbarFieldFilterOption[];
  onChange: (value: string) => void;
  align?: "left" | "right";
}

export default function ToolbarFieldFilter({
  label,
  value,
  options,
  onChange,
  align = "left",
}: ToolbarFieldFilterProps) {
  const selected = options.find((option) => option.value === value);
  const selectedCount = selected ? 1 : 0;

  return (
    <DropdownSurface
      align={align}
      className="relative"
      surfaceClassName="w-max min-w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-lg border-slate-200 p-2 shadow-xl"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <span className="text-slate-400">{label}</span>
          <span>{selectedCount}</span>
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    >
      {({ close }) => (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400">{label}</div>
          <div role="group" aria-label={label} className="flex max-w-full flex-wrap gap-1.5">
            {options.map((option) => (
              <PickerOptionButton
                key={option.value}
                selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                align="center"
                size="compact"
                className="min-h-8"
              >
                <span className="truncate">{option.label}</span>
              </PickerOptionButton>
            ))}
          </div>
        </div>
      )}
    </DropdownSurface>
  );
}
