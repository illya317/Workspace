"use client";

import type { ReactNode } from "react";
import CalendarDateInput from "../input/CalendarDateInput";
import { CONTROL_SIZES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";
import type { ToolbarPeriodItem } from "./Toolbar.types";

function ToolbarPeriodNav({
  label,
  previousLabel = "上一周期",
  nextLabel = "下一周期",
  onPrevious,
  onNext,
  disabled,
  size,
}: {
  label: ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  size: ControlSize;
}) {
  const tokens = CONTROL_SIZES[size];
  const buttonClassName = `${tokens.height} ${tokens.paddingX} ${tokens.text} ${tokens.leading} font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`;
  return (
    <div className={`inline-flex ${tokens.height} items-center overflow-hidden ${tokens.radius} border border-slate-200 bg-white shadow-sm`}>
      <button type="button" className={buttonClassName} onClick={onPrevious} disabled={disabled} aria-label={previousLabel}>
        &lsaquo;
      </button>
      <div className={`flex ${tokens.height} min-w-28 items-center justify-center border-x border-slate-200 px-3 text-center ${tokens.text} ${tokens.leading} font-semibold text-slate-600`}>
        {label}
      </div>
      <button type="button" className={buttonClassName} onClick={onNext} disabled={disabled} aria-label={nextLabel}>
        &rsaquo;
      </button>
    </div>
  );
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
      disabled={item.disabled}
      size={size}
    />
  );
}
