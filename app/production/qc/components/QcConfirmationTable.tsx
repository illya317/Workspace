"use client";

import type { QcLayoutBlock, QcLayoutCell } from "@/server/services/production/qc";
import { TableBlock, type LayoutRenderContext } from "./QcLayoutTable";

type NamedItem = { name: string };

interface Props {
  block: QcLayoutBlock & { displaySection?: string };
  context: LayoutRenderContext;
  fallback: string;
  items: NamedItem[];
  prefix: string;
  nameHeader: string;
}

const cell = (rawText: string, parts: QcLayoutCell["parts"] = []): QcLayoutCell => ({
  rawText,
  parts,
  colspan: 1,
  rowspan: 1,
  isEmpty: false,
});

export default function QcConfirmationTable({ block, context, fallback, items, prefix, nameHeader }: Props) {
  const records = items.length ? items : [{ name: fallback }];
  const title = `${block.displaySection ? `${block.displaySection} ` : ""}${block.title || fallback}`;
  return <TableBlock block={{ ...block, rows: [
    [{ ...cell(title), colspan: 4, bold: true, align: "left" }],
    [nameHeader, "批号", "有效期至", "是否确认"].map((text) => cell(text)),
    ...records.map((item, index) => [
      cell(item.name),
      cell("", [{ type: "line", fieldKey: `${prefix}/batch_no_${index + 1}`, width: "9rem" }]),
      cell("", [{ type: "date", fieldKey: `${prefix}/valid_until_${index + 1}` }]),
      cell("", [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ] }} context={context} />;
}
