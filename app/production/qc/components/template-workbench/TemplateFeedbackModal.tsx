"use client";

import { useEffect, useMemo, useState } from "react";
import type { QcTemplateFeedbackItem, QcTemplateFeedbackState } from "@/server/services/production/qc";
import { feedbackKey, selectionTitle, type FeedbackTarget } from "./types";

const FEEDBACK_FIELDS = [
  { key: "descriptionText", label: "描述文字" },
  { key: "tableLayout", label: "表格布局" },
  { key: "formulaCalculation", label: "公式计算" },
  { key: "autoFilledText", label: "文字自动填写" },
  { key: "other", label: "其他" },
] as const;

type FeedbackFieldKey = typeof FEEDBACK_FIELDS[number]["key"];

interface Props {
  target: FeedbackTarget | null;
  onClose: () => void;
  onSaved: (states: Record<string, QcTemplateFeedbackState>) => void;
}

interface FeedbackResponse {
  items?: QcTemplateFeedbackItem[];
  error?: string;
}

const SECTION_LABELS: Array<[FeedbackFieldKey, string]> = FEEDBACK_FIELDS.map((field) => [field.key, field.label]);

function feedbackContent(item: QcTemplateFeedbackItem) {
  const sectionLines = SECTION_LABELS
    .map(([key, label]) => {
      const value = item.sections?.[key]?.trim();
      return value ? `${label}：${value}` : "";
    })
    .filter(Boolean);
  const inlineLines = (item.inlineEntries || [])
    .map((entry) => `${entry.target.label}：${entry.note}`)
    .filter(Boolean);
  return [...sectionLines, ...inlineLines].join("\n") || item.note || "无内容";
}

export default function TemplateFeedbackModal({ target, onClose, onSaved }: Props) {
  const [items, setItems] = useState<QcTemplateFeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState("");
  const [error, setError] = useState("");
  const key = useMemo(() => target ? feedbackKey(target.context) : "", [target]);

  useEffect(() => {
    if (!target) return;
    setError("");
    setItems([]);
    setLoading(true);
    fetch(`/workspace/api/production/qc/template-feedback?key=${encodeURIComponent(key)}`)
      .then((res) => res.json() as Promise<FeedbackResponse>)
      .then((body) => {
        setItems(body.items ?? []);
      })
      .catch(() => setError("读取反馈失败"))
      .finally(() => setLoading(false));
  }, [key, target]);

  if (!target) return null;

  async function setResolved(item: QcTemplateFeedbackItem, resolved: boolean) {
    setResolvingKey(item.key);
    setError("");
    try {
      const response = await fetch("/workspace/api/production/qc/template-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, resolved }),
      });
      const body = await response.json() as FeedbackResponse & { list?: { states?: Record<string, QcTemplateFeedbackState> } };
      if (!response.ok) throw new Error(body.error || "更新失败");
      setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, resolved } : entry));
      if (body.list?.states) onSaved(body.list.states);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setResolvingKey("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">反馈</h2>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200" aria-label="关闭反馈">×</button>
        </div>
        <div className="max-h-[calc(88vh-82px)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            {selectionTitle(target)}
          </div>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">全部反馈</h3>
              <span className="text-xs text-slate-500">{loading ? "读取中" : `${items.length} 条`}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_120px] bg-slate-50 text-xs font-semibold text-slate-500">
                <div className="border-r border-slate-200 px-3 py-2">反馈人</div>
                <div className="border-r border-slate-200 px-3 py-2">反馈内容</div>
                <div className="px-3 py-2 text-center">已解决</div>
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-500">暂无反馈。</div>
              ) : items.map((item) => (
                <div key={item.key} className="grid grid-cols-[120px_minmax(0,1fr)_120px] border-t border-slate-200 text-sm">
                  <div className="border-r border-slate-200 px-3 py-3 font-medium text-slate-800">{item.userName || "未知"}</div>
                  <div className="whitespace-pre-wrap border-r border-slate-200 px-3 py-3 leading-6 text-slate-700">{feedbackContent(item)}</div>
                  <label className="flex items-center justify-center gap-2 px-3 py-3 text-slate-700">
                    <input
                      type="checkbox"
                      checked={item.resolved === true}
                      disabled={resolvingKey === item.key}
                      onChange={(event) => setResolved(item, event.target.checked)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span>已解决</span>
                  </label>
                </div>
              ))}
            </div>
          </section>
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>
      </div>
    </div>
  );
}
