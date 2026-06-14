"use client";

import { useState, useEffect, useCallback } from "react";
import AuditLogEntry from "./AuditLogEntry";

interface AuditLogModalProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
  onRestored?: () => void;
}

export default function AuditLogModal({ open, onClose, entityType, onRestored }: AuditLogModalProps) {
  const [entries, setEntries] = useState<import("./AuditLogEntry").AuditEntry[]>([]);
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
      const res = await fetch(`/workspace/api/admin/audit-log?entityType=${entityType}&dates=1`);
      if (res.ok) { const d = await res.json(); setDates(d.dates || []); }
    } catch {}
  }, [entityType]);

  const load = useCallback(async (p: number, d: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType, page: String(p), pageSize: String(pageSize) });
      if (d) params.set("date", d);
      const res = await fetch(`/workspace/api/admin/audit-log?${params}`);
      if (res.ok) { const data = await res.json(); setEntries(data.entries || []); setTotal(data.total || 0); }
    } finally { setLoading(false); }
  }, [entityType]);

  const restore = useCallback(async (historyId: number) => {
    setRestoring(historyId);
    try {
      const res = await fetch("/workspace/api/admin/audit-log/restore", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historyId }),
      });
      if (res.ok) { load(1, selectedDate); loadDates(); onRestored?.(); }
    } finally { setRestoring(null); }
  }, [load, loadDates, selectedDate, onRestored]);

  useEffect(() => { if (open) { setPage(1); setSelectedDate(""); load(1, ""); loadDates(); } }, [open, load, loadDates]);
  useEffect(() => { if (open) load(page, selectedDate); }, [page, selectedDate]); // eslint-disable-line

  if (!open) return null;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[max(92vw,900px)] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            编辑历史 · {entityType}{selectedDate && <span className="text-sm text-gray-400 ml-2">({selectedDate})</span>}
          </h2>
          <div className="flex items-center gap-3">
            {dates.length > 0 && (
              <select value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
              >
                <option value="">全部日期</option>
                {dates.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-2">
          {loading ? (
            <div className="py-16 text-center text-gray-400">加载中...</div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-gray-400">暂无编辑记录</div>
          ) : (
            <div className="space-y-2 py-2">
              {entries.map((e) => (
                <AuditLogEntry key={e.id} entry={e} expanded={expandedId === e.id} restoring={restoring === e.id}
                  onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  onRestore={(ev) => { ev.stopPropagation(); restore(e.id); }}
                />
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm text-gray-500 shrink-0">
            <span>共 {total} 条记录</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded border disabled:opacity-30">上一页</button>
              <span className="px-2 py-1">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
