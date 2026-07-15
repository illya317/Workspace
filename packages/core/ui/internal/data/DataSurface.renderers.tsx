"use client";

import type { ReactNode } from "react";
import AmountCell from "./AmountCell";
import Badge, { badgeToneClassName } from "../common/Badge";
import DataTable from "./DataTable";
import { EmptyStateCard, MetricCard } from "../common/Card";
import DisclosureRecordCard from "../common/DisclosureRecordCard";
import type { DataTableColumn } from "./DataTable.types";
import NumberCell from "./NumberCell";
import SelectionGrid from "../selection/SelectionGrid";
import StructuredTable, { type StructuredTableCell } from "./StructuredTable";
import TableScrollFrame from "./TableScrollFrame";
import { ActionButton } from "../action/ActionControls";
import { ActionGlyph } from "../action/ActionGlyphs";
import CommandButton from "../common/CommandButton";
import { InputSurfaceRenderer } from "../../InputSurface";
import FormSurface from "../../FormSurface";
import CreateSurface from "../../CreateSurface";
import { CreateSurfaceAnchorTarget } from "../create/CreateSurfaceAnchorContext";
import { joinClassNames } from "../common/card-utils";
import { resolveDataTableScroll, resolveTableToneClass } from "./table-presentation";
import type {
  DataSurfaceCellActionSpec,
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceCommandSpec,
  DataSurfaceDisplaySpec,
  DataSurfaceFrame,
  DataSurfaceProps,
  DataSurfaceRecordProps,
  DataSurfaceScrollSpec,
  DataSurfaceSummaryProps,
  DataSurfaceStructuredCellSpec,
  DataSurfaceStructuredFormatSpec,
  DataSurfaceTableProps,
} from "../../DataSurface.types";

type StructuredDataSurfaceProps = Extract<DataSurfaceProps, { kind: "structured" }>;

const MATRIX_ROW_HEADER_WIDTH = "20rem";

function hasSpecKind(value: unknown): value is { kind: string } {
  return Boolean(value !== null && value !== undefined && typeof value === "object" && "kind" in value);
}

function isDisplaySpec(value: ReactNode | DataSurfaceDisplaySpec): value is DataSurfaceDisplaySpec {
  if (!hasSpecKind(value)) return false;
  return (
    value.kind === "text"
    || value.kind === "empty"
    || value.kind === "stack"
    || value.kind === "disclosure"
    || value.kind === "link"
    || value.kind === "badge"
    || value.kind === "number"
    || value.kind === "amount"
  );
}

export function renderDisplay(value: ReactNode | DataSurfaceDisplaySpec): ReactNode {
  if (!isDisplaySpec(value)) return value;
  if (value.kind === "empty") {
    return <span className="text-slate-400">{value.content ?? "—"}</span>;
  }
  if (value.kind === "badge") {
    const { kind: _kind, ...props } = value;
    return <Badge {...props} />;
  }
  if (value.kind === "number") {
    const { kind: _kind, ...props } = value;
    return <NumberCell {...props} />;
  }
  if (value.kind === "amount") {
    const { kind: _kind, ...props } = value;
    return <AmountCell {...props} />;
  }
  if (value.kind === "stack") {
    const gapClass = value.gap === "none" ? "" : value.gap === "sm" ? "space-y-2" : "space-y-1";
    return <div className={joinClassNames("min-w-0 max-w-full", gapClass)}>{value.items.map((item, index) => <div key={index} className="min-w-0 max-w-full">{renderDisplay(item)}</div>)}</div>;
  }
  if (value.kind === "disclosure") {
    const emphasisClass = value.emphasis === "strong" ? "font-bold" : value.emphasis === "medium" ? "font-medium" : "";
    return (
      <span className={joinClassNames("flex min-w-0 items-center gap-1", emphasisClass)} style={{ paddingLeft: `${Math.max(0, value.level ?? 0)}rem` }}>
        <span aria-hidden="true" className="shrink-0 text-xs text-slate-400">{value.expanded ? "▼" : "▶"}</span>
        <span className="min-w-0 truncate">{value.label}</span>
      </span>
    );
  }
  if (value.kind === "link") {
    return (
      <a
        href={value.href}
        target={value.external ? "_blank" : undefined}
        rel={value.external ? "noopener noreferrer" : undefined}
        className={joinClassNames("font-medium text-cyan-700 hover:underline", value.font === "mono" ? "font-mono" : "", resolveTableToneClass(value.tone))}
      >
        {value.label}
      </a>
    );
  }
  const emphasisClass = value.emphasis === "strong" ? "font-bold" : value.emphasis === "medium" ? "font-medium" : "";
  const fontClass = value.font === "mono" ? "font-mono tabular-nums" : "";
  const wrapClass = value.wrap === "wrap"
    ? "block min-w-0 max-w-full whitespace-normal break-words"
    : value.wrap === "truncate"
      ? "block min-w-0 max-w-full truncate"
      : "";
  return <span title={value.title} className={joinClassNames(resolveTableToneClass(value.tone), emphasisClass, fontClass, wrapClass)}>{value.value}</span>;
}

