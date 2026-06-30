"use client";

import type { DocumentPreviewProps, EditorBlock, EditorInline } from "./types";

const PAPER_FONT_FAMILY = "\"FangSong\", \"仿宋\", \"STFangsong\", serif";

export default function DocumentPreview({ document, values, toolbar }: DocumentPreviewProps) {
  return (
    <div className="space-y-3">
      {toolbar}
      <div
        className="mx-auto min-h-[960px] w-full max-w-[794px] bg-white px-14 py-12 text-[14px] leading-7 text-slate-950 shadow-sm ring-1 ring-slate-200"
        style={{ fontFamily: PAPER_FONT_FAMILY }}
      >
        {document.blocks.map((block, index) => renderBlock(block, values ?? {}, index))}
      </div>
    </div>
  );
}

function renderBlock(block: EditorBlock, values: Record<string, unknown>, blockIndex: number) {
  const blockKey = block.id || `block-${blockIndex}`;
  if (block.type === "heading") {
    const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
    return <Tag key={blockKey} className={headingClassName(block)}>{block.text}</Tag>;
  }
  if (block.type === "paragraph") {
    return <p key={blockKey} className={paragraphClassName(block)}>{block.parts.map((part, index) => renderInline(part, values, `${blockKey}:inline-${index}`))}</p>;
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
    <table key={blockKey} className="my-3 w-full border-collapse text-sm">
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={row.id || `${blockKey}:row-${rowIndex}`}>
            {row.cells.map((cell, cellIndex) => {
              const Cell = cell.header ? "th" : "td";
              const cellKey = cell.id || `${blockKey}:cell-${rowIndex}-${cellIndex}`;
              return (
                <Cell key={cellKey} colSpan={cell.colspan} rowSpan={cell.rowspan} className="border border-slate-500 px-2 py-1 text-center align-middle">
                  {cell.parts.map((part, index) => renderInline(part, values, `${cellKey}:inline-${index}`))}
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
  return block.metadata?.qcRole === "abnormalCode" ? "min-h-7 pl-0 text-left indent-0" : "min-h-7";
}

function renderInline(part: EditorInline, values: Record<string, unknown>, key: string) {
  if (part.type === "text") return <span key={key}>{part.text}</span>;
  if (isChoiceSlot(part)) {
    const value = part.fieldKey ? values[part.fieldKey] : undefined;
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
  const value = part.fieldKey ? values[part.fieldKey] : undefined;
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
