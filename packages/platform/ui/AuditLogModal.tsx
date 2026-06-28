"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import { createInlineFieldsBlock, createMessageBlock, createPageBody, PageSurface } from "@workspace/core/ui";
import AuditLogEntry, { type AuditEntry } from "./AuditLogEntry";

export interface AuditLogModalProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
  onRestored?: () => void;
}

export default function AuditLogModal({ open, onClose, entityType, onRestored }: AuditLogModalProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [restoring, setRestoring] = useState<number | null>(null);
  const pageSize = 100;

  const loadDates = useCallback(async () => {
    try {
      const res = await fetch(workspacePath(`/api/modules/hr/roster/audit-log?entityType=${entityType}&dates=1`));
      if (res.ok) {
        const d = await res.json();
        setDates(d.dates || []);
      }
    } catch {}
  }, [entityType]);

  const load = useCallback(async (p: number, d: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType, page: String(p), pageSize: String(pageSize) });
      if (d) params.set("date", d);
      const res = await fetch(workspacePath(`/api/modules/hr/roster/audit-log?${params}`));
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  const restore = useCallback(async (historyId: number) => {
    setRestoring(historyId);
    try {
      const res = await fetch(workspacePath("/api/modules/hr/roster/audit-log/restore"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId }),
      });
      if (res.ok) {
        load(1, selectedDate);
        loadDates();
        onRestored?.();
      }
    } finally {
      setRestoring(null);
    }
  }, [load, loadDates, selectedDate, onRestored]);

  useEffect(() => {
    if (open) {
      setPage(1);
      setSelectedDate("");
      load(1, "");
      loadDates();
    }
  }, [open, load, loadDates]);

  useEffect(() => {
    if (open) load(page, selectedDate);
  }, [open, page, selectedDate, load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([{
        kind: "modal",
        key: "audit-log",
        open,
        title: `编辑历史 · ${entityType}${selectedDate ? ` (${selectedDate})` : ""}`,
        onClose,
        maxWidth: "max-w-5xl",
        blocks: [
        ...(dates.length > 0 ? [
          createInlineFieldsBlock("audit-date", [{
            key: "date",
            label: "日期",
            value: selectedDate,
            placeholder: "全部日期",
            spec: {
              valueType: "string",
              control: "choice",
              options: {
                source: "static",
                mode: "dropdown",
                unsetLabel: "全部日期",
                items: dates.map((date) => ({ label: date, value: date })),
              },
            },
            onChange: (nextDate) => {
              setSelectedDate(String(nextDate ?? ""));
              setPage(1);
            },
          }], { kind: "filters" as const }),
        ] : []),
        createMessageBlock("entries", {
          content: (
            <div className="max-h-[58vh] overflow-auto">
              {loading ? (
                <div className="py-16 text-center text-gray-400">加载中...</div>
              ) : entries.length === 0 ? (
                <div className="py-16 text-center text-gray-400">暂无编辑记录</div>
              ) : (
                <div className="space-y-2 py-2">
                  {entries.map((entry) => (
                    <AuditLogEntry
                      key={entry.id}
                      entry={entry}
                      expanded={expandedId === entry.id}
                      restoring={restoring === entry.id}
                      onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      onRestore={(event) => {
                        event.stopPropagation();
                        restore(entry.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ),
        }),
        {
          kind: "navigation" as const,
          key: "pagination",
          surface: {
            kind: "pagination",
            pagination: {
              page,
              total,
              totalPages,
              onPageChange: setPage,
              compact: true,
              className: "border-t border-slate-200 pt-3",
            },
          },
        },
        ],
      }])}
    />
  );
}