function groupItemClassName(item: DataSurfaceCellSpec, direction: "row" | "column") {
  if (direction === "row" && item.kind === "text" && item.wrap) return "min-w-0 flex-1";
  if (direction === "column") return "min-w-0 w-full";
  return "min-w-0";
}

function isCellSpec(value: ReactNode | DataSurfaceCellSpec): value is DataSurfaceCellSpec {
  if (!hasSpecKind(value)) return false;
  return (
    value.kind === "input"
    || value.kind === "group"
    || value.kind === "data"
    || value.kind === "form"
    || value.kind === "create-trigger"
    || value.kind === "create-anchor"
    || value.kind === "interactive"
    || value.kind === "selectionGrid"
    || value.kind === "action"
    || value.kind === "actions"
    || isDisplaySpec(value)
  );
}

function labelText(label: DataSurfaceCommandSpec["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "";
}

export function renderCommands(commands?: DataSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => command.icon ? (
        <ActionButton
          key={command.key}
          kind={command.icon}
          label={labelText(command.label) || command.key}
          title={command.title}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          size={command.size}
          onClick={command.onClick}
        />
      ) : (
        <CommandButton
          key={command.key}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          size={command.size}
          truncate={command.truncate}
          onClick={command.onClick}
          title={command.title}
        >
          {command.label}
        </CommandButton>
      ))}
    </div>
  );
}

function renderCellAction(action: DataSurfaceCellActionSpec) {
  const actionLabel = labelText(action.label) || action.key;
  const actionTitle = action.title ?? actionLabel;
  const button = action.icon && action.presentation === "glyph" ? (
    <button
      type={action.type}
      className={joinClassNames(
        "inline-grid place-items-center transition disabled:cursor-not-allowed disabled:opacity-50",
        action.tone
          ? `h-7 w-7 rounded-md ${badgeToneClassName(action.tone, true)}`
          : "h-5 w-5 text-slate-500 hover:text-slate-800",
      )}
      aria-label={actionLabel}
      title={actionTitle}
      disabled={action.disabled}
      onClick={() => action.onClick?.()}
    >
      <ActionGlyph kind={action.icon} className="h-4 w-4" />
    </button>
  ) : action.icon ? (
    <ActionButton
      kind={action.icon}
      label={actionLabel}
      title={actionTitle}
      type={action.type}
      variant={action.variant}
      disabled={action.disabled}
      size={action.size}
      onClick={() => action.onClick?.()}
    />
  ) : (
    <CommandButton
      type={action.type}
      variant={action.variant}
      disabled={action.disabled}
      size={action.size}
      truncate={action.truncate}
      onClick={() => action.onClick?.()}
      title={actionTitle}
    >
      {action.label}
    </CommandButton>
  );
  if (action.stopPropagation === false) return button;
  return <span className="inline-flex" onClick={(event) => event.stopPropagation()}>{button}</span>;
}

