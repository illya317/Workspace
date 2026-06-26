"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { joinClassNames } from "./card-utils";
import { CalendarDatePopover, parseDate, type PickerMode } from "./CalendarDatePopover";
import FieldInputShell from "./FieldInputShell";
import { useFieldContext } from "./field-context";

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
  state?: "default" | "error" | "info";
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
      state = "default",
    },
    ref,
  ) {
    const selected = parseDate(value);
    const fieldContext = useFieldContext();
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

    const input = (
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
        title={title}
        className={
          unstyled
            ? className
            : "h-full w-full min-w-0 border-0 bg-transparent p-0 text-sm text-current outline-none placeholder:text-slate-400 caret-transparent cursor-pointer disabled:bg-transparent disabled:text-slate-500"
        }
      />
    );

    return (
      <div ref={wrapperRef} className={wrapperClassName}>
        {unstyled ? (
          input
        ) : (
          <FieldInputShell
            disabled={disabled}
            readOnly={readOnly}
            size={fieldContext?.size}
            density={fieldContext?.density}
            className={joinClassNames(
              state === "error" ? "border-red-300 text-red-700 focus-within:border-red-500 focus-within:ring-red-500" : "",
              state === "info" ? "border-sky-200 focus-within:border-sky-500 focus-within:ring-sky-500" : "",
              className,
            )}
            style={style}
          >
            {input}
          </FieldInputShell>
        )}
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
