"use client";

import { useState } from "react";
import { ActionButton, SectionCard, SelectField, TextareaField, Toast } from "@workspace/core/ui";
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSplit = async () => {
    if (!text.trim()) return;
    setSplitting(true);
    try {
      await splitQuestions(text.trim());
      setText("");
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "拆分失败", type: "error" });
    } finally {
      setSplitting(false);
    }
  };

  const handleMatch = async () => {
    setMatching(true);
    try {
      await runMatch();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "匹配失败", type: "error" });
    } finally {
      setMatching(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveRequest();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "归档失败", type: "error" });
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
          <SelectField
            value={detail.status}
            onChange={updateStatus}
            options={STATUS_OPTIONS}
            className="ml-auto w-24"
            selectClassName="min-h-8"
          />
          {detail.status === "approved" && (
            <ActionButton
              onClick={handleArchive}
              disabled={!canArchive}
              variant="primary"
            >
              {archiving ? "归档中..." : "完成提供"}
            </ActionButton>
          )}
        </div>

        {/* Split input */}
        <SectionCard title="问卷文本拆分" className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">粘贴问卷文本（按编号/换行拆分）</label>
          <TextareaField
            value={text}
            onChange={setText}
            rows={4}
            placeholder="1. 请提供公司营业执照...&#10;2. 请说明近三年财务状况..."
            className="px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <ActionButton
              onClick={handleSplit}
              disabled={splitting || !text.trim()}
              variant="primary"
            >
              {splitting ? "拆分中..." : "拆成问题"}
            </ActionButton>
            <ActionButton
              onClick={handleMatch}
              disabled={matching || detail.questions.length === 0}
            >
              {matching ? "匹配中..." : "运行材料匹配"}
            </ActionButton>
          </div>
        </SectionCard>

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
      <Toast show={!!toast} message={toast?.message ?? ""} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