function renderCell(value: ReactNode | DataSurfaceCellSpec): ReactNode {
  if (!isCellSpec(value)) return value;
  if (value.kind === "input") {
    const {
      kind: _kind,
      stopPropagation,
      autocompletePresentation,
      fillRow,
      autoGrow,
      verticalAlign,
      textAlign,
      ...props
    } = value;
    const controlClassName = joinClassNames(
      fillRow ? "h-full min-h-[56px]" : "",
      autoGrow ? "[field-sizing:content]" : "",
      verticalAlign === "center" ? "content-center" : "",
      textAlign === "center" ? "text-center" : textAlign === "right" ? "text-right" : "",
    );
    const control = <InputSurfaceRenderer {...props} textAlign={textAlign} className={controlClassName} autocompletePresentation={autocompletePresentation} />;
    if (stopPropagation === false) return control;
    return <div className={fillRow ? "block h-full w-full" : "block"} onClick={(event) => event.stopPropagation()}>{control}</div>;
  }
  if (value.kind === "selectionGrid") {
    const { kind: _kind, ...props } = value;
    return <div className="block" onClick={(event) => event.stopPropagation()}><SelectionGrid {...props} /></div>;
  }
  if (value.kind === "group") {
    const direction = value.direction ?? "row";
    return (
      <div className={direction === "column" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
        {value.items.map((item, index) => <div key={index} className={groupItemClassName(item, direction)}>{renderCell(item)}</div>)}
      </div>
    );
  }
  if (value.kind === "data") return renderData(value.data);
  if (value.kind === "form") return <FormSurface {...value.form} />;
  if (value.kind === "create-trigger") return <CreateSurface {...value.create} />;
  if (value.kind === "create-anchor") return <CreateSurfaceAnchorTarget anchor={value.anchor} />;
  if (value.kind === "interactive") return <div role="button" tabIndex={0} aria-label={value.ariaLabel} onClick={(event) => { event.stopPropagation(); value.onClick(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); value.onClick(); } }}>{renderCell(value.content)}</div>;
  if (value.kind === "action") return renderCellAction(value.action);
  if (value.kind === "actions") {
    const alignClass = value.align === "center" ? "justify-center" : value.align === "right" ? "justify-end" : "justify-start";
    return (
      <div className={joinClassNames("flex flex-wrap items-center gap-2", alignClass)}>
        {value.actions.map((action) => <span key={action.key}>{renderCellAction(action)}</span>)}
      </div>
    );
  }
  return renderDisplay(value);
}

function normalizeStructuredRows(rows: DataSurfaceStructuredCellSpec[][]): StructuredTableCell[][] {
  return rows.map((row) => row.map((cell) => ({ ...cell, content: renderCell(cell.content) })));
}

