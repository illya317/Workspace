"use client";

import type { SourceTraceInfo } from "../types";

interface Props {
  open: boolean;
  info: SourceTraceInfo | null;
  rawPayload?: string | null;
  onClose: () => void;
}

export default function SourceTraceModal({ open, info, rawPayload, onClose }: Props) {
  if (!open || !info) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">数据来源</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">源文件</span>
            <span className="font-medium text-gray-800">{info.sourceFile}</span>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">工作表</span>
            <span className="font-medium text-gray-800">{info.sourceSheet ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <span className="text-gray-500">行号</span>
            <span className="font-medium text-gray-800">{info.sourceRow ?? "—"}</span>
          </div>
        </div>

        {rawPayload && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold text-gray-500">原始数据</h4>
            <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(rawPayload), null, 2);
                } catch {
                  return rawPayload;
                }
              })()}
            </pre>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
