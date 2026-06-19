"use client";

import { useState, useEffect, useCallback } from "react";
import { ActionButton, DetailModal, SelectField, TextareaField, TextField } from "@workspace/core/ui";

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
    fetch("/workspace/api/library/generated-sources")
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
      const res = await fetch(`/workspace/api/library/generated-sources/${selectedKey}/generate`, {
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
    <DetailModal open title="生成文档" onClose={onClose} maxWidth="max-w-md">
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
              <SelectField
                label="生成类型"
                value={selectedKey}
                onChange={handleSourceChange}
                options={sources.map((source) => ({ value: source.key, label: source.name }))}
                className="block text-gray-500"
                selectClassName="min-h-10 px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">标题</label>
              <TextField
                value={title}
                onChange={setTitle}
                placeholder="文档标题"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-500">简介</label>
              <TextareaField
                value={summary}
                onChange={setSummary}
                rows={3}
                placeholder="可选"
                className="px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-4">
              <SelectField
                label="保密等级"
                value={String(confidentialityLevel)}
                onChange={(value) => setConfidentialityLevel(Number(value))}
                options={Object.entries(LEVEL_LABELS).map(([level, label]) => ({
                  value: level,
                  label: `${label} (L${level})`,
                }))}
                className="block text-gray-500"
                selectClassName="min-h-10 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <ActionButton
                onClick={handleGenerate}
                disabled={generating || !title.trim()}
                variant="primary"
              >
                {generating ? "生成中..." : "生成"}
              </ActionButton>
              <ActionButton onClick={onClose}>
                取消
              </ActionButton>
            </div>
          </>
        )}
    </DetailModal>
  );
}