function structuredColumnCount(rows: DataSurfaceStructuredCellSpec[][]) {
  return Math.max(0, ...rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
}

function matrixColWidths(rows: DataSurfaceStructuredCellSpec[][], format: DataSurfaceStructuredFormatSpec) {
  const columnCount = structuredColumnCount(rows);
  if (columnCount <= 0) return undefined;
  const columnWidths = format.columnWidths?.length ? format.columnWidths : [format.rowHeaderWidth ?? MATRIX_ROW_HEADER_WIDTH];
  return [
    ...columnWidths.slice(0, columnCount),
    ...Array.from({ length: Math.max(0, columnCount - columnWidths.length) }, () => null),
  ];
}

function matrixRowHeights(rowCount: number, format: DataSurfaceStructuredFormatSpec) {
  if (rowCount <= 0 || (format.headerRowHeight === undefined && format.bodyRowHeight === undefined)) return undefined;
  return [
    format.headerRowHeight,
    ...Array.from({ length: rowCount - 1 }, () => format.bodyRowHeight),
  ];
}

function structuredFormatColWidths(rows: DataSurfaceStructuredCellSpec[][], format?: DataSurfaceStructuredFormatSpec) {
  if (!format) return undefined;
  if (format.kind === "matrix") return matrixColWidths(rows, format);
  return undefined;
}

function structuredFormatRowHeights(rowCount: number, format?: DataSurfaceStructuredFormatSpec) {
  if (!format) return undefined;
  if (format.kind === "matrix") return matrixRowHeights(rowCount, format);
  return undefined;
}

function structuredPresentation(props: StructuredDataSurfaceProps) {
  const rowHover = props.presentation?.rowHover ?? (props.rowInteractions?.some(Boolean) ? "interactive" : undefined);
  if (props.format?.kind !== "matrix") return { ...props.presentation, rowHover };
  return {
    density: "compact" as const,
    grid: "cells" as const,
    header: "tinted" as const,
    cellWrap: "wrap" as const,
    controlHeight: "fillRow" as const,
    ...props.presentation,
    rowHover,
  };
}

function structuredFrame(props: StructuredDataSurfaceProps): DataSurfaceFrame | undefined {
  if (props.frame) return props.frame;
  if (props.format?.kind === "matrix") return "bordered";
  return undefined;
}

function structuredScroll(props: StructuredDataSurfaceProps): DataSurfaceScrollSpec | undefined {
  if (props.scroll) return props.scroll;
  if (props.format?.kind === "matrix") return { x: true, y: "hidden" };
  return undefined;
}

function normalizeColumns<T>(columns: Array<DataSurfaceColumnSpec<T>>): DataTableColumn<T>[] {
  return columns.map((column) => {
    const { cell, ...rest } = column;
    return { ...rest, render: (row: T) => renderCell(cell(row)) };
  });
}

function renderTable<T>(props: DataSurfaceTableProps<T>) {
  const frame = props.frame ?? (props.format?.kind === "matrix" ? "bordered" : undefined);
  const scroll = resolveDataTableScroll(props.format, props.scroll);
  return (
    <>
      <TableScrollFrame frame={frame} scroll={scroll}>
        <DataTable<T>
          rows={props.rows}
          columns={normalizeColumns(props.columns)}
          format={props.format}
          rowKey={props.rowKey}
          visibleColumns={props.visibleColumns}
          presentation={props.presentation}
          loading={props.loading}
          emptyText={props.emptyText}
          onRowClick={props.onRowClick}
          rowState={props.rowState}
          expandedRowKey={props.expandedRowKey}
          expandedRowKeys={props.expandedRowKeys}
          renderExpandedRow={props.expandedRow
            ? (row) => renderCell(props.expandedRow?.(row) ?? null)
            : undefined}
          rowActions={props.rowActions}
          rowEditActions={props.rowEditActions}
          actionsColumn={props.actionsColumn}
        />
      </TableScrollFrame>
    </>
  );
}

function renderSummary(props: DataSurfaceSummaryProps) {
  if (props.metrics.length === 0) return <EmptyStateCard compact>{props.empty ?? "暂无指标"}</EmptyStateCard>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.metrics.map((metric) => (
        <MetricCard key={metric.key} label={metric.label} value={renderDisplay(metric.value)} />
      ))}
    </div>
  );
}

function renderRecord(props: DataSurfaceRecordProps) {
  if (props.records.length === 0) return <EmptyStateCard compact>{props.empty ?? "暂无数据"}</EmptyStateCard>;
  return (
    <div className="space-y-3">
      {props.records.map((record) => (
        <DisclosureRecordCard
          key={record.key}
          expanded={record.expanded}
          onToggle={record.onToggle}
          header={renderDisplay(record.header)}
          summary={renderDisplay(record.summary)}
          detailTitle={record.detailTitle}
          detailAction={record.detailAction}
        >
          {renderDisplay(record.detail)}
        </DisclosureRecordCard>
      ))}
    </div>
  );
}

export function renderData<T>(props: DataSurfaceProps<T>) {
  if (props.kind === "table") return renderTable(props);
  if (props.kind === "structured") {
    const colWidths = props.colWidths ?? structuredFormatColWidths(props.rows, props.format);
    const rowHeights = props.rowHeights ?? structuredFormatRowHeights(props.rows.length, props.format);
    const table = (
      <StructuredTable
        rows={normalizeStructuredRows(props.rows)}
        rowInteractions={props.rowInteractions}
        colWidths={colWidths}
        rowHeights={rowHeights}
        presentation={structuredPresentation(props)}
      />
    );
    return props.structuredScroll === false ? table : <TableScrollFrame frame={structuredFrame(props)} scroll={structuredScroll(props)}>{table}</TableScrollFrame>;
  }
  if (props.kind === "summary") return renderSummary(props);
  return renderRecord(props);
}
