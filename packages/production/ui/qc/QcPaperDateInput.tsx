"use client";

import { useEffect, useState } from "react";
import { InputSurface } from "@workspace/core/ui";
import type { QcPaperSlotPart } from "./QcPaperInputs";

function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateParts(year: string, month: string, day: string) {
  const fallback = todayValue().split("-");
  const yearDigits = year.replace(/\D/g, "").slice(0, 4);
  const normalizedYear = normalizeYear(yearDigits || fallback[0]);
  const rawMonth = Number(month.replace(/\D/g, "").slice(0, 2) || fallback[1]);
  const rawDay = Number(day.replace(/\D/g, "").slice(0, 2) || fallback[2]);
  return {
    year: normalizedYear,
    month: String(Math.min(12, Math.max(1, rawMonth))).padStart(2, "0"),
    day: String(Math.min(31, Math.max(1, rawDay))).padStart(2, "0"),
  };
}

function normalizeYear(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return `20${digits.padStart(2, "0")}`;
  return digits.slice(0, 4).padStart(4, "0");
}

function cssSlotWidth(value: string | undefined) {
  const width = value?.trim();
  return width || "3rem";
}

function dateRootStyle(part: QcPaperSlotPart) {
  return { width: `min(${cssSlotWidth(part.width)}, 100%)`, maxWidth: "100%" };
}

function dateAlignClass(part: QcPaperSlotPart) {
  if (part.align === "left") return "justify-start";
  if (part.align === "right") return "justify-end";
  return "justify-center";
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
  onChange,
  onBlur,
  readOnly,
  widthClass = "w-[2ch]",
}: {
  label: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  readOnly?: boolean;
  widthClass?: string;
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
      className={`border-0 bg-transparent p-0 text-center text-inherit tabular-nums outline-none ${widthClass}`}
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
  inTable,
}: {
  part: QcPaperSlotPart;
  value?: string;
  hourValue?: string;
  onChange?: (value: string) => void;
  onHourChange?: (value: string) => void;
  readOnly?: boolean;
  inTable?: boolean;
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

  const normalizedDate = normalizeDateParts(date.year, date.month, date.day);
  const dateValue = `${normalizedDate.year}-${normalizedDate.month}-${normalizedDate.day}`;
  const displayMonth = String(Number(normalizedDate.month));
  const displayDay = String(Number(normalizedDate.day));
  const key = part.fieldKey || "date";
  const isReadOnly = readOnly || part.readonlyDisplay;
  return (
    <span
      className={`inline-flex max-w-full items-center whitespace-nowrap text-inherit align-baseline ${dateAlignClass(part)} ${inTable ? "gap-0 leading-7" : "gap-0.5"}`}
      style={dateRootStyle(part)}
    >
      <DatePartInput label="年" maxLength={4} value={date.year} onChange={(year) => setDate((current) => ({ ...current, year }))} onBlur={() => commit(true)} readOnly={isReadOnly} widthClass="w-[4ch]" />
      <span>年</span>
      <DatePartInput label="月" maxLength={2} value={displayMonth} onChange={(month) => setDate((current) => ({ ...current, month }))} onBlur={() => commit(true)} readOnly={isReadOnly} />
      <span>月</span>
      <DatePartInput label="日" maxLength={2} value={displayDay} onChange={(day) => setDate((current) => ({ ...current, day }))} onBlur={() => commit(true)} readOnly={isReadOnly} />
      <span>日</span>
      <InputSurface spec={{ valueType: "date", control: "temporal", state: "hidden" }} value={dateValue} dataFieldKey={key} readOnly />
      {part.withTime && (
        <DatePartInput
          label="时"
          maxLength={2}
          value={String(hourValue || "")}
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
