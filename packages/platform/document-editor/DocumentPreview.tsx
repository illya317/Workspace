"use client";

import type { DocumentPreviewProps, EditorBlock, EditorInline } from "./types";

export default function DocumentPreview({ document, values, toolbar }: DocumentPreviewProps) {
  return (
    <div className="space-y-3">
      {toolbar}
      <div className="mx-auto min-h-[960px] w-full max-w-[794px] bg-white px-14 py-12 text-[14px] leading-7 text-slate-950 shadow-sm ring-1 ring-slate-200">
        {document.blocks.map((block, index) => renderBlock(block, values ?? {}, index))}
      </div>
    </div>
  );
}

function renderBlock(block: EditorBlock, values: Record<string, unknown>, blockIndex: number) {
  const blockKey = block.id || `block-${blockIndex}`;
  if (block.type === "heading") {
    const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
    return <Tag key={blockKey} className="mb-3 font-semibold">{block.text}</Tag>;
  }
  if (block.type === "paragraph") {
    return <p key={blockKey} className="min-h-7">{block.parts.map((part, index) => renderInline(part, values, `${blockKey}:inline-${index}`))}</p>;
  }
  if (block.type === "attachment") {
    return <p key={blockKey} className="min-h-7"><strong>{block.title}</strong>：{block.text}</p>;
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
                <Cell key={cellKey} colSpan={cell.colspan} rowSpan={cell.rowspan} className="border border-slate-500 px-2 py-1 align-middle">
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

function renderInline(part: EditorInline, values: Record<string, unknown>, key: string) {
  if (part.type === "text") return <span key={key}>{part.text}</span>;
  const value = part.fieldKey ? values[part.fieldKey] : undefined;
  const label = value == null || value === "" ? (part.label ?? part.fieldKey ?? "") : String(value);
  return (
    <span
      key={key}
      className="mx-1 inline-flex min-h-5 items-end border-b border-slate-500 px-1 text-center text-slate-700"
      style={{ minWidth: part.width ?? 96 }}
    >
      {label}{part.unit ? ` ${part.unit}` : ""}
    </span>
  );
}
