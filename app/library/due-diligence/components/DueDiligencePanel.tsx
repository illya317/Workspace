"use client";

import { useState } from "react";
import { useDueDiligenceRequests } from "../hooks/useDueDiligence";
import DueDiligenceDetail from "./DueDiligenceDetail";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  reviewing: "审核中",
  approved: "已批准",
  provided: "已提供",
  cancelled: "已取消",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewing: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  provided: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function DueDiligencePanel() {
  const { requests, loading, error, createRequest, deleteRequest } = useDueDiligenceRequests();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [partyName, setPartyName] = useState("");
  const [creating, setCreating] = useState(false);

  if (detailId !== null) {
    return (
      <DueDiligenceDetail
        requestId={detailId}
        onBack={() => setDetailId(null)}
      />
    );
  }

  const handleCreate = async () => {
    if (!title.trim() || !partyName.trim()) return;
    setCreating(true);
    try {
      await createRequest(title.trim(), partyName.trim());
      setTitle("");
      setPartyName("");
      setShowCreate(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">尽调问卷</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            + 新建问卷
          </button>
        </div>

        {error && <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

        {showCreate && (
          <div className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">问卷标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：A轮投资人尽调清单"
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">尽调方</label>
              <input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder="例如：红杉资本"
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {creating ? "创建中..." : "创建"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-400">加载中…</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-gray-400">暂无问卷</div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                onClick={() => setDetailId(req.id)}
                className="flex cursor-pointer items-center justify-between rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition"
              >
                <div>
                  <div className="font-medium text-gray-800">{req.title}</div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {req._count?.questions ?? 0} 个问题 · {new Date(req.updatedAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status] || "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[req.status] || req.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("确定删除此问卷？")) deleteRequest(req.id);
                    }}
                    className="text-gray-400 hover:text-red-500"
                    title="删除"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
