"use client";

import { useMemo, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  formatDate,
  formatMonth,
  formatQuarter,
  formatWeek,
} from "./calendar-date-values";

export { parseDate, parseMonth, parseQuarter, parseWeek, parseYear } from "./calendar-date-values";

export type CalendarPrecision = "date" | "week" | "month" | "quarter" | "year";
export type PickerMode = "day" | "week" | "month" | "quarter" | "year";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface CalendarDatePopoverProps {
  value: string | null | undefined;
  minDate?: string;
  maxDate?: string;
  precision?: CalendarPrecision;
  mode: PickerMode;
  viewYear: number;
  viewMonth: number;
  setMode: Dispatch<SetStateAction<PickerMode>>;
  setViewYear: Dispatch<SetStateAction<number>>;
  setViewMonth: Dispatch<SetStateAction<number>>;
  onChange: (value: string | null) => void;
  onClose: () => void;
  clearable?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

function getMonthDays(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return { offset, count };
}

function decadeStart(year: number) {
  return Math.floor(year / 12) * 12;
}

export function CalendarDatePopover({
  value,
  minDate,
  maxDate,
  precision = "date",
  mode,
  viewYear,
  viewMonth,
  setMode,
  setViewYear,
  setViewMonth,
  onChange,
  onClose,
  clearable = true,
  ariaLabel,
  className,
  style,
}: CalendarDatePopoverProps) {
  const normalizedMinDate = normalizeBound(minDate, precision);
  const normalizedMaxDate = normalizeBound(maxDate, precision);
  const today = useMemo(() => new Date(), []);
  const todayValue = precision === "year"
    ? String(today.getFullYear())
    : precision === "quarter"
      ? formatQuarter(today.getFullYear(), Math.floor(today.getMonth() / 3) + 1)
      : precision === "month"
        ? formatMonth(today.getFullYear(), today.getMonth())
        : precision === "week"
          ? formatWeek(today.getFullYear(), today.getMonth(), today.getDate())
          : formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  const dayCells = useMemo(() => {
    const { offset, count } = getMonthDays(viewYear, viewMonth);
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [viewYear, viewMonth]);

  const yearStart = decadeStart(viewYear);
  const yearCells = useMemo(
    () => Array.from({ length: 12 }, (_, index) => yearStart + index),
    [yearStart],
  );

  function move(delta: number) {
    if (mode === "year") {
      setViewYear((current) => current + delta * 12);
      return;
    }
    if (mode === "month") {
      setViewYear((current) => current + delta);
      return;
    }
    if (mode === "quarter") {
      setViewYear((current) => current + delta);
      return;
    }
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function headerLabel() {
    if (mode === "year") return `${yearStart} - ${yearStart + 11}`;
    if (mode === "quarter") return `${viewYear}年`;
    if (mode === "month") return `${viewYear}`;
    return `${viewYear}年 ${MONTH_LABELS[viewMonth]}`;
  }

  function chooseDate(dateValue: string) {
    if (isOutsideBounds(dateValue, normalizedMinDate, normalizedMaxDate)) return;
    onChange(dateValue);
    onClose();
  }

  function chooseMonth(monthIndex: number) {
    setViewMonth(monthIndex);
    if (precision === "month") {
      onChange(formatMonth(viewYear, monthIndex));
      onClose();
      return;
    }
    setMode(precision === "week" ? "week" : "day");
  }

  function chooseYear(year: number) {
    setViewYear(year);
    if (precision === "year") {
      onChange(String(year));
      onClose();
      return;
    }
    setMode(precision === "quarter" ? "quarter" : "month");
  }

  return (
    <div
      role="dialog"
      aria-label={ariaLabel ?? pickerAriaLabel(precision)}
      className={className}
      style={style}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => move(-1)}
          className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "year" ? modeAfterYearSelection(precision) : "year")}
          className="flex-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          {headerLabel()}
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          ›
        </button>
      </div>

      {mode === "year" && (
        <div className="grid grid-cols-3 gap-1.5">
          {yearCells.map((year) => (
            <BoundedPickerButton
              key={year}
              active={year === viewYear}
              disabled={!yearOverlapsBounds(year, normalizedMinDate, normalizedMaxDate, precision)}
              onClick={() => chooseYear(year)}
            >{year}</BoundedPickerButton>
          ))}
        </div>
      )}

      {mode === "quarter" && (
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((quarter) => {
            const quarterValue = formatQuarter(viewYear, quarter);
            return (
              <BoundedPickerButton
                key={quarterValue}
                active={value === quarterValue}
                disabled={isOutsideBounds(quarterValue, normalizedMinDate, normalizedMaxDate)}
                onClick={() => {
                  onChange(quarterValue);
                  onClose();
                }}
              >第{quarter}季度</BoundedPickerButton>
            );
          })}
        </div>
      )}

      {mode === "month" && (
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, index) => (
            <BoundedPickerButton
              key={label}
              active={index === viewMonth}
              disabled={!monthOverlapsBounds(viewYear, index, normalizedMinDate, normalizedMaxDate, precision)}
              onClick={() => {
                setViewMonth(index);
                chooseMonth(index);
              }}
            >{label}</BoundedPickerButton>
          ))}
        </div>
      )}

      {(mode === "day" || mode === "week") && (
        <>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-400">
            {WEEK_LABELS.map((label) => <div key={label} className="py-0.5">{label}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {dayCells.map((day, index) => {
              const dateValue = day ? formatDate(viewYear, viewMonth, day) : "";
              const selectionValue = day && precision === "week"
                ? formatWeek(viewYear, viewMonth, day)
                : dateValue;
              const active = day && value === selectionValue;
              const dateDisabled = Boolean(day && isOutsideBounds(selectionValue, normalizedMinDate, normalizedMaxDate));
              return day ? (
                <button
                  key={dateValue}
                  type="button"
                  disabled={dateDisabled}
                  onClick={() => chooseDate(selectionValue)}
                  className={`rounded-md px-1 py-1 text-xs transition ${
                    dateDisabled
                      ? "cursor-not-allowed text-slate-300"
                      : active
                        ? "bg-emerald-600 font-semibold text-white"
                        : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {day}
                </button>
              ) : (
                <div key={`blank-${index}`} />
              );
            })}
          </div>
        </>
      )}

      <div className={`mt-2 flex border-t border-slate-100 pt-2 ${clearable ? "justify-between" : "justify-end"}`}>
        {clearable && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              onClose();
            }}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            清空
          </button>
        )}
        <button
          type="button"
          disabled={isOutsideBounds(todayValue, normalizedMinDate, normalizedMaxDate)}
          onClick={() => {
            const now = new Date();
            if (precision === "year") {
              onChange(String(now.getFullYear()));
              onClose();
              return;
            }
            if (precision === "quarter") {
              onChange(formatQuarter(now.getFullYear(), Math.floor(now.getMonth() / 3) + 1));
              onClose();
              return;
            }
            if (precision === "month") {
              onChange(formatMonth(now.getFullYear(), now.getMonth()));
              onClose();
              return;
            }
            if (precision === "week") {
              chooseDate(formatWeek(now.getFullYear(), now.getMonth(), now.getDate()));
              return;
            }
            chooseDate(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
          }}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          {precision === "year" ? "本年" : precision === "quarter" ? "本季度" : precision === "month" ? "本月" : precision === "week" ? "本周" : "今天"}
        </button>
      </div>
    </div>
  );
}

function modeAfterYearSelection(precision: CalendarPrecision): PickerMode {
  if (precision === "year") return "year";
  if (precision === "quarter") return "quarter";
  return "month";
}

function pickerAriaLabel(precision: CalendarPrecision) {
  if (precision === "year") return "选择年份";
  if (precision === "quarter") return "选择季度";
  if (precision === "month") return "选择月份";
  if (precision === "week") return "选择周";
  return "选择日期";
}

function normalizeBound(value: string | undefined, precision: CalendarPrecision) {
  if (!value) return null;
  const normalized = precision === "year"
    ? value.slice(0, 4)
    : precision === "quarter"
      ? value.slice(0, 7)
      : precision === "month"
        ? value.slice(0, 7)
        : precision === "week"
          ? value.slice(0, 8)
          : value.slice(0, 10);
  const pattern = precision === "year"
    ? /^\d{4}$/
    : precision === "quarter"
      ? /^\d{4}-Q[1-4]$/
      : precision === "month"
        ? /^\d{4}-\d{2}$/
        : precision === "week"
          ? /^\d{4}-W\d{2}$/
          : /^\d{4}-\d{2}-\d{2}$/;
  return pattern.test(normalized) ? normalized : null;
}

function isOutsideBounds(value: string, minDate: string | null, maxDate: string | null) {
  return Boolean((minDate && value < minDate) || (maxDate && value > maxDate));
}

function rangeOverlapsBounds(start: string, end: string, minDate: string | null, maxDate: string | null) {
  return !((minDate && end < minDate) || (maxDate && start > maxDate));
}

function monthOverlapsBounds(
  year: number,
  monthIndex: number,
  minDate: string | null,
  maxDate: string | null,
  precision: CalendarPrecision,
) {
  const month = formatMonth(year, monthIndex);
  if (precision === "week") {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return rangeOverlapsBounds(
      formatWeek(year, monthIndex, 1),
      formatWeek(year, monthIndex, lastDay),
      minDate,
      maxDate,
    );
  }
  if (precision !== "date") return !isOutsideBounds(month, minDate, maxDate);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return rangeOverlapsBounds(`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`, minDate, maxDate);
}

function yearOverlapsBounds(
  year: number,
  minDate: string | null,
  maxDate: string | null,
  precision: CalendarPrecision,
) {
  if (precision === "year") return !isOutsideBounds(String(year), minDate, maxDate);
  if (precision === "quarter") return rangeOverlapsBounds(`${year}-Q1`, `${year}-Q4`, minDate, maxDate);
  if (precision === "month") return rangeOverlapsBounds(`${year}-01`, `${year}-12`, minDate, maxDate);
  if (precision === "week") {
    return rangeOverlapsBounds(
      formatWeek(year, 0, 1),
      formatWeek(year, 11, 31),
      minDate,
      maxDate,
    );
  }
  return rangeOverlapsBounds(`${year}-01-01`, `${year}-12-31`, minDate, maxDate);
}

function BoundedPickerButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-1.5 text-xs transition ${
        disabled
          ? "cursor-not-allowed text-slate-300"
          : active
            ? "bg-emerald-600 font-semibold text-white"
            : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
      }`}
    >
      {children}
    </button>
  );
}
