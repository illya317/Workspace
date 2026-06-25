"use client";

import type { ReactNode } from "react";
import { PickerOptionButton } from "./PickerParts";
import type { PickerOption } from "./OptionPickerTypes";

export function OptionGrid({
  options,
  current,
  onSelect,
  columns,
  renderOption,
}: {
  options: PickerOption[];
  current: string;
  onSelect: (value: string) => void;
  columns: number;
  renderOption?: (option: PickerOption, context: { selected: boolean }) => ReactNode;
}) {
  return (
    <div className="grid max-h-72 gap-2 overflow-auto pr-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <PickerOptionButton key={option.value} selected={selected} size="compact" onClick={() => onSelect(option.value)}>
            {renderOption ? renderOption(option, { selected }) : (
              <>
                {option.description && <span className="block text-[11px] text-slate-500">{option.description}</span>}
                <span className="block font-medium">{option.label}</span>
              </>
            )}
          </PickerOptionButton>
        );
      })}
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
