"use client";

import type { CSSProperties } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";
import { QcPaperChoiceInput, QcPaperDateInput, QcPaperLineInput, QcPaperSelectInput } from "./QcPaperInputs";
import type { QcFieldValues } from "./useQcFormulaEngine";

export interface LayoutRenderContext {
  test?: QcTemplateTestItem;
  values: QcFieldValues;
  onFieldChange: (key: string, value: string) => void;
  fieldByName: Map<string, QcTemplateMethodField>;
  fieldByKey: Map<string, QcTemplateMethodField>;
}

function defaultValueForPart(part: QcLayoutPart, test?: QcTemplateTestItem) {
  if (part.defaultValue) return part.defaultValue;
  if (part.field === "重量差异限度") return test?.standardText?.match(/±\s*([\d.]+)\s*%/)?.[1];
  return undefined;
}

function resolvePartField(
  part: QcLayoutPart,
  fieldByName: Map<string, QcTemplateMethodField>,
  fieldByKey: Map<string, QcTemplateMethodField>,
) {
  const field = part.field ? fieldByName.get(part.field) : undefined;
  const key = part.fieldKey || field?.fieldKey || part.field || part.name || "";
  return { key, field: fieldByKey.get(key) || field };
}

export function Part({ part, context }: { part: QcLayoutPart; context: LayoutRenderContext }) {
  const { test, values, onFieldChange, fieldByName, fieldByKey } = context;
  if (part.type === "br") return <br />;
  if (part.type === "line" || part.type === "field" || part.type === "select") {
    const { key, field } = resolvePartField(part, fieldByName, fieldByKey);
    const mergedPart = { ...part, fieldKey: key, defaultValue: defaultValueForPart(part, test) || field?.defaultValue };
    const fieldType = part.type === "select" ? "select" : field?.type;
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
    if (fieldType === "select") {
      return (
        <QcPaperSelectInput
          part={mergedPart}
          options={part.options?.length ? part.options : field?.options}
          readOnly={part.readonlyDisplay || field?.attr === "calculated"}
          value={values[key]}
          onChange={(value) => onFieldChange(key, value)}
        />
      );
    }
    return (
      <QcPaperLineInput
        part={mergedPart}
        readOnly={part.readonlyDisplay || field?.attr === "calculated"}
        value={values[key]}
        onChange={(value) => onFieldChange(key, value)}
      />
    );
  }
  if (part.type === "date") {
    const key = part.fieldKey || part.field || part.name || "date";
    return <QcPaperDateInput part={{ ...part, fieldKey: key }} value={values[key]} onChange={(value) => onFieldChange(key, value)} />;
  }
  if (part.type === "radio" || part.type === "checkbox") {
    const { key, field } = resolvePartField(part, fieldByName, fieldByKey);
    return <QcPaperChoiceInput fieldKey={key} options={part.options?.length ? part.options : field?.options} type={part.type} disabled={part.readonlyDisplay || field?.attr === "calculated"} value={values[key]} onChange={(value) => onFieldChange(key, value)} />;
  }
  if (part.type === "param") return <span>{part.defaultValue || part.name}</span>;
  if (part.type === "note") return <span className="text-slate-700">{part.text}</span>;
  return <span>{part.text}</span>;
}

function CellContent({ cell, context }: { cell: QcLayoutCell; context: LayoutRenderContext }) {
  if (cell.parts.length === 0) return cell.rawText ? <span>{cell.rawText}</span> : <span>&nbsp;</span>;
  return <>{cell.parts.map((part, index) => <Part key={`${part.fieldKey || part.field || part.text || part.type}-${index}`} part={part} context={context} />)}</>;
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
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-950 px-2 py-1.5 align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""}`}
                  style={{ textAlign: cell.align as CSSProperties["textAlign"], width: cell.width }}
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
