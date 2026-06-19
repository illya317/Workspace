"use client";
import type { CSSProperties, ChangeEvent } from "react";
import { SelectField } from "@workspace/core/ui";
import type { QcLayoutPart } from "@/server/services/production/qc";

const PAPER_INPUT_TEXT_CLASS = "text-[15px]";

function visualLength(value: string) {
  return Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
}

function fitContentWidth(value?: string, fallback = "1.5rem"): CSSProperties {
  const displayValue = String(value || "");
  if (!displayValue) return { width: fallback, minWidth: fallback };
  const contentCh = Math.min(48, Math.max(3, visualLength(displayValue) + 2));
  return { width: `calc(${contentCh}ch + 0.75rem)`, minWidth: fallback, maxWidth: "100%" };
}

function underlineBaseWidth(part: QcLayoutPart) {
  return part.width || "3rem";
}

function looksNumericValue(value?: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^[-+]?[\d.,]+$/.test(text);
}

function inputAlignClass(part: QcLayoutPart, value?: string) {
  if (part.underline === true && looksNumericValue(value)) return "text-right tabular-nums";
  return "text-center tabular-nums";
}

function inputPaddingClass(part: QcLayoutPart, value?: string) {
  if (part.underline === true && looksNumericValue(value)) return "pl-0.5 pr-0";
  return "px-1";
}

function inputWidth(part: QcLayoutPart, inTable?: boolean, value?: string): CSSProperties {
  const current = String(value || "");
  if (part.underline === true) return fitContentWidth(current, underlineBaseWidth(part));
  return fitContentWidth(value);
}

function selectWidth(part: QcLayoutPart, _options: string[], value?: string, inTable?: boolean): CSSProperties {
  const current = value || part.defaultValue || "";
  if (part.underline === true) return { ...fitContentWidth(current, underlineBaseWidth(part)), backgroundImage: "none" };
  const fallback = inTable ? "2.5rem" : "3rem";
  return { ...fitContentWidth(current, fallback), backgroundImage: "none" };
}

export function qcRangeLabel(part: QcLayoutPart) {
  const range = part.recommendedRange;
  if (!range) return "";
  if (range.min != null && range.max != null) return range.min === range.max ? String(range.min) : `${range.min}～${range.max}`;
  if (range.min != null) return `≥${range.min}`;
  if (range.max != null) return `≤${range.max}`;
  return "";
}

export function qcRangeError(part: QcLayoutPart, value?: string) {
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

function underlineClass(_part: QcLayoutPart) {
  return _part.underline === true ? "border-b border-slate-950" : "border-b-0";
}

function textInputType(part: QcLayoutPart) {
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
  part: QcLayoutPart;
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  inTable?: boolean;
}) {
  const currentValue = value ?? part.defaultValue ?? "";
  const error = qcRangeError(part, currentValue);
  const baseClass = inTable ? "mx-0" : "mx-1";
  const readonlyClass = readOnly || part.readonlyDisplay ? "cursor-default text-slate-900" : "";
  const valueProps = onChange
    ? { value: currentValue, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) }
    : { defaultValue: part.defaultValue };
  if (part.multiline || part.inputType === "textarea") {
    return (
      <textarea
        aria-label={part.fieldKey || part.field || part.name || "填写项"}
        data-field-key={part.fieldKey || part.field || part.name}
        {...valueProps}
        placeholder={part.placeholder}
        readOnly={readOnly || part.readonlyDisplay}
        rows={part.rows || 2}
        title={error}
        className={`${baseClass} ${PAPER_INPUT_TEXT_CLASS} inline-block min-w-[8em] resize-y border-0 bg-transparent ${inputPaddingClass(part, currentValue)} ${inputAlignClass(part, currentValue)} align-middle leading-7 outline-none ${readonlyClass} ${error ? "text-red-700" : ""} ${underlineClass(part)}`}
        style={inputWidth(part, inTable, currentValue)}
      />
    );
  }
  return (
    <input
      aria-label={part.fieldKey || part.field || part.name || "填写项"}
      data-field-key={part.fieldKey || part.field || part.name}
      {...valueProps}
      placeholder={part.placeholder}
      readOnly={readOnly || part.readonlyDisplay}
      inputMode={part.inputType === "number" ? "decimal" : undefined}
      type={textInputType(part)}
      title={error}
      className={`${baseClass} ${PAPER_INPUT_TEXT_CLASS} inline-block h-7 min-w-[4.5em] border-0 bg-transparent ${inputPaddingClass(part, currentValue)} ${inputAlignClass(part, currentValue)} align-middle leading-7 outline-none ${readonlyClass} ${error ? "text-red-700" : ""} ${underlineClass(part)}`}
      style={inputWidth(part, inTable, currentValue)}
    />
  );
}

export function QcPaperSelectInput({
  part,
  options = [],
  readOnly,
  value,
  onChange,
  inTable,
}: {
  part: QcLayoutPart;
  options?: string[];
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  inTable?: boolean;
}) {
  const error = qcRangeError(part, value ?? part.defaultValue);
  return (
    <SelectField
      ariaLabel={part.fieldKey || part.field || part.name || "选择项"}
      dataFieldKey={part.fieldKey || part.field || part.name}
      value={value ?? part.defaultValue ?? ""}
      onChange={(nextValue) => onChange?.(nextValue)}
      disabled={readOnly || part.readonlyDisplay}
      placeholder=" "
      options={options.map((option) => ({ value: option, label: option }))}
      className={`${inTable ? "mx-0" : "mx-1"} inline-block align-middle`}
      selectClassName={`${PAPER_INPUT_TEXT_CLASS} h-7 min-h-7 rounded-none border-0 bg-transparent px-0.5 text-center tabular-nums leading-7 shadow-none disabled:opacity-100 ${error ? "text-red-700" : ""} ${underlineClass(part)}`}
      style={selectWidth(part, options, value ?? part.defaultValue, inTable)}
    />
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
