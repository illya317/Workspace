"use client";

import { PickerOptionButton } from "./PickerParts";
import type { PickerOption } from "./OptionPickerTypes";

export function OptionGrid({
  options,
  current,
  onSelect,
  columns,
}: {
  options: PickerOption[];
  current: string;
  onSelect: (value: string) => void;
  columns: number;
}) {
  return (
    <div className="grid max-h-72 gap-2 overflow-auto pr-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <PickerOptionButton key={option.value} selected={option.value === current} size="compact" onClick={() => onSelect(option.value)}>
          {option.description && <span className="block text-[11px] text-slate-500">{option.description}</span>}
          <span className="block font-medium">{option.label}</span>
        </PickerOptionButton>
      ))}
    </div>
  );
}

export function Empty({ placeholder }: { placeholder: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      {placeholder}
    </div>
  );
}
