"use client";

import type { CSSProperties } from "react";
import type { QcLayoutBlock } from "@workspace/production/server/qc";
import { CellContent } from "./qc-layout-table/cell-content";
import { Part } from "./qc-layout-table/parts";
import type { LayoutRenderContext } from "./qc-layout-table/types";

const TABLE_BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";
const SIGNATURE_COL_WIDTHS = ["12%", "10%", "8%", "20%", "12%", "10%", "8%", "20%"];

export { Part };
export type { LayoutRenderContext };

function SignatureFooterBlock({ block, context, className = "" }: { block: QcLayoutBlock; context: LayoutRenderContext; className?: string }) {
  const row = block.rows?.[0] || [];
  if (!row.length) return null;
  return (
    <div
      className={`${TABLE_BODY_TEXT_CLASS} qc-signature-grid mb-4 grid w-full border-l border-t border-slate-950 ${className}`}
    >
      {row.map((cell, index) => (
        <div
          key={`${cell.rawText || cell.parts.map((part) => part.fieldKey || part.field || part.type).join("-")}-${index}`}
          className={`flex min-h-12 min-w-0 items-center justify-center border-b border-r border-slate-950 px-1.5 py-1 text-center leading-7 ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
        >
          <span className="inline-flex min-w-0 max-w-full items-center justify-center whitespace-nowrap">
            <CellContent cell={cell} context={context} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function TableBlock({
  block,
  className = "",
  context,
}: {
  block: QcLayoutBlock;
  className?: string;
  context: LayoutRenderContext;
}) {
  if (!block.rows?.length) return null;
  if (block.label === "test_signature_footer") {
    return <SignatureFooterBlock block={block} context={context} className={className} />;
  }
  const marginClass = block.compactTable ? "mb-0" : "mb-4";

  return (
    <table className={`${marginClass} w-full table-fixed border-collapse ${TABLE_BODY_TEXT_CLASS} ${className}`}>
      {block.columnWidths?.length ? (
        <colgroup>
          {block.columnWidths.map((width, index) => <col key={`${width}-${index}`} style={{ width }} />)}
        </colgroup>
      ) : null}
      <tbody>
        {block.rows.map((row, rowIndex) => {
          const isTableTitleRow = row.length === 1 && row[0]?.bold && !row[0]?.header;
          const isSignatureRow = row.some((item) => item.rawText === "检验者") && row.some((item) => item.rawText === "复核者");
          const explicitRowHeight = block.rowHeights?.[rowIndex];
          return (
            <tr key={rowIndex} style={explicitRowHeight ? { height: explicitRowHeight } : undefined}>
              {row.map((cell, cellIndex) => {
                const Tag = cell.header ? "th" : "td";
                const textAlign = (cell.align || (isTableTitleRow ? "left" : "center")) as CSSProperties["textAlign"];
                const width = cell.width || (isSignatureRow ? SIGNATURE_COL_WIDTHS[cellIndex] : undefined);
                return (
                  <Tag
                    key={`${rowIndex}-${cellIndex}`}
                    colSpan={cell.colspan}
                    rowSpan={cell.rowspan}
                    className={`border border-slate-950 align-middle ${isSignatureRow ? "px-1 py-1 leading-7" : "px-2 py-1.5"} ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""} ${cell.className || ""}`}
                    style={{ textAlign, width }}
                  >
                    <CellContent cell={cell} context={context} />
                  </Tag>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
