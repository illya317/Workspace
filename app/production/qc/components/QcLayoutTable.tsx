"use client";

import { useEffect, type CSSProperties } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";
import { QcPaperChoiceInput, QcPaperLineInput, QcPaperSelectInput, qcRangeError, qcRangeLabel } from "./QcPaperInputs";
import { QcPaperDateInput } from "./QcPaperDateInput";
import { MicrobialSelectedTotalPart } from "./QcMicrobialComputedParts";
import type { QcFieldValues } from "./useQcFormulaEngine";
export interface LayoutRenderContext {
  test?: QcTemplateTestItem;
  values: QcFieldValues;
  onFieldChange: (key: string, value: string) => void;
  fieldByName: Map<string, QcTemplateMethodField>;
  fieldByKey: Map<string, QcTemplateMethodField>;
  sectionAliases?: Record<string, string>;
  inTable?: boolean;
}

function defaultValueForPart(part: QcLayoutPart, test?: QcTemplateTestItem) {
  if (part.defaultValue) return part.defaultValue;
  if (part.field === "重量差异限度") return test?.standardText?.match(/±\s*([\d.]+)\s*%/)?.[1];
  return undefined;
}

function resolvePartField(
  part: QcLayoutPart,
  test: QcTemplateTestItem | undefined,
  fieldByName: Map<string, QcTemplateMethodField>,
  fieldByKey: Map<string, QcTemplateMethodField>,
) {
  const occurrence = Math.max(1, part.occurrence || 1);
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const matches = part.field ? fields.filter((candidate) => candidate.name === part.field) : [];
  const field = part.field && occurrence > 1 ? matches[occurrence - 1] : part.field ? fieldByName.get(part.field) : undefined;
  const key = part.fieldKey || field?.fieldKey || part.field || part.name || "";
  return { key, field: fieldByKey.get(key) || field };
}

function parseDateValue(value?: string) {
  const parts = String(value || "").slice(0, 10).split("-");
  if (parts.length !== 3) return undefined;
  const [year, month, day] = parts.map((part) => Number(part));
  if (![year, month, day].every(Number.isFinite)) return undefined;
  return Date.UTC(year, month - 1, day);
}

function parseDateHourValue(dateValue?: string, hourValue?: string) {
  const date = parseDateValue(dateValue);
  const hour = Number(String(hourValue || "").replace(/\D/g, ""));
  if (date == null || !Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
  return date + hour * 60 * 60 * 1000;
}

function durationValue(part: QcLayoutPart, values: QcFieldValues, unit: "days" | "hours") {
  const startKey = part.startKey;
  const endKey = part.endKey;
  if (!startKey || !endKey) return "";
  if (unit === "days") {
    const start = parseDateValue(values[startKey]);
    const end = parseDateValue(values[endKey]);
    return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 86400000)));
  }
  const start = parseDateHourValue(values[startKey], values[part.startHourKey || `${startKey}_hour`]);
  const end = parseDateHourValue(values[endKey], values[part.endHourKey || `${endKey}_hour`]);
  return start == null || end == null ? "" : String(Math.max(0, Math.round((end - start) / 3600000)));
}

function DurationPart({ part, context, unit }: { part: QcLayoutPart; context: LayoutRenderContext; unit: "days" | "hours" }) {
  const key = part.fieldKey || part.field || part.name || "";
  const computed = durationValue(part, context.values, unit);
  const value = computed || context.values[key] || "";
  const error = qcRangeError(part, value);
  useEffect(() => {
    if (key && computed && context.values[key] !== computed) context.onFieldChange(key, computed);
  }, [computed, context, key]);
  return (
    <span
      data-field-key={key}
      title={error}
      className={`mx-1 inline-block min-w-[3em] text-center align-baseline ${error ? "text-red-700" : ""} ${value ? "" : "text-slate-400"}`}
      style={{ width: part.width || "4em" }}
    >
      {value || part.placeholder || qcRangeLabel(part)}
    </span>
  );
}

function stripPlaceholder(text: string) {
  return text.replace(/\s*[＿_]{2,}\s*[。.]?/g, "");
}

function testValue(part: QcLayoutPart, test?: QcTemplateTestItem) {
  const path = part.path || part.field || "";
  let value = "";
  if (path === "standard") value = test?.standardText || "";
  else if (path === "name") value = test?.name || "";
  else if (path === "method") value = test?.methodName || "";
  if (!value) value = part.defaultValue || "";
  return part.stripPlaceholder ? stripPlaceholder(value) : value;
}

function isCompactFormCell(cell: QcLayoutCell) {
  const isFormPart = (part: QcLayoutPart) => ["line", "field", "select", "date", "duration_days", "duration_hours", "radio", "checkbox", "microbial_selected_total"].includes(part.type);
  if (!cell.parts.some(isFormPart)) return false;
  const textLength = cell.parts.filter((part) => !isFormPart(part)).map((part) => part.text || part.defaultValue || part.name || "").join("").trim().length;
  return !cell.rawText?.trim() && textLength <= 12;
}

