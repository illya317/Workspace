"use client";

import type { ReactNode } from "react";
import AmountCell from "./AmountCell";
import Badge from "../common/Badge";
import { EmptyStateCard, MetricCard } from "../common/Card";
import DataTable from "./DataTable";
import type { DataTableColumn } from "./DataTable.types";
import DisclosureRecordCard from "../common/DisclosureRecordCard";
import NumberCell from "./NumberCell";
import SelectionGrid from "../selection/SelectionGrid";
import StructuredTable, { type StructuredTableCell } from "./StructuredTable";
import TableScrollFrame from "./TableScrollFrame";
import CommandButton from "../common/CommandButton";
import InputControl from "../../InputControl";
import { joinClassNames } from "../common/card-utils";
import type {
  DataSurfaceCellActionSpec,
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceCommandSpec,
  DataSurfaceDisplaySpec,
  DataSurfaceProps,
  DataSurfaceStructuredCellSpec,
  DataSurfaceTableProps,
} from "../../DataSurface.types";

function hasSpecKind(value: unknown): value is { kind: string } {
  return Boolean(value !== null && value !== undefined && typeof value === "object" && "kind" in value);
}

function isDisplaySpec(value: ReactNode | DataSurfaceDisplaySpec): value is DataSurfaceDisplaySpec {
  if (!hasSpecKind(value)) return false;
  return (
    value.kind === "text"
    || value.kind === "empty"
    || value.kind === "stack"
    || value.kind === "badge"
    || value.kind === "number"
    || value.kind === "amount"
  );
}

function renderDisplay(value: ReactNode | DataSurfaceDisplaySpec): ReactNode {
  if (!isDisplaySpec(value)) return value;
  if (value.kind === "empty") {
    return <span className={joinClassNames("text-slate-400", value.className)}>{value.content ?? "—"}</span>;
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
    return <div className={joinClassNames(gapClass, value.className)}>{value.items.map((item, index) => <div key={index}>{renderDisplay(item)}</div>)}</div>;
  }
  return <span className={value.className}>{value.value}</span>;
}

function isCellSpec(value: ReactNode | DataSurfaceCellSpec): value is DataSurfaceCellSpec {
  if (!hasSpecKind(value)) return false;
  return (
    value.kind === "input"
    || value.kind === "group"
    || value.kind === "selectionGrid"
    || value.kind === "action"
    || value.kind === "actions"
    || isDisplaySpec(value)
  );
}

export function renderCommands(commands?: DataSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => (
        <CommandButton
          key={command.key}
          type={command.type}
          variant={command.variant}
          disabled={command.disabled}
          size={command.size}
          className={command.className}
          truncate={command.truncate}
          onClick={command.onClick}
        >
          {command.label}
        </CommandButton>
      ))}
    </div>
  );
}

function renderCellAction(action: DataSurfaceCellActionSpec) {
  const button = (
    <CommandButton
      type={action.type}
      variant={action.variant}
      disabled={action.disabled}
      size={action.size}
      className={action.className}
      truncate={action.truncate}
      onClick={() => action.onClick?.()}
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
    const { kind: _kind, stopPropagation, ...props } = value;
    const control = <InputControl {...props} />;
    if (stopPropagation === false) return control;
    return <div className="block" onClick={(event) => event.stopPropagation()}>{control}</div>;
  }
  if (value.kind === "selectionGrid") {
    const { kind: _kind, ...props } = value;
    return <div className="block" onClick={(event) => event.stopPropagation()}><SelectionGrid {...props} /></div>;
  }
  if (value.kind === "group") {
    const direction = value.direction ?? "row";
    return (
      <div className={joinClassNames(direction === "column" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2", value.className)}>
        {value.items.map((item, index) => <div key={index} className="min-w-0">{renderCell(item)}</div>)}
      </div>
    );
  }
  if (value.kind === "action") return renderCellAction(value.action);
  if (value.kind === "actions") {
    const alignClass = value.align === "center" ? "justify-center" : value.align === "right" ? "justify-end" : "justify-start";
    return (
      <div className={joinClassNames("flex flex-wrap items-center gap-2", alignClass, value.className)}>
        {value.actions.map((action) => <span key={action.key}>{renderCellAction(action)}</span>)}
      </div>
    );
  }
  return renderDisplay(value);
}

function normalizeStructuredRows(rows: DataSurfaceStructuredCellSpec[][]): StructuredTableCell[][] {
  return rows.map((row) => row.map((cell) => ({ ...cell, content: renderCell(cell.content) })));
}

function normalizeColumns<T>(columns: Array<DataSurfaceColumnSpec<T>>): DataTableColumn<T>[] {
  return columns.map((column) => {
    const { cell, ...rest } = column;
    return { ...rest, render: (row: T) => renderCell(cell(row)) };
  });
}

function renderTable<T>(props: DataSurfaceTableProps<T>) {
  return (
    <>
      <TableScrollFrame className={props.scrollClassName}>
        <DataTable<T>
          rows={props.rows}
          columns={normalizeColumns(props.columns)}
          rowKey={props.rowKey}
          visibleColumns={props.visibleColumns}
          presentation={props.presentation}
          density={props.density}
          loading={props.loading}
          emptyText={props.emptyText}
          onRowClick={props.onRowClick}
          rowClassName={props.rowClassName}
          tableClassName={props.tableClassName}
          expandedRowKey={props.expandedRowKey}
          expandedRowKeys={props.expandedRowKeys}
          renderExpandedRow={props.expandedRowContent
            ? (row) => props.expandedRowContent?.(row)
            : undefined}
          rowActions={props.rowActions}
          rowEditActions={props.rowEditActions}
          actionsColumn={props.actionsColumn}
        />
      </TableScrollFrame>
    </>
  );
}

export function renderData<T>(props: DataSurfaceProps<T>) {
  if (props.kind === "table") return renderTable(props);
  if (props.kind === "structured") {
    const table = (
      <StructuredTable
        rows={normalizeStructuredRows(props.rows)}
        className={props.className}
        colWidths={props.colWidths}
        rowHeights={props.rowHeights}
        cellClassName={props.cellClassName}
        headerCellClassName={props.headerCellClassName}
        bodyClassName={props.bodyClassName}
        presentation={props.presentation}
      />
    );
    return props.structuredScroll === false ? table : <TableScrollFrame>{table}</TableScrollFrame>;
  }
  if (props.kind === "records") {
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
            {record.detailSurface ? renderData(record.detailSurface) : renderDisplay(record.detail)}
          </DisclosureRecordCard>
        ))}
      </div>
    );
  }
  if (props.kind === "metrics") {
    if (props.metrics.length === 0) return <EmptyStateCard compact>{props.empty ?? "暂无指标"}</EmptyStateCard>;
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{props.metrics.map((metric) => <MetricCard key={metric.key} label={metric.label} value={renderDisplay(metric.value)} className={metric.className} />)}</div>;
  }
  return null;
}
