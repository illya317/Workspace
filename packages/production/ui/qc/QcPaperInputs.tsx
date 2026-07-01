"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const PAPER_INPUT_TEXT_CLASS = "text-inherit";

export interface QcPaperSlotPart {
  type: string;
  fieldKey?: string;
  field?: string;
  name?: string;
  width?: string;
  align?: "left" | "center" | "right" | string;
  underline?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  withTime?: boolean;
  inputType?: string;
  valueType?: string;
  numberFormat?: string;
  precision?: number;
  defaultValue?: string;
  defaultOffsetDays?: number;
  readonlyDisplay?: boolean;
  recommendedRange?: { min?: number | null; max?: number | null };
}

function cssSlotWidth(value: string | undefined) {
  const width = value?.trim();
  return width || "3rem";
}

function documentSlotWidth(part: QcPaperSlotPart): CSSProperties {
  return { width: `min(${cssSlotWidth(part.width)}, 100%)`, maxWidth: "100%" };
}

function inputAlignClass(part: QcPaperSlotPart) {
  if (part.align === "left") return "text-left tabular-nums";
  if (part.align === "right") return "text-right tabular-nums";
  return "text-center tabular-nums";
}

function inputPaddingClass() {
  return "px-1";
}

function inputWidth(part: QcPaperSlotPart): CSSProperties {
  return documentSlotWidth(part);
}

function selectWidth(part: QcPaperSlotPart): CSSProperties {
  return { ...documentSlotWidth(part), backgroundImage: "none" };
}

export function qcRangeLabel(part: QcPaperSlotPart) {
  const range = part.recommendedRange;
  if (!range) return "";
  if (range.min != null && range.max != null) return range.min === range.max ? String(range.min) : `${range.min}～${range.max}`;
  if (range.min != null) return `≥${range.min}`;
  if (range.max != null) return `≤${range.max}`;
  return "";
}

export function qcRangeError(part: QcPaperSlotPart, value?: string) {
  const range = part.recommendedRange;
  if (!range || value == null || String(value).trim() === "") return undefined;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  if (!Number.isFinite(num)) return undefined;
  if ((range.min != null && num < range.min) || (range.max != null && num > range.max)) {
    return `超出推荐范围 ${qcRangeLabel(part)}`;
  }
  return undefined;
}

function underlineClass(part: QcPaperSlotPart, inTable?: boolean) {
  if (inTable) return "border-b-0";
  return part.underline === true ? "border-b border-slate-950" : "border-b-0";
}

function selectRootBorderClass(part: QcPaperSlotPart, inTable?: boolean) {
  if (inTable || part.underline !== true) return "!border-0";
  return "border-b border-slate-950";
}

function textInputType(part: QcPaperSlotPart) {
  if (part.inputType === "date") return "date";
  return "text";
}

export function QcPaperLineInput({
  part,
  readOnly,
  value,
  onChange,
  inTable,
}: {
  part: QcPaperSlotPart;
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  inTable?: boolean;
}) {
  const rawValue = value ?? part.defaultValue ?? "";
  const error = qcRangeError(part, rawValue);
  const baseClass = inTable ? "mx-0" : "mx-1";
  const readonlyClass = readOnly || part.readonlyDisplay ? "cursor-default text-slate-900" : "";
  const isReadOnly = readOnly || part.readonlyDisplay || !onChange;
  const currentValue = isReadOnly ? formattedNumberValue(rawValue, part) : rawValue;
  if (part.multiline || part.inputType === "textarea") {
    return (
      <textarea
        aria-label={part.fieldKey || part.field || part.name || "填写项"}
        data-field-key={part.fieldKey || part.field || part.name}
        value={currentValue}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={part.placeholder}
        readOnly={isReadOnly}
        rows={part.rows || 2}
        title={error}
        className={`${baseClass} ${PAPER_INPUT_TEXT_CLASS} inline-block min-w-0 resize-y overflow-hidden border-0 bg-transparent ${inputPaddingClass()} ${inputAlignClass(part)} align-baseline leading-7 outline-none ${readonlyClass} ${error ? "text-red-700" : ""} ${underlineClass(part, inTable)}`}
        style={inputWidth(part)}
      />
    );
  }
  return (
    <input
      aria-label={part.fieldKey || part.field || part.name || "填写项"}
      data-field-key={part.fieldKey || part.field || part.name}
      value={currentValue}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={part.placeholder}
      readOnly={isReadOnly}
      inputMode={part.valueType === "number" || part.inputType === "number" ? "decimal" : undefined}
      type={textInputType(part)}
      title={error}
      className={`${baseClass} ${PAPER_INPUT_TEXT_CLASS} inline-block h-7 min-w-0 overflow-hidden border-0 bg-transparent ${inputPaddingClass()} ${inputAlignClass(part)} align-baseline leading-7 outline-none ${readonlyClass} ${error ? "text-red-700" : ""} ${underlineClass(part, inTable)}`}
      style={inputWidth(part)}
    />
  );
}

