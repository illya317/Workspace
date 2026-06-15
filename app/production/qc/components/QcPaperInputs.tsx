"use client";

import { useMemo, useState, type CSSProperties } from "react";
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

function inputWidth(part: QcLayoutPart): CSSProperties {
  return { width: part.width || "4em" };
}

export function QcPaperLineInput({ part, readOnly }: { part: QcLayoutPart; readOnly?: boolean }) {
  return (
    <input
      aria-label={part.fieldKey || part.field || part.name || "填写项"}
      data-field-key={part.fieldKey || part.field || part.name}
      defaultValue={part.defaultValue}
      readOnly={readOnly || part.readonlyDisplay}
      type={part.inputType || "text"}
      className="mx-1 inline-block h-5 min-w-[3em] border-0 border-b border-slate-950 bg-transparent px-1 text-center align-baseline outline-none read-only:border-b-0"
      style={inputWidth(part)}
    />
  );
}

function DatePartInput({
  label,
  maxLength,
  value,
  width,
  onChange,
  onBlur,
}: {
  label: string;
  maxLength: number;
  value: string;
  width: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))}
      onBlur={onBlur}
      className="border-0 bg-transparent p-0 text-center outline-none"
      style={{ width, font: "inherit" }}
    />
  );
}

export function QcPaperDateInput({ part }: { part: QcLayoutPart }) {
  const initial = useMemo(() => normalizeDateParts(...(part.defaultValue || todayValue()).split("-") as [string, string, string]), [part.defaultValue]);
  const [date, setDate] = useState(initial);

  function commit(normalize = false) {
    if (!normalize) return;
    setDate((current) => normalizeDateParts(current.year, current.month, current.day));
  }

  const value = `${date.year}-${date.month}-${date.day}`;
  const key = part.fieldKey || "date";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
      <DatePartInput label="年" maxLength={4} value={date.year} width="4ch" onChange={(year) => setDate((current) => ({ ...current, year }))} onBlur={() => commit(true)} />
      <span>年</span>
      <DatePartInput label="月" maxLength={2} value={date.month} width="2ch" onChange={(month) => setDate((current) => ({ ...current, month }))} onBlur={() => commit(true)} />
      <span>月</span>
      <DatePartInput label="日" maxLength={2} value={date.day} width="2ch" onChange={(day) => setDate((current) => ({ ...current, day }))} onBlur={() => commit(true)} />
      <span>日</span>
      <input type="hidden" data-field-key={key} value={value} readOnly />
      {part.withTime && <QcPaperLineInput part={{ ...part, fieldKey: `${key}_hour`, width: "2em", inputType: "text" }} />}
      {part.withTime && <span>时</span>}
    </span>
  );
}

export function QcPaperChoiceInput({ fieldKey, options = ["是", "否"], type = "radio" }: { fieldKey?: string; options?: string[]; type?: "radio" | "checkbox" }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 align-baseline">
      {options.map((option) => (
        <label key={`${fieldKey}-${option}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <input
            type={type}
            name={type === "radio" ? fieldKey : undefined}
            data-field-key={fieldKey}
            value={option}
            className="h-4 w-4 appearance-none border border-slate-950 bg-white align-middle checked:bg-slate-950"
          />
          <span>{option}</span>
        </label>
      ))}
    </span>
  );
}
