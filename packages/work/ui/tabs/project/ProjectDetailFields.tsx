"use client";

import {
  FormField,
  OptionPicker,
  TextField,
  getFieldInputClassName,
  getReadOnlyFieldClassName,
  type PickerOption,
} from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

export function PercentField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <FormField label={label}>
      <div className="flex">
        <TextField
          value={value === null || value === undefined ? "" : String(value)}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          disabled={disabled}
          placeholder="输入完成度"
          onChange={(nextValue) => {
            if (nextValue.trim() === "") return onChange(null);
            const number = Number(nextValue);
            onChange(Number.isFinite(number) ? number : value ?? null);
          }}
          className={`${inputClassName} rounded-r-none`}
          unstyled
        />
        <span className="flex h-10 w-12 items-center justify-center rounded-r-md border border-l-0 border-sky-200 bg-slate-50 text-sm font-semibold text-slate-500 shadow-sm">%</span>
      </div>
    </FormField>
  );
}

export function OptionField({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder = "未设置",
  searchPlaceholder,
  popoverClassName = pickerPopoverClassName,
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  disabled: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  popoverClassName?: string;
}) {
  return (
    <FormField label={label}>
      <OptionPicker
        value={value}
        options={options}
        disabled={disabled}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        visibleCount={6}
        buttonClassName={pickerButtonClassName}
        popoverClassName={popoverClassName}
      />
    </FormField>
  );
}

export function ParentProjectField({ value, disabled, onClick }: { value: string; disabled: boolean; onClick: () => void }) {
  return <LinkedInfoField label="上级项目" value={value} disabled={disabled} onClick={onClick} />;
}

export function LinkedInfoField({ label, value, disabled, onClick }: { label: string; value: string; disabled: boolean; onClick: () => void }) {
  return (
    <FormField label={label}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={getReadOnlyFieldClassName("h-10 w-full truncate text-left font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-white hover:text-sky-700 disabled:cursor-default disabled:text-slate-500 disabled:hover:border-sky-200 disabled:hover:bg-sky-50")}
      >
        {value}
      </button>
    </FormField>
  );
}

export function ReadOnlyInfoField({ label, value }: { label: string; value: string }) {
  return (
    <FormField label={label}>
      <TextField
        value={value}
        readOnly
        className={getReadOnlyFieldClassName("h-10 cursor-default text-slate-600")}
        unstyled
      />
    </FormField>
  );
}

export function DateField({ label, value, disabled, hint, onChange }: { label: string; value: string | null; disabled: boolean; hint?: string; onChange: (value: string | null) => void }) {
  return (
    <FormField label={label}>
      <CalendarDateInput value={value} disabled={disabled} onChange={onChange} className={inputClassName} />
      {hint && <p className="mt-1 text-xs font-medium text-slate-400">{hint}</p>}
    </FormField>
  );
}
