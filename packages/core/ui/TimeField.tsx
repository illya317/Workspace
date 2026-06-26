"use client";

import FieldInputShell from "./FieldInputShell";
import { useFieldContext } from "./field-context";

export interface TimeFieldProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeTimePart(value: number, max: number) {
  return pad2(Math.min(max, Math.max(0, value)));
}

function parseTimeValue(value: string | null | undefined) {
  const match = value?.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hour: "", minute: "" };
  return {
    hour: normalizeTimePart(Number(match[1]), 23),
    minute: normalizeTimePart(Number(match[2]), 59),
  };
}

function normalizeTextPart(value: string, max: number) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  return normalizeTimePart(Number(digits), max);
}

function TimePart({
  label,
  value,
  max,
  disabled,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      readOnly={readOnly}
      value={value}
      placeholder="00"
      aria-label={label}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(normalizeTextPart(event.target.value, max))}
      className="w-8 bg-transparent text-center font-mono text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 disabled:text-slate-500"
    />
  );
}

export default function TimeField({
  value,
  onChange,
  disabled,
  readOnly,
  className,
}: TimeFieldProps) {
  const { hour, minute } = parseTimeValue(value);
  const fieldContext = useFieldContext();

  function commit(part: "hour" | "minute", nextValue: string) {
    const nextHour = part === "hour" ? nextValue : hour;
    const nextMinute = part === "minute" ? nextValue : minute;
    if (!nextHour && !nextMinute) {
      onChange(null);
      return;
    }
    onChange(`${nextHour || "00"}:${nextMinute || "00"}`);
  }

  return (
    <FieldInputShell
      disabled={disabled}
      readOnly={readOnly}
      size={fieldContext?.size}
      density={fieldContext?.density}
      className={`flex items-center justify-center gap-1 px-2 tabular-nums ${className ?? ""}`}
    >
      <TimePart
        label="小时"
        value={hour}
        max={23}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(next) => commit("hour", next)}
      />
      <span className="font-mono text-sm font-semibold text-slate-400">:</span>
      <TimePart
        label="分钟"
        value={minute}
        max={59}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(next) => commit("minute", next)}
      />
    </FieldInputShell>
  );
}
