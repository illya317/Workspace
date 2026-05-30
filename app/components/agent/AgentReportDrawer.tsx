"use client";

import type { AgentMessage } from "./types";

interface Props {
  message: AgentMessage | null;
  onClose: () => void;
}

export default function AgentReportDrawer({ message, onClose }: Props) {
  if (!message?.data) return null;

  const data = message.data as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];
  const total = typeof data.total === "number" ? data.total : items.length;

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-96 bg-white shadow-2xl border-l flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-800">查询报告</div>
          <div className="text-xs text-gray-500">共 {total} 条记录</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.content}</p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {items.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100 text-left">
              <tr>
                {Object.keys(items[0] as Record<string, unknown>).map((key) => (
                  <th key={key} className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {Object.values(item as Record<string, unknown>).map((val, j) => (
                    <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                      {val == null ? "-" : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-gray-400">无详细数据</div>
        )}
      </div>
    </div>
  );
}
