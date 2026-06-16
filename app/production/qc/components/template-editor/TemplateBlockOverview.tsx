"use client";

import type { QcLayoutBlock, QcTemplateEditorDraft } from "@/server/services/production/qc";
import { blockLabel } from "./editor-utils";

interface Props {
  draft: QcTemplateEditorDraft;
  selectedBlockIndex: number;
  onSelectBlock: (index: number) => void;
}

function blockTone(block: QcLayoutBlock) {
  if (block.type === "table") return `${block.rows?.length || 0} 行表格`;
  if (block.type === "title") return "标题";
  if (block.type === "paragraph") return "段落";
  return block.type;
}

export default function TemplateBlockOverview({ draft, selectedBlockIndex, onSelectBlock }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">模块界面</h2>
          <p className="mt-1 text-xs text-slate-500">{draft.layoutDraft.blocks.length} 个结构块</p>
        </div>
      </div>
      <div className="grid gap-2">
        {draft.layoutDraft.blocks.map((block, index) => (
          <button
            key={`${block.type}-${index}`}
            onClick={() => onSelectBlock(index)}
            className={`rounded-md border px-3 py-2 text-left text-sm ${selectedBlockIndex === index ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            <span className="block truncate font-semibold">{index + 1}. {blockLabel(block, index)}</span>
            <span className="mt-1 block text-xs opacity-70">{blockTone(block)}</span>
          </button>
        ))}
        {draft.layoutDraft.blocks.length === 0 && (
          <div className="rounded-md border border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
            暂无结构块，可从右侧操作菜单添加标题或表格。
          </div>
        )}
      </div>
    </section>
  );
}
