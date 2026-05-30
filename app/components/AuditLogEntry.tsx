"use client";

import { label, formatVal } from "@/lib/audit-field-labels";

interface AuditChange { field: string; from?: string; to: string }
export interface AuditEntry {
  id: number;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: string;
  tag: string | null;
  changes: AuditChange[];
}

interface Props {
  entry: AuditEntry;
  expanded: boolean;
  restoring: boolean;
  onToggle: () => void;
  onRestore: (e: React.MouseEvent) => void;
}

export default function AuditLogEntry({ entry, expanded, restoring, onToggle, onRestore }: Props) {
  return (
    <div className="border rounded-lg hover:border-gray-300 transition-colors cursor-pointer" onClick={onToggle}>
      <div className="flex items-center gap-4 px-4 py-2.5">
        <span className="inline-flex items-center gap-1">
          {entry.tag ? (
            <span className="inline-block bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 text-[11px] font-medium">
              {entry.tag.replace("V0:", "基线 ")}
            </span>
          ) : (
            <span className="inline-block bg-gray-100 rounded px-1.5 py-0.5 text-xs font-mono">V{entry.version}</span>
          )}
        </span>
        <span className="text-xs text-gray-500 w-36 shrink-0">{new Date(entry.createdAt).toLocaleString("zh-CN")}</span>
        <span className="text-xs text-gray-700 w-16 shrink-0">{entry.editorName}</span>
        <span className="text-xs font-medium text-gray-800 truncate">{entry.entityName}</span>
        <div className="flex flex-wrap gap-1 ml-auto">
          {entry.changes.slice(0, 4).map((c) => (
            <span key={c.field} className="inline-block bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 text-[11px]">
              {label(c.field)}: <span className="font-medium">{formatVal(c.to)}</span>
            </span>
          ))}
          {entry.changes.length > 4 && <span className="text-[11px] text-gray-400">+{entry.changes.length - 4}</span>}
          {entry.changes.length === 0 && <span className="text-[11px] text-gray-300">无变更</span>}
        </div>
        <span className="text-gray-300 text-xs">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t bg-gray-50 rounded-b-lg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">变更详情</span>
            <button onClick={onRestore} disabled={restoring}
              className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50">
              {restoring ? "还原中..." : "还原到此版本"}
            </button>
          </div>
          <div className="space-y-1.5">
            {entry.changes.map((c) => (
              <div key={c.field} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-24 shrink-0">{label(c.field)}</span>
                {c.from !== undefined ? (
                  <>
                    <span className="text-red-500 bg-red-50 rounded px-1.5 py-0.5 line-through font-mono">{formatVal(c.from)}</span>
                    <span className="text-gray-300">→</span>
                  </>
                ) : <span className="text-gray-300 italic text-[11px]">(无)</span>}
                <span className="text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 font-mono">{formatVal(c.to)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
