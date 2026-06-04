"use client";

import { useState, useEffect, useCallback } from "react";

interface Source {
  key: string;
  name: string;
  defaultConfidentialityLevel: number;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const LEVEL_LABELS: Record<number, string> = {
  0: "公开",
  1: "内部",
  2: "普通",
  3: "机密",
  4: "绝密",
};

export default function GenerateDocumentModal({ onClose, onSuccess }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [confidentialityLevel, setConfidentialityLevel] = useState<number>(2);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingSources(true);
    fetch("/api/library/generated-sources")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Source[]) => {
        setSources(data);
        if (data.length > 0) {
          setSelectedKey(data[0].key);
          setConfidentialityLevel(data[0].defaultConfidentialityLevel);
        }
      })
      .catch(() => setError("加载生成来源失败"))
      .finally(() => setLoadingSources(false));
  }, []);

  const handleSourceChange = useCallback(
    (key: string) => {
      setSelectedKey(key);
      const s = sources.find((x) => x.key === key);
      if (s) setConfidentialityLevel(s.defaultConfidentialityLevel);
    },
    [sources]
  );

  const handleGenerate = async () => {
    if (!selectedKey || !title.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/generated-sources/${selectedKey}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || undefined,
          confidentialityLevel,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "生成失败" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-bold text-gray-800">生成文档</h3>

        {error && (
          <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        {loadingSources ? (
          <div className="py-8 text-center text-gray-400">加载中…</div>
        ) : sources.length === 0 ? (
          <div className="py-8 text-center text-gray-400">暂无可用生成来源</div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">生成类型</label>
              <select
                value={selectedKey}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {sources.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文档标题"
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">简介</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="可选"
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-gray-500">保密等级</label>
              <select
                value={confidentialityLevel}
                onChange={(e) => setConfidentialityLevel(Number(e.target.value))}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {Object.entries(LEVEL_LABELS).map(([level, label]) => (
                  <option key={level} value={Number(level)}>
                    {label} (L{level})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating || !title.trim()}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {generating ? "生成中..." : "生成"}
              </button>
              <button
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
