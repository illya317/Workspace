"use client";

import FieldInputShell from "./FieldInputShell";
import TextField from "./TextField";

export interface PercentFieldProps {
  value?: number | null;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  onChange?: (value: number | null) => void;
}

export function PercentField({
  value,
  disabled,
  placeholder = "输入完成度",
  min = 0,
  max = 100,
  step = 0.01,
  onChange,
}: PercentFieldProps) {
  return (
    <FieldInputShell suffix="%" disabled={disabled}>
      <TextField
        type="number"
        min={min}
        max={max}
        step={step}
        value={value == null ? "" : String(value)}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(next: string) => {
          if (!onChange) return;
          if (next.trim() === "") return onChange(null);
          const number = Number(next);
          onChange(Number.isFinite(number) ? number : value ?? null);
        }}
        unstyled
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-0 outline-none disabled:bg-transparent disabled:text-slate-500"
      />
    </FieldInputShell>
  );
}

export default PercentField;
