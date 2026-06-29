"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { createPageBody, createRecordSection, PageSurface } from "@workspace/core/ui";
import type { DataSurfaceRecordSpec } from "@workspace/core/ui";
import { label, formatVal } from "../audit";

const AUDIT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

export interface AuditChange {
  field: string;
  label?: string;
  from?: string;
  to: string;
}

export interface AuditEntry {
  id: number;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: string;
  tag: string | null;
  action?: "create" | "update";
  canRestore?: boolean;
  changes: AuditChange[];
}

export interface AuditLogEntryProps {
  entry: AuditEntry;
  expanded: boolean;
  restoring: boolean;
  onToggle: () => void;
  onRestore: MouseEventHandler<HTMLButtonElement>;
}

export function createAuditLogRecord({
  entry,
  expanded,
  restoring,
  onToggle,
  onRestore,
}: AuditLogEntryProps): DataSurfaceRecordSpec {
  function changeLabel(change: AuditChange) {
    return change.label || label(change.field);
  }

  const header: ReactNode = (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-1">
        {entry.tag ? (
          <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">
            {entry.tag.replace("V0:", "基线 ")}
          </span>
        ) : (
          <span className="inline-block bg-gray-100 rounded px-1.5 py-0.5 text-xs font-mono">V{entry.version}</span>
        )}
      </span>
      <span className="w-36 shrink-0 text-xs text-gray-500">{AUDIT_DATE_FORMATTER.format(new Date(entry.createdAt))}</span>
      <span className="w-16 shrink-0 text-xs text-gray-700">{entry.editorName}</span>
      <span className="truncate text-xs font-medium text-gray-800">
        {entry.entityName}
        {entry.action === "create" ? " · 创建记录" : ""}
      </span>
    </div>
  );

  const summary: ReactNode = (
    <div className="flex flex-wrap gap-1">
      {entry.changes.slice(0, 4).map((change) => (
        <span key={change.field} className="inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
          {changeLabel(change)}: <span className="font-medium">{formatVal(change.to)}</span>
        </span>
      ))}
      {entry.changes.length > 4 && <span className="text-xs text-gray-400">+{entry.changes.length - 4}</span>}
      {entry.changes.length === 0 && (
        <span className="text-xs text-gray-300">{entry.action === "create" ? "创建记录" : "无变更"}</span>
      )}
    </div>
  );

  return {
    key: String(entry.id),
    expanded,
    onToggle,
    header,
    summary,
    detailTitle: "变更详情",
    detailAction: entry.canRestore
      ? {
          label: "还原到此版本",
          loadingLabel: "还原中...",
          loading: restoring,
          onClick: onRestore,
        }
      : undefined,
    detail: (
      <div className="space-y-1.5">
        {entry.changes.map((change) => (
          <div key={change.field} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-gray-500">{changeLabel(change)}</span>
            {change.from !== undefined ? (
              <>
                <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-500 line-through">{formatVal(change.from)}</span>
                <span className="text-gray-300">→</span>
              </>
            ) : <span className="text-xs italic text-gray-300">(无)</span>}
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-600">{formatVal(change.to)}</span>
          </div>
        ))}
      </div>
    ),
  };
}

export default function AuditLogEntry(props: AuditLogEntryProps) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createRecordSection(`audit-entry-${props.entry.id}`, {
          records: [createAuditLogRecord(props)],
        }),
      ])}
    />
  );
}
