"use client";

import { useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
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

function underlineClass(part: QcLayoutPart) {
  return part.underline === false ? "border-b-0" : "border-b border-slate-950";
}

export function QcPaperLineInput({
  part,
  readOnly,
  value,
  onChange,
}: {
  part: QcLayoutPart;
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const valueProps = onChange
    ? { value: value ?? part.defaultValue ?? "", onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value) }
    : { defaultValue: part.defaultValue };
  return (
    <input
      aria-label={part.fieldKey || part.field || part.name || "填写项"}
      data-field-key={part.fieldKey || part.field || part.name}
      {...valueProps}
      readOnly={readOnly || part.readonlyDisplay}
      type={part.inputType || "text"}
      className={`mx-1 inline-block h-5 min-w-[3em] border-0 bg-transparent px-1 text-center align-baseline outline-none read-only:border-b-0 ${underlineClass(part)}`}
      style={inputWidth(part)}
    />
  );
}

export function QcPaperSelectInput({
  part,
  options = [],
  readOnly,
  value,
  onChange,
}: {
  part: QcLayoutPart;
  options?: string[];
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      aria-label={part.fieldKey || part.field || part.name || "选择项"}
      data-field-key={part.fieldKey || part.field || part.name}
      value={value ?? part.defaultValue ?? ""}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value)}
      disabled={readOnly || part.readonlyDisplay}
      className={`mx-1 inline-block h-7 min-w-[4em] border-0 bg-transparent px-1 text-center align-baseline outline-none disabled:opacity-100 ${underlineClass(part)}`}
      style={inputWidth(part)}
    >
      <option value=""> </option>
      {options.map((option) => (
        <option key={`${part.fieldKey || part.field || part.name}-${option}`} value={option}>
          {option}
        </option>
      ))}
    </select>
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

export function QcPaperDateInput({
  part,
  value,
  onChange,
}: {
  part: QcLayoutPart;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const initialValue = value || part.defaultValue || todayValue();
  const initial = useMemo(() => normalizeDateParts(...initialValue.split("-") as [string, string, string]), [initialValue]);
  const [date, setDate] = useState(initial);

  function commit(normalize = false) {
    if (!normalize) return;
    setDate((current) => {
      const next = normalizeDateParts(current.year, current.month, current.day);
      onChange?.(`${next.year}-${next.month}-${next.day}`);
      return next;
    });
  }

  const dateValue = `${date.year}-${date.month}-${date.day}`;
  const key = part.fieldKey || "date";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
      <DatePartInput label="年" maxLength={4} value={date.year} width="4ch" onChange={(year) => setDate((current) => ({ ...current, year }))} onBlur={() => commit(true)} />
      <span>年</span>
      <DatePartInput label="月" maxLength={2} value={date.month} width="2ch" onChange={(month) => setDate((current) => ({ ...current, month }))} onBlur={() => commit(true)} />
      <span>月</span>
      <DatePartInput label="日" maxLength={2} value={date.day} width="2ch" onChange={(day) => setDate((current) => ({ ...current, day }))} onBlur={() => commit(true)} />
      <span>日</span>
      <input type="hidden" data-field-key={key} value={dateValue} readOnly />
      {part.withTime && <QcPaperLineInput part={{ ...part, fieldKey: `${key}_hour`, width: "2em", inputType: "text" }} />}
      {part.withTime && <span>时</span>}
    </span>
  );
}

export function QcPaperChoiceInput({
  fieldKey,
  options = ["是", "否"],
  type = "radio",
  disabled,
  value,
  onChange,
}: {
  fieldKey?: string;
  options?: string[];
  type?: "radio" | "checkbox";
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 align-baseline">
      {options.map((option) => {
        const choiceProps = onChange
          ? {
            checked: (value ?? "") === option,
            onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked ? option : ""),
          }
          : {
            defaultChecked: value === option,
          };
        return (
          <label key={`${fieldKey}-${option}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <input
              type={type}
              name={type === "radio" ? fieldKey : undefined}
              data-field-key={fieldKey}
              value={option}
              disabled={disabled}
              {...choiceProps}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center border border-slate-950 bg-white text-[13px] font-semibold leading-none text-transparent peer-checked:text-slate-950"
            >
              ✓
            </span>
            <span>{option}</span>
          </label>
        );
      })}
    </span>
  );
}
