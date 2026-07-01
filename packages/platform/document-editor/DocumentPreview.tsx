"use client";

import type { CSSProperties } from "react";
import type { DocumentPreviewProps, EditorBlock, EditorInline } from "./types";

const PAPER_FONT_FAMILY = "\"FangSong\", \"仿宋\", \"STFangsong\", serif";

type RenderContext = {
  values: Record<string, unknown>;
  renderSlot?: DocumentPreviewProps["renderSlot"];
  inTable: boolean;
};

export default function DocumentPreview({ document, values, toolbar, renderSlot }: DocumentPreviewProps) {
  const context: RenderContext = { values: values ?? {}, renderSlot, inTable: false };
  return (
    <div className="space-y-3">
      {toolbar}
      <div
        className="mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white px-[16mm] py-[15mm] text-[13px] leading-7 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.10),0_16px_38px_rgba(15,23,42,0.12)]"
        style={{ fontFamily: PAPER_FONT_FAMILY }}
      >
        {document.blocks.map((block, index) => renderBlock(block, context, index))}
      </div>
    </div>
  );
}

function renderBlock(block: EditorBlock, context: RenderContext, blockIndex: number) {
  const blockKey = block.id || `block-${blockIndex}`;
  if (block.type === "heading") {
    const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
    return <Tag key={blockKey} className={headingClassName(block)}>{block.text}</Tag>;
  }
  if (block.type === "paragraph") {
    return <p key={blockKey} className={paragraphClassName(block)}>{block.parts.map((part, index) => renderInline(part, context, `${blockKey}:inline-${index}`))}</p>;
  }
  if (block.type === "attachment") {
    return <p key={blockKey} className="min-h-7"><strong>{block.title}</strong>：{block.text}</p>;
  }
  if (block.type === "pageBreak") {
    return (
      <div key={blockKey} className="my-5 flex items-center gap-3 text-[11px] font-medium text-slate-400">
        <span className="h-px flex-1 border-t border-dashed border-slate-300" />
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">分页</span>
        <span className="h-px flex-1 border-t border-dashed border-slate-300" />
      </div>
    );
  }
  return (
    <table key={blockKey} className="my-4 w-full table-fixed border-collapse text-[14px] leading-7">
      {block.columnWidths?.length ? (
        <colgroup>
          {block.columnWidths.map((width, index) => <col key={`${blockKey}:col-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={row.id || `${blockKey}:row-${rowIndex}`} style={row.height ? { height: row.height } : undefined}>
            {row.cells.map((cell, cellIndex) => {
              const Cell = cell.header ? "th" : "td";
              const cellKey = cell.id || `${blockKey}:cell-${rowIndex}-${cellIndex}`;
              return (
                <Cell
                  key={cellKey}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-500 px-2 py-1 text-center align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
                  style={{ textAlign: cellTextAlign(cell.align), width: cell.width }}
                >
                  {cell.parts.map((part, index) => renderInline(part, { ...context, inTable: true }, `${cellKey}:inline-${index}`))}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function headingClassName(block: Extract<EditorBlock, { type: "heading" }>) {
  const align = block.level === 1 || block.metadata?.qcRole === "stageHeading" ? " text-center" : "";
  if (block.level === 1) return `mb-4 mt-2 text-[22px] font-bold leading-9${align}`;
  if (block.level === 2) return `mb-3 mt-4 text-[18px] font-bold leading-8${align}`;
  if (block.level === 3) return `mb-2 mt-3 text-[16px] font-bold leading-7${align}`;
  return `mb-2 mt-2 text-[14px] font-semibold leading-7${align}`;
}

function paragraphClassName(block: Extract<EditorBlock, { type: "paragraph" }>) {
  return block.metadata?.qcRole === "abnormalCode" ? "my-1 min-h-7 pl-0 text-left indent-0" : "my-1 min-h-7";
}

function renderInline(part: EditorInline, context: RenderContext, key: string) {
  if (part.type === "text") return <span key={key}>{part.bold || part.marks?.bold ? <strong>{part.text}</strong> : part.text}</span>;
  const value = part.fieldKey ? context.values[part.fieldKey] : undefined;
  const customSlot = context.renderSlot?.({ part, value, key, inTable: context.inTable });
  if (customSlot != null) return <span key={key}>{customSlot}</span>;
  if (isChoiceSlot(part)) {
    return (
      <span key={key} title={slotTitle(part)} className="inline-block whitespace-nowrap text-slate-950 align-baseline">
        {part.options.map((option) => (
          <span key={`${key}:${option}`} className="mr-6 inline-block whitespace-nowrap last:mr-0">
            {choiceMark(value, option)}{option}
          </span>
        ))}
      </span>
    );
  }
  const label = value == null || value === "" ? visibleSlotLabel(part) : String(value);
  return (
    <span
      key={key}
      title={slotTitle(part)}
      className="mx-1 inline-block max-w-full overflow-hidden whitespace-nowrap border-b border-slate-500 px-1 leading-[1.25] text-slate-700 align-baseline"
      style={{ width: `min(${cssSlotWidth(part.width)}, 100%)`, maxWidth: "100%", textAlign: slotTextAlign(part.align) }}
    >
      {label}
    </span>
  );
}

function isChoiceSlot(part: Exclude<EditorInline, { type: "text" }>): part is Exclude<EditorInline, { type: "text" }> & { options: string[] } {
  return part.type === "fieldSlot"
    && (part.inputType === "radio" || part.inputType === "checkbox")
    && Array.isArray(part.options)
    && part.options.length > 0;
}

function choiceMark(value: unknown, option: string) {
  const selected = Array.isArray(value)
    ? value.map(String).includes(option)
    : value != null && String(value) === option;
  return selected ? "☑" : "□";
}

function slotTextAlign(value: string | undefined) {
  if (value === "right") return "right";
  if (value === "left") return "left";
  return "center";
}

function cellTextAlign(value: string | undefined): CSSProperties["textAlign"] {
  if (value === "left" || value === "right" || value === "center" || value === "justify") return value;
  return "center";
}

function cssSlotWidth(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) return value.trim();
  return "3rem";
}

function technicalToken(value: unknown) {
  return typeof value === "string" && (
    value.includes("/")
    || value.includes("_")
    || /^[a-z][a-z0-9.-]*$/i.test(value)
  );
}

function visibleSlotLabel(part: Extract<EditorInline, { fieldKey: string }>) {
  const alias = part.alias?.trim();
  if (alias) return alias;
  const label = part.label?.trim();
  if (label && !technicalToken(label)) return label;
  const placeholder = part.placeholder?.trim();
  if (placeholder && !technicalToken(placeholder)) return placeholder;
  return "";
}

function slotTitle(part: Extract<EditorInline, { fieldKey: string }>) {
  return [part.label, part.fieldKey].filter(Boolean).join(" · ");
}
