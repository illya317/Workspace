"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface RankPickerProps {
  value: unknown;
  options: string[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function parseRank(rank: string) {
  const match = rank.match(/^([MPT])(\d+)$/);
  if (!match) return null;
  return { group: match[1], level: match[2] };
}

export default function RankPicker({
  value,
  options,
  disabled,
  onChange,
  className,
  buttonClassName,
}: RankPickerProps) {
  const current = normalizeValue(value);
  const parsedCurrent = parseRank(current);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(parsedCurrent?.group || "M");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const option of options) {
      const parsed = parseRank(option);
      if (!parsed) continue;
      const list = grouped.get(parsed.group) ?? [];
      list.push(parsed.level);
      grouped.set(parsed.group, list);
    }
    return ["M", "P", "T"]
      .filter((key) => grouped.has(key))
      .map((key) => ({
        key,
        levels: [...(grouped.get(key) ?? [])].sort((a, b) => Number(a) - Number(b)),
      }));
  }, [options]);

  const activeGroup = groups.find((item) => item.key === group) ?? groups[0];

  useEffect(() => {
    if (parsedCurrent?.group) setGroup(parsedCurrent.group);
  }, [parsedCurrent?.group]);

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

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={buttonClassName || "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"}
      >
        <span className={current ? "text-slate-900" : "text-slate-400"}>{current || "未设置"}</span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${current ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-slate-300 bg-slate-100 text-slate-900"}`}
            >
              未设置
            </button>
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {groups.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setGroup(item.key)}
                  className={`min-w-10 rounded px-3 py-1.5 text-xs font-semibold transition ${
                    activeGroup?.key === item.key
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {item.key}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(activeGroup?.levels ?? []).map((level) => {
              const rank = `${activeGroup?.key}${level}`;
              const selected = rank === current;
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => {
                    onChange(rank);
                    setOpen(false);
                  }}
                  className={`rounded-md border px-2 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
