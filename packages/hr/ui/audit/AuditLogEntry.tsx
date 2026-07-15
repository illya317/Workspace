"use client";

import type { MouseEventHandler } from "react";
import { createPageBody, createRecordSection, BodySurface } from "@workspace/core/ui";
import type { DataSurfaceRecordSpec } from "@workspace/core/ui";
import { label, formatVal } from "@workspace/platform/audit";

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

  const header: DataSurfaceRecordSpec["header"] = {
    kind: "text",
    value: `${entry.tag ? entry.tag.replace("V0:", "基线 ") : `V${entry.version}`} · ${AUDIT_DATE_FORMATTER.format(new Date(entry.createdAt))} · ${entry.editorName} · ${entry.entityName}${entry.action === "create" ? " · 创建记录" : ""}`,
    emphasis: "medium",
    wrap: "truncate",
  };

  const summary: DataSurfaceRecordSpec["summary"] = {
    kind: "text",
    value: entry.changes.length
      ? `${entry.changes.slice(0, 4).map((change) => `${changeLabel(change)}：${formatVal(change.to)}`).join("；")}${entry.changes.length > 4 ? `；+${entry.changes.length - 4}` : ""}`
      : entry.action === "create" ? "创建记录" : "无变更",
    tone: "muted",
    wrap: "wrap",
  };

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
    detail: { kind: "stack", gap: "xs", items: entry.changes.map((change) => ({ kind: "text", value: `${changeLabel(change)}：${change.from !== undefined ? formatVal(change.from) : "(无)"} → ${formatVal(change.to)}`, font: "mono", wrap: "wrap" })) },
  };
}

export default function AuditLogEntry(props: AuditLogEntryProps) {
  return (
    <BodySurface {...createPageBody([
        createRecordSection(`audit-entry-${props.entry.id}`, {
          records: [createAuditLogRecord(props)],
        }),
      ])} />
  );
}
