"use client";

import { useEffect, useMemo, useState } from "react";
import type { QcTemplateFeedbackItem, QcTemplateFeedbackState } from "@workspace/production/server/qc";
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
  data?: QcTemplateFeedbackItem;
  items?: QcTemplateFeedbackItem[];
  list?: { states?: Record<string, QcTemplateFeedbackState> };
  error?: string;
}

const SECTION_LABELS: Array<[FeedbackFieldKey, string]> = FEEDBACK_FIELDS.map((field) => [field.key, field.label]);

interface FeedbackRow {
  id: string;
  item: QcTemplateFeedbackItem;
  targetType: "section" | "inline";
  targetId: string;
  content: string;
  resolved: boolean;
}

function isRowResolved(item: QcTemplateFeedbackItem, targetType: "section" | "inline", targetId: string) {
  if (targetType === "section") return item.sectionResolved?.[targetId as FeedbackFieldKey] ?? item.resolved === true;
  return item.inlineResolved?.[targetId] ?? item.resolved === true;
}

function feedbackRows(items: QcTemplateFeedbackItem[]): FeedbackRow[] {
  return items.flatMap((item) => {
    const sectionRows = SECTION_LABELS.flatMap(([key, label]) => {
      const value = item.sections?.[key]?.trim();
      return value ? [{
        id: `${item.key}:section:${key}`,
        item,
        targetType: "section" as const,
        targetId: key,
        content: `${label}：${value}`,
        resolved: isRowResolved(item, "section", key),
      }] : [];
    });
    const inlineRows = (item.inlineEntries || []).map((entry) => ({
      id: `${item.key}:inline:${entry.id}`,
      item,
      targetType: "inline" as const,
      targetId: entry.id,
      content: `${entry.target.label}：${entry.note}`,
      resolved: isRowResolved(item, "inline", entry.id),
    }));
    return [...sectionRows, ...inlineRows];
  });
}

export default function TemplateFeedbackModal({ target, onClose, onSaved }: Props) {
  const [items, setItems] = useState<QcTemplateFeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState("");
  const [error, setError] = useState("");
  const key = useMemo(() => target ? feedbackKey(target.context) : "", [target]);
  const rows = useMemo(() => feedbackRows(items), [items]);

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

  async function setResolved(row: FeedbackRow, resolved: boolean) {
    setResolvingKey(row.id);
    setError("");
    try {
      const response = await fetch("/workspace/api/production/qc/template-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: row.item.key,
          resolved,
          targetType: row.targetType,
          targetId: row.targetId,
        }),
      });
      const body = await response.json() as FeedbackResponse;
      if (!response.ok) throw new Error(body.error || "更新失败");
      if (body.data) setItems((current) => current.map((entry) => entry.key === body.data?.key ? body.data : entry));
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
              <span className="text-xs text-slate-500">{loading ? "读取中" : `${rows.length} 条`}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_120px] bg-slate-50 text-xs font-semibold text-slate-500">
                <div className="border-r border-slate-200 px-3 py-2">反馈人</div>
                <div className="border-r border-slate-200 px-3 py-2">反馈内容</div>
                <div className="px-3 py-2 text-center">已解决</div>
              </div>
              {rows.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-500">暂无反馈。</div>
              ) : rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[120px_minmax(0,1fr)_120px] border-t border-slate-200 text-sm">
                  <div className="border-r border-slate-200 px-3 py-3 font-medium text-slate-800">{row.item.userName || "未知"}</div>
                  <div className="whitespace-pre-wrap border-r border-slate-200 px-3 py-3 leading-6 text-slate-700">{row.content}</div>
                  <label className="flex items-center justify-center gap-2 px-3 py-3 text-slate-700">
                    <input
                      type="checkbox"
                      checked={row.resolved}
                      disabled={resolvingKey === row.id}
                      onChange={(event) => setResolved(row, event.target.checked)}
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
