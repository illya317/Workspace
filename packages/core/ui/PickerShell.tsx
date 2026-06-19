"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface PickerShellRenderContext {
  close: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export interface PickerShellProps {
  valueLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  children: (context: PickerShellRenderContext) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export default function PickerShell({
  valueLabel,
  placeholder = "未设置",
  disabled,
  className,
  buttonClassName,
  popoverClassName,
  children,
  onOpenChange,
}: PickerShellProps) {
  const [open, setOpenState] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const displayLabel = valueLabel || "";

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={
          buttonClassName ||
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
        }
      >
        <span className={displayLabel ? "text-slate-900" : "text-slate-400"}>
          {displayLabel || placeholder}
        </span>
      </button>

      {open && !disabled && (
        <div className={popoverClassName || "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"}>
          {children({ close, open, setOpen })}
        </div>
      )}
    </div>
  );
}
