"use client";

import { useState } from "react";
import { useDueDiligenceDetail } from "../hooks/useDueDiligence";
import QuestionCard from "./QuestionCard";

interface Props {
  requestId: number;
  onBack: () => void;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "reviewing", label: "审核中" },
  { value: "approved", label: "已批准" },
  { value: "provided", label: "已提供" },
  { value: "cancelled", label: "已取消" },
];

export default function DueDiligenceDetail({ requestId, onBack }: Props) {
  const { detail, loading, splitQuestions, runMatch, toggleMaterial, updateStatus, archiveRequest } = useDueDiligenceDetail(requestId);
  const [text, setText] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleSplit = async () => {
    if (!text.trim()) return;
    setSplitting(true);
    try {
      await splitQuestions(text.trim());
      setText("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setSplitting(false);
    }
  };

  const handleMatch = async () => {
    setMatching(true);
    try {
      await runMatch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "匹配失败");
    } finally {
      setMatching(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveRequest();
    } catch (e) {
      alert(e instanceof Error ? e.message : "归档失败");
    } finally {
      setArchiving(false);
    }
  };

  if (loading || !detail) {
    return <div className="py-16 text-center text-gray-400">加载中…</div>;
  }

  const selectedCount = detail.questions.reduce((sum, q) => sum + q.materials.filter((m) => m.selected).length, 0);
  const uncovered = detail.questions.filter((q) => !q.materials.some((m) => m.selected));
  const canArchive = detail.status === "approved" && uncovered.length === 0 && !archiving;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-800">{detail.title}</h2>
          <select
            value={detail.status}
            onChange={(e) => updateStatus(e.target.value)}
            className="ml-auto rounded border px-2 py-1 text-xs text-gray-700 focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {detail.status === "approved" && (
            <button
              onClick={handleArchive}
              disabled={!canArchive}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {archiving ? "归档中..." : "完成提供"}
            </button>
          )}
        </div>

        {/* Split input */}
        <div className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-gray-500">粘贴问卷文本（按编号/换行拆分）</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="1. 请提供公司营业执照...&#10;2. 请说明近三年财务状况..."
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleSplit}
              disabled={splitting || !text.trim()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {splitting ? "拆分中..." : "拆成问题"}
            </button>
            <button
              onClick={handleMatch}
              disabled={matching || detail.questions.length === 0}
              className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            >
              {matching ? "匹配中..." : "运行材料匹配"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 text-sm text-gray-500">
          共 {detail.questions.length} 个问题 · 已选 {selectedCount} 份材料
          {uncovered.length > 0 && (
            <span className="ml-2 text-orange-600">· {uncovered.length} 个问题未选择材料</span>
          )}
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {detail.questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              index={idx + 1}
              question={q}
              onToggle={(selectionId, selected) => toggleMaterial(q.id, selectionId, selected)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
