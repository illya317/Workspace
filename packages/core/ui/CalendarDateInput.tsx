"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { joinClassNames } from "./card-utils";
import { CalendarDatePopover, parseDate, type PickerMode } from "./CalendarDatePopover";
import { getFieldInputClassName } from "./FormStyles";

interface CalendarDateInputProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  popoverMode?: "absolute" | "fixed";
  style?: CSSProperties;
  title?: string;
  unstyled?: boolean;
}

const CalendarDateInput = forwardRef<HTMLInputElement, CalendarDateInputProps>(
  function CalendarDateInput(
    {
      value,
      onChange,
      onKeyDown,
      disabled,
      readOnly,
      className,
      wrapperClassName = "relative",
      placeholder,
      popoverMode = "absolute",
      style,
      title,
      unstyled = false,
    },
    ref,
  ) {
    const selected = parseDate(value);
    const inputPlaceholder = placeholder ?? "选择日期";
    const today = useMemo(() => new Date(), []);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<PickerMode>("day");
    const [viewYear, setViewYear] = useState(selected?.year ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(selected?.monthIndex ?? today.getMonth());
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [fixedPosition, setFixedPosition] = useState<{ left: number; top: number } | null>(null);

    function assignInputRef(node: HTMLInputElement | null) {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }

    const updateFixedPosition = useCallback(() => {
      if (popoverMode !== "fixed" || !inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      const left = Math.min(rect.left, window.innerWidth - 256);
      setFixedPosition({
        left: Math.max(8, left),
        top: rect.bottom + 6,
      });
    }, [popoverMode]);

    const openPicker = useCallback(() => {
      if (disabled || readOnly) return;
      updateFixedPosition();
      setOpen(true);
    }, [disabled, readOnly, updateFixedPosition]);

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

    useEffect(() => {
      if (!open || popoverMode !== "fixed") return;
      updateFixedPosition();
      window.addEventListener("resize", updateFixedPosition);
      window.addEventListener("scroll", updateFixedPosition, true);
      return () => {
        window.removeEventListener("resize", updateFixedPosition);
        window.removeEventListener("scroll", updateFixedPosition, true);
      };
    }, [open, popoverMode, updateFixedPosition]);

    return (
      <div ref={wrapperRef} className={wrapperClassName}>
        <input
          ref={assignInputRef}
          type="text"
          readOnly
          value={value ?? ""}
          onFocus={openPicker}
          onClick={openPicker}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-readonly={readOnly}
          placeholder={inputPlaceholder}
          style={style}
          title={title}
          className={
            unstyled
              ? className
              : joinClassNames(
                  getFieldInputClassName("cursor-pointer caret-transparent text-slate-900"),
                  className,
                )
          }
        />
        {open && !disabled && (
          <CalendarDatePopover
            value={value}
            mode={mode}
            viewYear={viewYear}
            viewMonth={viewMonth}
            setMode={setMode}
            setViewYear={setViewYear}
            setViewMonth={setViewMonth}
            onChange={onChange}
            onClose={() => setOpen(false)}
            className={joinClassNames(
              "z-50 w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-xl",
              popoverMode === "fixed" ? "fixed" : "absolute left-0 mt-1",
            )}
            style={popoverMode === "fixed" && fixedPosition ? fixedPosition : undefined}
          />
        )}
      </div>
    );
  },
);

export default CalendarDateInput;
