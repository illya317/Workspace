import type { KeyboardEvent } from "react";
import { textOverflowTitle } from "../common/text-overflow";
import type { DataTableColumn } from "./DataTable.types";
import {
  resolveTableColumnClass,
  resolveTableDisclosureClass,
} from "./table-presentation";

function disclosureEdges<T>(columns: DataTableColumn<T>[], columnIndex: number) {
  const disclosure = columns[columnIndex]?.disclosure;
  if (!disclosure) return { start: false, end: false };
  const previousDisclosure = columns[columnIndex - 1]?.disclosure;
  const nextDisclosure = columns[columnIndex + 1]?.disclosure;
  return {
    start: previousDisclosure?.groupKey !== disclosure.groupKey,
    end: nextDisclosure?.groupKey !== disclosure.groupKey,
  };
}

export function disclosureColumnClass<T>(
  columns: DataTableColumn<T>[],
  columnIndex: number,
  surface: "header" | "body",
) {
  const column = columns[columnIndex];
  if (!column.disclosure) return "";
  return resolveTableDisclosureClass({
    axis: "column",
    role: column.disclosure.role,
    expanded: column.disclosure.role === "trigger" ? column.disclosure.expanded : true,
    surface,
    ...disclosureEdges(columns, columnIndex),
  });
}

export function DataTableDisclosureHeaderCell<T>({
  column,
  columnIndex,
  columns,
  headerCellClassName,
  pinnedClassName,
}: {
  column: DataTableColumn<T>;
  columnIndex: number;
  columns: DataTableColumn<T>[];
  headerCellClassName: string;
  pinnedClassName: string;
}) {
  return (
    <th
      title={textOverflowTitle(column.label)}
      onClick={column.onHeaderClick}
      onKeyDown={column.onHeaderClick
        ? (event) => activateFromKeyboard(event, column.onHeaderClick as () => void)
        : undefined}
      tabIndex={column.onHeaderClick ? 0 : undefined}
      aria-expanded={column.disclosure?.role === "trigger" ? column.disclosure.expanded : undefined}
      data-disclosure-axis={column.disclosure ? "column" : undefined}
      data-disclosure-role={column.disclosure?.role}
      data-disclosure-group={column.disclosure?.groupKey}
      className={`${headerCellClassName} ${resolveTableColumnClass(column)} ${pinnedClassName} ${disclosureColumnClass(columns, columnIndex, "header")} ${column.onHeaderClick ? "cursor-pointer select-none" : ""}`}
    >
      {column.label}
    </th>
  );
}

function activateFromKeyboard(
  event: KeyboardEvent<HTMLTableCellElement>,
  onHeaderClick: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onHeaderClick();
}
