"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import FloatingPortalSurface from "../common/FloatingPortalSurface";
import CalendarDateInput from "../input/CalendarDateInput";
import {
  CalendarDatePopover,
  parseMonth,
  parseQuarter,
  parseYear,
  type PickerMode,
} from "../input/CalendarDatePopover";
import { CONTROL_SIZES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";
import type { ToolbarPeriodItem, ToolbarPeriodNavPickerSpec } from "./Toolbar.types";

function ToolbarPeriodNav({
  label,
  previousLabel = "上一周期",
  nextLabel = "下一周期",
  onPrevious,
  onNext,
  picker,
  disabled,
  size,
}: {
  label: ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  picker?: ToolbarPeriodNavPickerSpec;
  disabled?: boolean;
  size: ControlSize;
}) {
  const tokens = CONTROL_SIZES[size];
  const buttonClassName = `${tokens.height} ${tokens.paddingX} ${tokens.text} ${tokens.leading} font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`;
  const selected = useMemo(() => parsePickerValue(picker), [picker]);
  const now = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>(() => pickerMode(picker));
  const [viewYear, setViewYear] = useState(selected?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.monthIndex ?? now.getMonth());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = parsePickerValue(picker);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.monthIndex);
    }
    setMode(pickerMode(picker));
  }, [open, picker]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`inline-flex ${tokens.height} items-center overflow-hidden ${tokens.radius} border border-slate-200 bg-white shadow-sm`}>
      <button type="button" className={buttonClassName} onClick={onPrevious} disabled={disabled} aria-label={previousLabel}>
        &lsaquo;
      </button>
      {picker ? (
        <button
          ref={triggerRef}
          type="button"
          className={`flex ${tokens.height} min-w-28 items-center justify-center border-x border-slate-200 px-3 text-center ${tokens.text} ${tokens.leading} font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300`}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          aria-label={picker.ariaLabel ?? "选择期间"}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span>{label}</span>
          <span className="ml-1 text-slate-400" aria-hidden="true">▾</span>
        </button>
      ) : (
        <div className={`flex ${tokens.height} min-w-28 items-center justify-center border-x border-slate-200 px-3 text-center ${tokens.text} ${tokens.leading} font-semibold text-slate-600`}>
          {label}
        </div>
      )}
      <button type="button" className={buttonClassName} onClick={onNext} disabled={disabled} aria-label={nextLabel}>
        &rsaquo;
      </button>
      {picker && (
        <FloatingPortalSurface
          open={open && !disabled}
          triggerRef={triggerRef}
          surfaceRef={popoverRef}
          minWidth={240}
          maxWidth={240}
          minHeightForFlip={220}
        >
          <CalendarDatePopover
            value={picker.value}
            precision={picker.precision}
            mode={mode}
            viewYear={viewYear}
            viewMonth={viewMonth}
            setMode={setMode}
            setViewYear={setViewYear}
            setViewMonth={setViewMonth}
            onChange={(value) => {
              if (value) picker.onChange(value);
            }}
            onClose={() => setOpen(false)}
            clearable={false}
            ariaLabel={picker.ariaLabel}
            className="w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
          />
        </FloatingPortalSurface>
      )}
    </div>
  );
}

function pickerMode(picker: ToolbarPeriodNavPickerSpec | undefined): PickerMode {
  return picker?.precision ?? "month";
}

function parsePickerValue(picker: ToolbarPeriodNavPickerSpec | undefined) {
  if (!picker) return null;
  if (picker.precision === "year") return parseYear(picker.value);
  if (picker.precision === "quarter") return parseQuarter(picker.value);
  return parseMonth(picker.value);
}

export function ToolbarPeriodControl({ item, size }: { item: ToolbarPeriodItem; size: ControlSize }) {
  if (item.mode === "date") {
    return (
      <CalendarDateInput
        value={item.value}
        onChange={item.onChange}
        placeholder={item.placeholder}
        precision="date"
        disabled={item.disabled}
        className={`${CONTROL_SIZES[size].height} !w-[7.5rem] shrink-0`}
      />
    );
  }
  if (item.mode === "month") {
    return (
      <CalendarDateInput
        value={item.value}
        onChange={item.onChange}
        placeholder={item.placeholder}
        precision="month"
        disabled={item.disabled}
        className={`${CONTROL_SIZES[size].height} !w-[9rem] shrink-0`}
      />
    );
  }
  return (
    <ToolbarPeriodNav
      label={item.label}
      previousLabel={item.previousLabel}
      nextLabel={item.nextLabel}
      onPrevious={item.onPrevious}
      onNext={item.onNext}
      picker={item.picker}
      disabled={item.disabled}
      size={size}
    />
  );
}
