"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditEntry {
  id: number;
  entityId: string;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: string;
  changedFields: string[];
}

interface AuditLogModalProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
}

export default function AuditLogModal({ open, onClose, entityType }: AuditLogModalProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const pageSize = 100;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/audit-log?entityType=${entityType}&page=${p}&pageSize=${pageSize}`
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    if (open) { setPage(1); load(1); }
  }, [open, load]);

  useEffect(() => {
    if (open) load(page);
  }, [page]); // eslint-disable-line

  if (!open) return null;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[max(90vw,800px)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            编辑历史 · {entityType}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-2">
          {loading ? (
            <div className="py-12 text-center text-gray-400">加载中...</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-gray-400">暂无编辑记录</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="py-2 pr-3 w-16">版本</th>
                  <th className="py-2 pr-3 w-32">时间</th>
                  <th className="py-2 pr-3 w-20">编辑人</th>
                  <th className="py-2 pr-3">记录</th>
                  <th className="py-2">变更字段</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <td className="py-2 pr-3">
                      <span className="inline-block bg-gray-100 rounded px-1.5 py-0.5 text-xs font-mono">
                        V{e.version}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">
                      {new Date(e.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{e.editorName}</td>
                    <td className="py-2 pr-3 font-medium text-gray-800">
                      {e.entityName}
                      <span className="text-gray-400 ml-1 text-xs">#{e.entityId}</span>
                    </td>
                    <td className="py-2">
                      {e.changedFields.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {e.changedFields.map((f) => (
                            <span key={f} className="inline-block bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 text-xs">
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">创建</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm text-gray-500">
            <span>共 {total} 条记录</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border disabled:opacity-30"
              >
                上一页
              </button>
              <span className="px-2 py-1">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
