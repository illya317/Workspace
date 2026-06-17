"use client";

import type { ReactNode } from "react";
import type { QcLayoutCell } from "@/server/services/production/qc";
import { isCompactFormCell, isFormLikePart, isShortUnitTextPart } from "./helpers";
import { Part } from "./parts";
import type { LayoutRenderContext } from "./types";

export function CellContent({ cell, context }: { cell: QcLayoutCell; context: LayoutRenderContext }) {
  if (cell.parts.length === 0) {
    if (!cell.rawText) return <span>&nbsp;</span>;
    if (cell.header || cell.bold) {
      return (
        <span
          className="inline-block"
          data-inline-feedback="true"
          data-inline-feedback-kind="heading"
          data-inline-feedback-key={`heading:${cell.rawText}`}
          data-inline-feedback-label={cell.rawText}
        >
          {cell.rawText}
        </span>
      );
    }
    return <span>{cell.rawText}</span>;
  }

  const cellContext = { ...context, inTable: true };
  const content: ReactNode[] = [];
  for (let index = 0; index < cell.parts.length; index += 1) {
    const part = cell.parts[index];
    const next = cell.parts[index + 1];
    const key = `${part.fieldKey || part.field || part.text || part.type}-${index}`;
    if (context.advancedMode && isFormLikePart(part) && isShortUnitTextPart(next)) {
      content.push(
        <span key={`${key}-unit`} className="inline-flex items-center whitespace-nowrap">
          <Part part={part} context={cellContext} />
          <Part part={next} context={cellContext} />
        </span>,
      );
      index += 1;
      continue;
    }
    content.push(<Part key={key} part={part} context={cellContext} />);
  }

  if (!isCompactFormCell(cell)) return <>{content}</>;
  return (
    <span
      className={`flex min-h-8 w-full ${context.advancedMode ? "items-center flex-wrap" : "items-baseline flex-wrap"} ${cell.align === "left" ? "justify-start" : cell.align === "right" ? "justify-end" : "justify-center"} gap-x-0.5 gap-y-1`}
    >
      {content}
    </span>
  );
}
