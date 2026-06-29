"use client";

import { useMemo, type CSSProperties, type Dispatch, type SetStateAction } from "react";

export type PickerMode = "day" | "month" | "year";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface CalendarDatePopoverProps {
  value: string | null | undefined;
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
    onChange(dateValue);
    onClose();
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
          onClick={() => setMode(mode === "day" ? "month" : "year")}
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
            <button
              key={year}
              type="button"
              onClick={() => {
                setViewYear(year);
                setMode("month");
              }}
              className={`rounded-md px-2 py-1.5 text-xs transition ${
                year === viewYear
                  ? "bg-sky-600 font-semibold text-white"
                  : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {mode === "month" && (
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setViewMonth(index);
                setMode("day");
              }}
              className={`rounded-md px-2 py-1.5 text-xs transition ${
                index === viewMonth
                  ? "bg-sky-600 font-semibold text-white"
                  : "text-slate-700 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              {label}
            </button>
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
              return day ? (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => chooseDate(dateValue)}
                  className={`rounded-md px-1 py-1 text-xs transition ${
                    active
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
            chooseDate(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
          }}
          className="text-xs font-medium text-sky-700 hover:text-sky-800"
        >
          今天
        </button>
      </div>
    </div>
  );
}
