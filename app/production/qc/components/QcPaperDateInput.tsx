"use client";

import { useEffect, useState } from "react";
import type { QcLayoutPart } from "@/server/services/production/qc";

function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateParts(year: string, month: string, day: string) {
  const fallback = todayValue().split("-");
  const normalizedYear = (year.replace(/\D/g, "").slice(0, 4) || fallback[0]).padStart(4, "0");
  const rawMonth = Number(month.replace(/\D/g, "").slice(0, 2) || fallback[1]);
  const rawDay = Number(day.replace(/\D/g, "").slice(0, 2) || fallback[2]);
  return {
    year: normalizedYear,
    month: String(Math.min(12, Math.max(1, rawMonth))).padStart(2, "0"),
    day: String(Math.min(31, Math.max(1, rawDay))).padStart(2, "0"),
  };
}

function offsetDateValue(offsetDays?: number) {
  if (offsetDays == null || !Number.isFinite(offsetDays)) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DatePartInput({
  label,
  maxLength,
  value,
  width,
  onChange,
  onBlur,
  readOnly,
}: {
  label: string;
  maxLength: number;
  value: string;
  width: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  readOnly?: boolean;
}) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))}
      onBlur={onBlur}
      readOnly={readOnly}
      className="border-0 bg-transparent p-0 text-center tabular-nums outline-none"
      style={{ width, font: "inherit" }}
    />
  );
}

export function QcPaperDateInput({
  part,
  value,
  hourValue,
  onChange,
  onHourChange,
  readOnly,
}: {
  part: QcLayoutPart;
  value?: string;
  hourValue?: string;
  onChange?: (value: string) => void;
  onHourChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const fallbackValue = part.defaultValue || offsetDateValue(part.defaultOffsetDays) || todayValue();
  const [date, setDate] = useState(() => normalizeDateParts(...(value || fallbackValue).split("-") as [string, string, string]));
  useEffect(() => {
    if (!value) return;
    setDate(normalizeDateParts(...value.split("-") as [string, string, string]));
  }, [value]);

  function commit(normalize = false) {
    if (!normalize) return;
    const next = normalizeDateParts(date.year, date.month, date.day);
    setDate(next);
    onChange?.(`${next.year}-${next.month}-${next.day}`);
  }

  const dateValue = `${date.year}-${date.month}-${date.day}`;
  const key = part.fieldKey || "date";
  const isReadOnly = readOnly || part.readonlyDisplay;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
      <DatePartInput label="年" maxLength={4} value={date.year} width="4ch" onChange={(year) => setDate((current) => ({ ...current, year }))} onBlur={() => commit(true)} readOnly={isReadOnly} />
      <span>年</span>
      <DatePartInput label="月" maxLength={2} value={date.month} width="2ch" onChange={(month) => setDate((current) => ({ ...current, month }))} onBlur={() => commit(true)} readOnly={isReadOnly} />
      <span>月</span>
      <DatePartInput label="日" maxLength={2} value={date.day} width="2ch" onChange={(day) => setDate((current) => ({ ...current, day }))} onBlur={() => commit(true)} readOnly={isReadOnly} />
      <span>日</span>
      <input type="hidden" data-field-key={key} value={dateValue} readOnly />
      {part.withTime && (
        <DatePartInput
          label="时"
          maxLength={2}
          value={String(hourValue || "")}
          width="2ch"
          onChange={(hour) => onHourChange?.(hour)}
          onBlur={() => {
            const normalized = String(hourValue || "").replace(/\D/g, "").slice(0, 2);
            if (!normalized) return;
            const hour = String(Math.min(23, Math.max(0, Number(normalized)))).padStart(2, "0");
            onHourChange?.(hour);
          }}
          readOnly={isReadOnly}
        />
      )}
      {part.withTime && <span>时</span>}
    </span>
  );
}
