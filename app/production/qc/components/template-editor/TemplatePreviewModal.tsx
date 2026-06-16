"use client";

import type { QcTemplateEditorDraft } from "@/server/services/production/qc";
import TemplateEditorPreviewPane from "./TemplateEditorPreviewPane";

interface Props {
  draft: QcTemplateEditorDraft;
  open: boolean;
  selectedBlockIndex: number;
  errors: string[];
  onSelectBlock: (index: number) => void;
  onClose: () => void;
}

export default function TemplatePreviewModal({ draft, open, selectedBlockIndex, errors, onSelectBlock, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <button aria-label="关闭预览" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div className="relative mx-auto max-w-[1180px]">
        <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div>
            <h2 className="text-base font-semibold text-slate-900">A4 预览</h2>
            <p className="mt-1 text-xs text-slate-500">{draft.stageLabel} · {draft.testName || "实验项目"}</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            关闭
          </button>
        </div>
        <TemplateEditorPreviewPane draft={draft} selectedBlockIndex={selectedBlockIndex} errors={errors} onSelectBlock={onSelectBlock} />
      </div>
    </div>
  );
}
