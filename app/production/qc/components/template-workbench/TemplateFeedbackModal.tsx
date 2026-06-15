"use client";

import { useEffect, useMemo, useState } from "react";
import { feedbackKey, selectionTitle, type FeedbackTarget } from "./types";

interface Props {
  target: FeedbackTarget | null;
  onClose: () => void;
  onSaved: (keys: string[]) => void;
}

interface FeedbackResponse {
  data?: { note?: string } | null;
  keys?: string[];
  error?: string;
}

export default function TemplateFeedbackModal({ target, onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const key = useMemo(() => target ? feedbackKey(target.context) : "", [target]);

  useEffect(() => {
    if (!target) return;
    setError("");
    setLoading(true);
    fetch(`/workspace/api/production/qc/template-feedback?key=${encodeURIComponent(key)}`)
      .then((res) => res.json() as Promise<FeedbackResponse>)
      .then((body) => setNote(body.data?.note ?? ""))
      .catch(() => setError("读取反馈失败"))
      .finally(() => setLoading(false));
  }, [key, target]);

  if (!target) return null;

  async function save() {
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/workspace/api/production/qc/template-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: target.context, note }),
      });
      const body = await response.json() as FeedbackResponse;
      if (!response.ok) throw new Error(body.error || "保存失败");
      onSaved(body.keys ?? []);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">反馈</h2>
          <button onClick={onClose} className="rounded-md bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200" aria-label="关闭反馈">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            {selectionTitle(target)}
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={loading}
            rows={7}
            placeholder="写下这里哪里不对、缺什么字段、版式哪里需要调整，或同事的具体意见。"
            className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50"
          />
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            取消
          </button>
          <button onClick={save} disabled={saving || loading} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? "保存中" : "保存反馈"}
          </button>
        </div>
      </div>
    </div>
  );
}