function formattedNumberValue(value: string, part: QcPaperSlotPart) {
  const precision = part.precision;
  if (part.valueType !== "number" || precision == null || !Number.isInteger(precision) || precision < 0 || precision > 10) return value;
  const number = Number(String(value).trim());
  if (!Number.isFinite(number)) return value;
  const rounded = applyNumberFormat(number, precision, part.numberFormat);
  return Object.is(rounded, -0) ? (0).toFixed(precision) : rounded.toFixed(precision);
}

function applyNumberFormat(value: number, precision: number, format?: string) {
  const scale = 10 ** precision;
  if (format === "ceil") return Math.ceil(value * scale) / scale;
  if (format === "floor") return Math.floor(value * scale) / scale;
  if (format === "truncate") return Math.trunc(value * scale) / scale;
  if (format === "round_half_even") return roundHalfEven(value, precision);
  return Math.round(value * scale) / scale;
}

function roundHalfEven(value: number, precision: number) {
  const scale = 10 ** precision;
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
  if (diff > 0.5 + epsilon) return (floor + 1) / scale;
  if (diff < 0.5 - epsilon) return floor / scale;
  return (floor % 2 === 0 ? floor : floor + 1) / scale;
}

export function QcPaperSelectInput({
  part,
  options = [],
  readOnly,
  value,
  onChange,
  inTable,
}: {
  part: QcPaperSlotPart;
  options?: string[];
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  inTable?: boolean;
}) {
  const error = qcRangeError(part, value ?? part.defaultValue);
  const currentValue = value ?? part.defaultValue ?? "";
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const display = options.find((option) => option === currentValue) || currentValue || "";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(nextValue: string) {
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <span
      ref={rootRef}
      className={`${inTable ? "mx-0" : "mx-1"} relative inline-flex h-7 items-center justify-center align-baseline ${selectRootBorderClass(part, inTable)} ${error ? "text-red-700" : ""}`}
      style={selectWidth(part)}
    >
      <button
        type="button"
        aria-label={part.fieldKey || part.field || part.name || "选择项"}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-field-key={part.fieldKey || part.field || part.name}
        disabled={readOnly || part.readonlyDisplay}
        onClick={() => setOpen((current) => !current)}
        className={`${PAPER_INPUT_TEXT_CLASS} h-7 w-full border-0 bg-transparent px-0.5 ${inputAlignClass(part)} font-normal leading-7 outline-none disabled:cursor-default disabled:opacity-100`}
      >
        {display || "\u00A0"}
      </button>
      {open && !readOnly && !part.readonlyDisplay ? (
        <span className="absolute left-0 top-[calc(100%+0.25rem)] z-50 block min-w-full border border-slate-200 bg-white p-1 font-sans" role="listbox">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === currentValue}
              onClick={() => choose(option)}
              className={`block w-full whitespace-nowrap px-2 py-1 text-center text-xs ${option === currentValue ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {option}
            </button>
          ))}
        </span>
      ) : null}
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
  const name = type === "radio" ? fieldKey : undefined;
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 align-middle">
      {options.map((option) => {
        const checked = type === "checkbox" ? String(value || "").split(",").includes(option) : value === option;
        return (
          <label key={option} className={`inline-flex items-center gap-1 whitespace-nowrap ${disabled ? "cursor-default" : "cursor-pointer"}`}>
            <input
              type={type}
              name={name}
              value={option}
              checked={checked}
              disabled={disabled}
              data-field-key={fieldKey}
              onChange={(event) => {
                if (type === "radio") {
                  onChange?.(event.target.value);
                  return;
                }
                const current = new Set(String(value || "").split(",").filter(Boolean));
                if (event.target.checked) current.add(option);
                else current.delete(option);
                onChange?.([...current].join(","));
              }}
              className="h-3.5 w-3.5 accent-slate-950"
            />
            <span>{option}</span>
          </label>
        );
      })}
    </span>
  );
}
