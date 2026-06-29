"use client";
import { useEffect, useRef, useState } from "react";
import { InputSurface } from "@workspace/core/ui";
import type { QcLayoutPart } from "@workspace/production/server/qc";

const PAPER_INPUT_TEXT_CLASS = "text-[15px]";

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

function selectRootBorderClass(part: QcLayoutPart, inTable?: boolean) {
  if (inTable || part.underline !== true) return "!border-0";
  return "border-b border-slate-950";
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
  inTable?: boolean;
}) {
  const currentValue = value ?? part.defaultValue ?? "";
  const error = qcRangeError(part, currentValue);
  const isReadOnly = readOnly || part.readonlyDisplay || !onChange;
  if (part.multiline || part.inputType === "textarea") {
    return (
      <InputSurface
        spec={{ valueType: "string", control: "text", multiline: true }}
        ariaLabel={part.fieldKey || part.field || part.name || "填写项"}
        dataFieldKey={part.fieldKey || part.field || part.name}
        value={currentValue}
        onChange={(next) => onChange?.(String(next ?? ""))}
        placeholder={part.placeholder}
        readOnly={isReadOnly}
        rows={part.rows || 2}
        title={error}
        resize="vertical"
      />
    );
  }
  if (part.inputType === "date") {
    return (
      <InputSurface
        spec={{ valueType: "date", control: "temporal", precision: "date" }}
        value={currentValue}
        onChange={(next) => onChange?.(String(next ?? ""))}
        placeholder={part.placeholder}
        readOnly={isReadOnly}
        title={error}
      />
    );
  }
  return (
    <InputSurface
      spec={{ valueType: part.inputType === "number" ? "number" : "string", control: "text" }}
      ariaLabel={part.fieldKey || part.field || part.name || "填写项"}
      dataFieldKey={part.fieldKey || part.field || part.name}
      value={currentValue}
      onChange={(next) => onChange?.(String(next ?? ""))}
      placeholder={part.placeholder}
      readOnly={isReadOnly}
      inputMode={part.inputType === "number" ? "decimal" : undefined}
      type="text"
      title={error}
      textAlign="center"
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
      className={`${inTable ? "mx-0" : "mx-1"} relative inline-flex h-7 items-center justify-center align-middle ${selectRootBorderClass(part, inTable)} ${error ? "text-red-700" : ""}`}
    >
      <button
        type="button"
        aria-label={part.fieldKey || part.field || part.name || "选择项"}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-field-key={part.fieldKey || part.field || part.name}
        disabled={readOnly || part.readonlyDisplay}
        onClick={() => setOpen((current) => !current)}
        className={`${PAPER_INPUT_TEXT_CLASS} h-7 w-full border-0 bg-transparent px-0.5 text-center font-normal tabular-nums leading-7 outline-none disabled:cursor-default disabled:opacity-100`}
      >
        {display || "\u00A0"}
      </button>
      {open && !readOnly && !part.readonlyDisplay ? (
        <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 min-w-full border border-slate-200 bg-white p-1 font-sans" role="listbox">
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
        </div>
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
  return (
    <InputSurface
      spec={{
        valueType: "string",
        control: "choice", presentation: "choice",
        state: disabled ? "disabled" : "normal",
        options: {
          source: "static",
          items: options.map((option) => ({ value: option, label: option })),
        },
      }}
      value={value}
      dataFieldKey={fieldKey}
      choiceType={type}
      choiceName={type === "radio" ? fieldKey : undefined}
      onChange={(next) => onChange?.(String(next ?? ""))}
    />
  );
}
