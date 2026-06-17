"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { feedbackKey, selectionTitle, type FeedbackTarget } from "./types";

const FEEDBACK_FIELDS = [
  { key: "descriptionText", label: "描述文字", placeholder: "描述文字哪里不对，缺什么，或表达不清。" },
  { key: "tableLayout", label: "表格布局", placeholder: "表格结构、列宽、合并单元格、对齐等问题。" },
  { key: "formulaCalculation", label: "公式计算", placeholder: "公式逻辑、取值来源、联动计算的问题。" },
  { key: "autoFilledText", label: "文字自动填写", placeholder: "自动带出的标准文字、方法文字、结论文字问题。" },
  { key: "other", label: "其他", placeholder: "其他补充意见。" },
] as const;

type FeedbackFieldKey = typeof FEEDBACK_FIELDS[number]["key"];

type FeedbackSections = Record<FeedbackFieldKey, string>;

const EMPTY_SECTIONS: FeedbackSections = {
  descriptionText: "",
  tableLayout: "",
  formulaCalculation: "",
  autoFilledText: "",
  other: "",
};

interface Props {
  target: FeedbackTarget | null;
  onClose: () => void;
  onSaved: (keys: string[]) => void;
}

interface FeedbackResponse {
  data?: { note?: string; sections?: Partial<FeedbackSections> } | null;
  keys?: string[];
  error?: string;
}

export default function TemplateFeedbackModal({ target, onClose, onSaved }: Props) {
  const [sections, setSections] = useState<FeedbackSections>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const key = useMemo(() => target ? feedbackKey(target.context) : "", [target]);

  function applySections(next?: Partial<FeedbackSections> | null, legacyNote = "") {
    setSections({
      descriptionText: next?.descriptionText ?? "",
      tableLayout: next?.tableLayout ?? "",
      formulaCalculation: next?.formulaCalculation ?? "",
      autoFilledText: next?.autoFilledText ?? "",
      other: next?.other ?? legacyNote ?? "",
    });
  }

  useEffect(() => {
    if (!target) return;
    setError("");
    dirtyRef.current = false;
    setSections(EMPTY_SECTIONS);
    setLoading(true);
    fetch(`/workspace/api/production/qc/template-feedback?key=${encodeURIComponent(key)}`)
      .then((res) => res.json() as Promise<FeedbackResponse>)
      .then((body) => {
        if (!dirtyRef.current) applySections(body.data?.sections, body.data?.note ?? "");
      })
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
        body: JSON.stringify({ context: target.context, sections }),
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
          <div className="space-y-4">
            {FEEDBACK_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800">{field.label}</label>
                <textarea
                  value={sections[field.key]}
                  onChange={(event) => {
                    dirtyRef.current = true;
                    setSections((current) => ({ ...current, [field.key]: event.target.value }));
                  }}
                  rows={3}
                  placeholder={field.placeholder}
                  className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            取消
          </button>
          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? "保存中" : "保存反馈"}
          </button>
        </div>
      </div>
    </div>
  );
}
