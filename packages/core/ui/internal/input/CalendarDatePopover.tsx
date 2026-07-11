"use client";

import { useMemo, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type PickerMode = "day" | "month" | "year";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface CalendarDatePopoverProps {
  value: string | null | undefined;
  minDate?: string;
  maxDate?: string;
  precision?: "date" | "month";
  mode: PickerMode;
  viewYear: number;
  viewMonth: number;
  setMode: Dispatch<SetStateAction<PickerMode>>;
  setViewYear: Dispatch<SetStateAction<number>>;
  setViewMonth: Dispatch<SetStateAction<number>>;
  onChange: (value: string | null) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function formatMonth(year: number, monthIndex: number) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return { year, monthIndex, day };
}

export function parseMonth(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day: 1 };
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
  className,
  style,
}: CalendarDatePopoverProps) {
  const normalizedMinDate = normalizeBound(minDate, precision);
  const normalizedMaxDate = normalizeBound(maxDate, precision);
  const today = useMemo(() => new Date(), []);
  const todayValue = precision === "month"
    ? formatMonth(today.getFullYear(), today.getMonth())
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
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function headerLabel() {
    if (mode === "year") return `${yearStart} - ${yearStart + 11}`;
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
    setMode("day");
  }

  return (
    <div className={className} style={style}>
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
          onClick={() => setMode(mode === "year" ? "month" : precision === "month" ? "year" : "month")}
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
              disabled={!rangeOverlapsBounds(`${year}-01-01`, `${year}-12-31`, normalizedMinDate, normalizedMaxDate)}
              onClick={() => {
                setViewYear(year);
                setMode("month");
              }}
            >{year}</BoundedPickerButton>
          ))}
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

      {mode === "day" && (
        <>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-400">
            {WEEK_LABELS.map((label) => <div key={label} className="py-0.5">{label}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {dayCells.map((day, index) => {
              const dateValue = day ? formatDate(viewYear, viewMonth, day) : "";
              const active = day && value === dateValue;
              const dateDisabled = Boolean(day && isOutsideBounds(dateValue, normalizedMinDate, normalizedMaxDate));
              return day ? (
                <button
                  key={dateValue}
                  type="button"
                  disabled={dateDisabled}
                  onClick={() => chooseDate(dateValue)}
                  className={`rounded-md px-1 py-1 text-xs transition ${
                    dateDisabled
                      ? "cursor-not-allowed text-slate-300"
                      : active
                        ? "bg-sky-600 font-semibold text-white"
                        : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"
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

      <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
        <button
          type="button"
          disabled={isOutsideBounds(todayValue, normalizedMinDate, normalizedMaxDate)}
          onClick={() => {
            onChange(null);
            onClose();
          }}
          className="text-xs text-slate-500 hover:text-red-600"
        >
          清空
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            if (precision === "month") {
              onChange(formatMonth(now.getFullYear(), now.getMonth()));
              onClose();
              return;
            }
            chooseDate(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
          }}
          className="text-xs font-medium text-sky-700 hover:text-sky-800 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          {precision === "month" ? "本月" : "今天"}
        </button>
      </div>
    </div>
  );
}

function normalizeBound(value: string | undefined, precision: "date" | "month") {
  if (!value) return null;
  const normalized = precision === "month" ? value.slice(0, 7) : value.slice(0, 10);
  const pattern = precision === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
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
  precision: "date" | "month",
) {
  const month = formatMonth(year, monthIndex);
  if (precision === "month") return !isOutsideBounds(month, minDate, maxDate);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return rangeOverlapsBounds(`${month}-01`, `${month}-${pad2(lastDay)}`, minDate, maxDate);
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
            ? "bg-sky-600 font-semibold text-white"
            : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"
      }`}
    >
      {children}
    </button>
  );
}
