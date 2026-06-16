"use client";

import type { QcLayoutBlock, QcTemplateEditorDraft, QcTemplateModuleLibraryItem } from "@/server/services/production/qc";
import { blockLabel, moduleCategoryLabel, moduleDisplayName } from "./editor-utils";

interface Props {
  module: QcTemplateModuleLibraryItem;
  draft: QcTemplateEditorDraft;
  selectedBlockIndex: number;
}

function blockTone(block: QcLayoutBlock) {
  if (block.type === "table") return `${block.rows?.length || 0} 行表格`;
  if (block.type === "title") return "标题";
  if (block.type === "paragraph") return "段落";
  return block.type;
}

export default function TemplateBlockOverview({ module, draft, selectedBlockIndex }: Props) {
  const blocks = draft.layoutDraft.blocks;
  const selectedBlock = blocks[selectedBlockIndex];
  const tableCount = blocks.filter((block) => block.type === "table").length;
  const titleCount = blocks.filter((block) => block.type === "title").length;
  const paragraphCount = blocks.filter((block) => block.type === "paragraph").length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">当前模块</h2>
          <p className="mt-1 text-xs text-slate-500">左下只保留当前选中的模块，结构块切换放到右侧操作区。</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {moduleCategoryLabel(module)}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{moduleDisplayName(module)}</div>
              <div className="mt-2 break-all text-sm text-slate-500">{module.templateId}</div>
            </div>
            <div className="grid min-w-[240px] grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-3">
                <div className="text-xl font-semibold text-slate-900">{blocks.length}</div>
                <div className="mt-1 text-xs text-slate-500">结构块</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-3">
                <div className="text-xl font-semibold text-slate-900">{tableCount}</div>
                <div className="mt-1 text-xs text-slate-500">表格</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-3">
                <div className="text-xl font-semibold text-slate-900">{titleCount + paragraphCount}</div>
                <div className="mt-1 text-xs text-slate-500">标题/段落</div>
              </div>
            </div>
          </div>
        </div>

        {selectedBlock ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前编辑块</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {selectedBlockIndex + 1}. {blockLabel(selectedBlock, selectedBlockIndex)}
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                {blockTone(selectedBlock)}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
            暂无结构块，可从右侧操作菜单添加标题或表格。
          </div>
        )}
      </div>
    </section>
  );
}
