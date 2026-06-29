"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useCallback } from "react";
import { createFieldsSection, createPageBody, createPageModalSection, PageSurface } from "@workspace/core/ui";

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

  const hasSources = sources.length > 0;
  const statusMessage = error ?? (loadingSources ? "加载中..." : hasSources ? null : "暂无可用生成来源");

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageModalSection("generate-document", {
          open: true,
          title: "生成文档",
          onClose,
          size: "md",
          sections: [
            createFieldsSection("generate-document-form", [
              ...(statusMessage
                ? [{
                    key: "status",
                    label: "状态",
                    spec: { valueType: "string" as const, control: "text" as const, state: "readonly" as const },
                    value: statusMessage,
                  }]
                : []),
              {
                key: "source",
                label: "生成类型",
                spec: {
                  valueType: "string",
                  control: "choice",
                  state: hasSources ? "normal" : "disabled",
                  options: {
                    source: "static",
                    mode: "dropdown",
                    items: sources.map((source) => ({ value: source.key, label: source.name })),
                  },
                },
                value: selectedKey,
                onChange: (value) => handleSourceChange(String(value ?? "")),
              },
              {
                key: "title",
                label: "标题",
                spec: { valueType: "string", control: "text", state: hasSources ? "normal" : "disabled" },
                value: title,
                onChange: (value) => setTitle(String(value ?? "")),
                placeholder: "文档标题",
              },
              {
                key: "summary",
                label: "简介",
                spec: { valueType: "string", control: "text", multiline: true, state: hasSources ? "normal" : "disabled" },
                value: summary,
                onChange: (value) => setSummary(String(value ?? "")),
                rows: 3,
                placeholder: "可选",
              },
              {
                key: "confidentialityLevel",
                label: "保密等级",
                spec: {
                  valueType: "number",
                  control: "choice",
                  state: hasSources ? "normal" : "disabled",
                  options: {
                    source: "static",
                    mode: "dropdown",
                    items: Object.entries(LEVEL_LABELS).map(([level, label]) => ({
                      value: level,
                      label: `${label} (L${level})`,
                    })),
                  },
                },
                value: String(confidentialityLevel),
                onChange: (value) => setConfidentialityLevel(Number(value)),
              },
            ], {
              actions: [
                { key: "cancel", label: "取消", onClick: onClose },
                {
                  key: "generate",
                  label: generating ? "生成中..." : "生成",
                  variant: "primary",
                  disabled: generating || !title.trim() || !hasSources,
                  onClick: () => void handleGenerate(),
                },
              ],
            }),
          ],
        }),
      ])}
    />
  );
}
