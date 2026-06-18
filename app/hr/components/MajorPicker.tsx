"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HR_MAJOR_GROUPS,
  isValidHrMajorItem,
  normalizeHrMajorItems,
  serializeHrMajorItems,
  type HRMajorItem,
} from "@/lib/hr-field-options";

interface MajorPickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

function currentMajor(value: unknown): HRMajorItem | undefined {
  return normalizeHrMajorItems(value).find(isValidHrMajorItem);
}

export default function MajorPicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: MajorPickerProps) {
  const current = useMemo(() => currentMajor(value), [value]);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(current?.category || "");
  const [step, setStep] = useState<"category" | "specialty">("category");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveCategory(current?.category || "");
    setStep(current?.category ? "specialty" : "category");
  }, [current?.category, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeGroup = HR_MAJOR_GROUPS.find((group) => group.category === activeCategory);

  function choose(item: HRMajorItem | null) {
    onChange(item ? serializeHrMajorItems([item]) : null);
    setOpen(false);
    setStep("category");
  }

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={
          buttonClassName ||
          "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
        }
      >
        <span className={current?.specialty ? "text-slate-900" : "text-slate-400"}>
          {current?.specialty || "未设置"}
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(34rem,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => choose(null)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                current
                  ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "border-slate-300 bg-slate-100 text-slate-900"
              }`}
            >
              未设置
            </button>
            {step === "specialty" && (
              <button
                type="button"
                onClick={() => setStep("category")}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                更换学科门类
              </button>
            )}
          </div>

          {step === "category" ? (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-500">学科门类</div>
              <div className="grid grid-cols-3 gap-2">
                {HR_MAJOR_GROUPS.map((group) => {
                  const selected = group.category === activeCategory;
                  return (
                    <button
                      key={group.category}
                      type="button"
                      onClick={() => {
                        setActiveCategory(group.category);
                        setStep("specialty");
                      }}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {group.category}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activeGroup ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>专业类</span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-600">{activeGroup.category}</span>
              </div>
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto pr-1 md:grid-cols-3">
                {activeGroup.specialties.map((specialty) => {
                  const selected = current?.category === activeGroup.category && current?.specialty === specialty;
                  return (
                    <button
                      key={specialty}
                      type="button"
                      onClick={() => choose({ category: activeGroup.category, specialty })}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {specialty}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
              <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                先选择学科门类
              </div>
          )}
        </div>
      )}
    </div>
  );
}
