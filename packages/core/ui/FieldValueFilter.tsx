"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import SearchInput from "./SearchInput";
import { PickerOptionButton } from "./PickerParts";
import type { SelectFieldOption } from "./SelectField";

export interface FieldValueFilterProps {
  fields: SelectFieldOption[];
  valueOptions: Record<string, SelectFieldOption[]>;
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function FieldValueFilter({
  fields,
  valueOptions,
  fieldKey,
  onFieldKeyChange,
  value,
  onValueChange,
  placeholder = "选择筛选",
  disabled = false,
  className,
  style,
}: FieldValueFilterProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"field" | "value">("field");
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const selectedField = fields.find((field) => field.value === fieldKey);
  const currentOptions = valueOptions[fieldKey] ?? [];
  const selectedValue = currentOptions.find((option) => option.value === value);
  const displayValue = useMemo(() => selectedValue?.label ?? (value || "全部"), [selectedValue, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function changeField(nextKey: string) {
    onFieldKeyChange(nextKey);
    onValueChange("");
    setStep("value");
  }

  function changeValue(nextValue: string) {
    onValueChange(nextValue);
    if (currentOptions.length > 0) {
      setOpen(false);
      setStep("field");
    }
  }

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) setStep("field");
      return next;
    });
  }

  return (
    <span ref={rootRef} style={style} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
        className="inline-flex h-10 max-w-48 items-center justify-start rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:shadow disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      >
        {selectedField ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-xs font-semibold text-slate-400">{selectedField.label}</span>
            <span className="min-w-0 truncate">{displayValue}</span>
          </span>
        ) : (
          <span className="truncate">{placeholder}</span>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-max min-w-full max-w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {step === "field" ? (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400">字段</div>
              <div className="grid auto-cols-max grid-flow-col gap-1.5">
                {fields.map((field) => (
                  <PickerOptionButton
                    key={field.value}
                    selected={field.value === fieldKey}
                    onClick={() => changeField(field.value)}
                    align="center"
                    size="compact"
                    className="min-h-8"
                  >
                    <span className="truncate">{field.label}</span>
                  </PickerOptionButton>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep("field")}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                >
                  字段
                </button>
                <div className="min-w-0 flex-1 text-right text-[11px] font-semibold text-slate-400">
                  {selectedField?.label ?? "值"}
                </div>
              </div>
              {currentOptions.length > 0 ? (
                <div className="grid auto-cols-max grid-flow-col gap-1.5">
                  {currentOptions.map((option) => (
                    <PickerOptionButton
                      key={option.value}
                      selected={option.value === value}
                      onClick={() => changeValue(option.value)}
                      align="center"
                      size="compact"
                      className="min-h-8"
                    >
                      <span className="truncate">{option.label}</span>
                    </PickerOptionButton>
                  ))}
                </div>
              ) : (
                <SearchInput
                  value={value}
                  onChange={changeValue}
                  placeholder="输入搜索..."
                  size="compact"
                  className="w-full"
                />
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
