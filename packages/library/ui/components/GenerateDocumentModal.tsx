"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import { ActionToolbar, DetailModal, EmptyStateCard, FormField, SelectField, TextareaField, TextField } from "@workspace/core/ui";

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
    fetch(workspacePath("/api/modules/library/basic-info/generated-sources"))
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
      const res = await fetch(workspacePath(`/api/modules/library/basic-info/generated-sources/${selectedKey}/generate`), {
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
        {error && <EmptyStateCard compact className="mb-3 border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}

        {loadingSources ? (
          <EmptyStateCard compact>加载中...</EmptyStateCard>
        ) : sources.length === 0 ? (
          <EmptyStateCard compact>暂无可用生成来源</EmptyStateCard>
        ) : (
          <>
            <div className="mb-3">
              <SelectField
                label="生成类型"
                value={selectedKey}
                onChange={handleSourceChange}
                options={sources.map((source) => ({ value: source.key, label: source.name }))}
                className="block text-gray-500"
                triggerClassName="min-h-10 px-3 py-2 text-sm"
              />
            </div>

            <FormField label="标题" className="mb-3">
              <TextField
                value={title}
                onChange={setTitle}
                placeholder="文档标题"
              />
            </FormField>

            <FormField label="简介" className="mb-3">
              <TextareaField
                value={summary}
                onChange={setSummary}
                rows={3}
                placeholder="可选"
              />
            </FormField>

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
                triggerClassName="min-h-10 px-3 py-2 text-sm"
              />
            </div>

            <ActionToolbar
              className="justify-end border-0 p-0 shadow-none"
              secondaryActions={[{ label: "取消", kind: "cancel", onClick: onClose }]}
              primaryActions={[{ label: generating ? "生成中..." : "生成", kind: "add", onClick: handleGenerate, disabled: generating || !title.trim() }]}
            />
          </>
        )}
    </DetailModal>
  );
}
