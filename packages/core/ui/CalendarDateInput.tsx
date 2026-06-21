"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { joinClassNames } from "./card-utils";
import { getFieldInputClassName } from "./FormStyles";

interface CalendarDateInputProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

type PickerMode = "day" | "month" | "year";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseDate(value: string | null | undefined) {
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

const CalendarDateInput = forwardRef<HTMLInputElement, CalendarDateInputProps>(
  function CalendarDateInput(
    {
      value,
      onChange,
      onKeyDown,
      disabled,
      className,
      placeholder = "选择日期",
    },
    ref,
  ) {
    const selected = parseDate(value);
    const today = useMemo(() => new Date(), []);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<PickerMode>("day");
    const [viewYear, setViewYear] = useState(selected?.year ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(selected?.monthIndex ?? today.getMonth());
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const next = parseDate(value);
      if (next) {
        setViewYear(next.year);
        setViewMonth(next.monthIndex);
      }
      setMode("day");
    }, [open, value]);

    useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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

    return (
      <div ref={wrapperRef} className="relative">
        <input
          ref={ref}
          type="text"
          readOnly
          value={value ?? ""}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={joinClassNames(
            getFieldInputClassName("cursor-pointer caret-transparent text-slate-900"),
            className,
          )}
        />
        {open && !disabled && (
          <div className="absolute left-0 z-50 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
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
                        onClick={() => {
                          onChange(dateValue);
                          setOpen(false);
                        }}
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
                  setOpen(false);
                }}
                className="text-xs text-slate-500 hover:text-red-600"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  onChange(formatDate(now.getFullYear(), now.getMonth(), now.getDate()));
                  setOpen(false);
                }}
                className="text-xs font-medium text-sky-700 hover:text-sky-800"
              >
                今天
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default CalendarDateInput;