function joinSectionSuffix(base?: string, suffix?: string) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function sectionHeadingText(part: QcLayoutPart, context: LayoutRenderContext) {
  const aliases = context.sectionAliases || {};
  const suffix = part.sectionRef ? joinSectionSuffix(aliases[part.sectionRef], part.sectionSuffix) : part.sectionSuffix;
  const section = context.test?.sequence && suffix ? `${context.test.sequence}.${suffix}` : suffix;
  return section ? `${section} ${part.text || ""}` : part.text;
}

export function Part({ part, context }: { part: QcLayoutPart; context: LayoutRenderContext }) {
  const { test, values, onFieldChange, fieldByName, fieldByKey } = context;
  if (part.type === "br") return <br />;
  if (part.type === "duration_days") return <DurationPart part={part} context={context} unit="days" />;
  if (part.type === "duration_hours") return <DurationPart part={part} context={context} unit="hours" />;
  if (part.type === "microbial_selected_total") return <MicrobialSelectedTotalPart part={part} context={context} />;
  if (part.type === "test_value") return <span>{testValue(part, test)}</span>;
  if (part.type === "section_heading") {
    const text = sectionHeadingText(part, context);
    return part.bold ? <strong>{text}</strong> : <span>{text}</span>;
  }
  if (part.type === "line" || part.type === "field" || part.type === "select") {
    const { key, field } = resolvePartField(part, test, fieldByName, fieldByKey);
    const mergedPart = { ...part, fieldKey: key, defaultValue: defaultValueForPart(part, test) || field?.defaultValue };
    const fieldType = part.type === "select" ? "select" : part.inputType || field?.type;
    if (fieldType === "radio" || fieldType === "checkbox") {
      return (
        <QcPaperChoiceInput
          fieldKey={key}
          options={part.options?.length ? part.options : field?.options}
          type={fieldType}
          disabled={part.readonlyDisplay || field?.attr === "calculated"}
          value={values[key]}
          onChange={(value) => onFieldChange(key, value)}
        />
      );
    }
    if (fieldType === "select" || (!!part.options?.length && fieldType !== "radio" && fieldType !== "checkbox")) {
      return (
        <QcPaperSelectInput
          part={mergedPart}
          options={part.options?.length ? part.options : field?.options}
          readOnly={part.readonlyDisplay || field?.attr === "calculated"}
          value={values[key]}
          onChange={(value) => onFieldChange(key, value)}
          inTable={context.inTable}
        />
      );
    }
    return (
      <QcPaperLineInput
        part={mergedPart}
        readOnly={part.readonlyDisplay || field?.attr === "calculated"}
        value={values[key]}
        onChange={(value) => onFieldChange(key, value)}
        inTable={context.inTable}
      />
    );
  }
  if (part.type === "date") {
    const key = part.fieldKey || part.field || part.name || "date";
    return <QcPaperDateInput part={{ ...part, fieldKey: key }} value={values[key]} onChange={(value) => onFieldChange(key, value)} readOnly={part.readonlyDisplay} />;
  }
  if (part.type === "radio" || part.type === "checkbox") {
    const { key, field } = resolvePartField(part, test, fieldByName, fieldByKey);
    return <QcPaperChoiceInput fieldKey={key} options={part.options?.length ? part.options : field?.options} type={part.type} disabled={part.readonlyDisplay || field?.attr === "calculated"} value={values[key]} onChange={(value) => onFieldChange(key, value)} />;
  }
  if (part.type === "param") return <span>{part.defaultValue || part.name}</span>;
  if (part.type === "note" || part.type === "hint") return <span className="text-slate-700">{part.text}</span>;
  return part.bold ? <strong>{part.text}</strong> : <span>{part.text}</span>;
}

function CellContent({ cell, context }: { cell: QcLayoutCell; context: LayoutRenderContext }) {
  if (cell.parts.length === 0) return cell.rawText ? <span>{cell.rawText}</span> : <span>&nbsp;</span>;
  const cellContext = { ...context, inTable: true };
  const content = cell.parts.map((part, index) => <Part key={`${part.fieldKey || part.field || part.text || part.type}-${index}`} part={part} context={cellContext} />);
  if (!isCompactFormCell(cell)) return <>{content}</>;
  return <span className={`flex min-h-8 w-full flex-wrap items-baseline ${cell.align === "left" ? "justify-start" : cell.align === "right" ? "justify-end" : "justify-center"} gap-x-0.5 gap-y-1`}>{content}</span>;
}

export function TableBlock({ block, className = "", context }: { block: QcLayoutBlock; className?: string; context: LayoutRenderContext }) {
  if (!block.rows?.length) return null;
  return (
    <table className={`mb-4 w-full table-fixed border-collapse text-[15px] leading-7 text-slate-950 ${className}`}>
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => {
              const Tag = cell.header ? "th" : "td";
              const textAlign = (cell.align || "center") as CSSProperties["textAlign"];
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-950 px-2 py-1.5 align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
                  style={{ textAlign, width: cell.width }}
                >
                  <CellContent cell={cell} context={context} />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
