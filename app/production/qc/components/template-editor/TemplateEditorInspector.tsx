"use client";

import type {
  QcLayoutBlock,
  QcTemplateEditorDraft,
  QcTemplateEditorFieldGroup,
  QcTemplateModuleLibraryItem,
} from "@/server/services/production/qc";
import { addColumn, addRow, blockLabel, clone, encodeParts, parseParts, simpleTable } from "./editor-utils";
import TemplateEditorFieldPanel from "./TemplateEditorFieldPanel";
import TemplateModulePicker from "./TemplateModulePicker";

interface CellSelection { row: number; cell: number }

interface Props {
  draft: QcTemplateEditorDraft;
  selectedBlockIndex: number;
  selectedCell?: CellSelection;
  moduleLibrary: QcTemplateModuleLibraryItem[];
  fieldGroups: QcTemplateEditorFieldGroup[];
  formulaFunctions: string[];
  onSelectBlock: (index: number) => void;
  onSelectCell: (selection?: CellSelection) => void;
  onChange: (draft: QcTemplateEditorDraft) => void;
  onSave: () => void;
  saving: boolean;
  savedAt?: string;
}

function updateBlock(draft: QcTemplateEditorDraft, index: number, block: QcLayoutBlock) {
  const next = clone(draft);
  next.layoutDraft.blocks[index] = block;
  return next;
}

export default function TemplateEditorInspector({
  draft,
  selectedBlockIndex,
  selectedCell,
  moduleLibrary,
  fieldGroups,
  formulaFunctions,
  onSelectBlock,
  onSelectCell,
  onChange,
  onSave,
  saving,
  savedAt,
}: Props) {
  const block = draft.layoutDraft.blocks[selectedBlockIndex];
  const cell = selectedCell && block?.rows?.[selectedCell.row]?.[selectedCell.cell];
  const cellText = cell ? encodeParts(cell.parts, cell.rawText) : "";

  function setBlock(patch: Partial<QcLayoutBlock>) {
    if (!block) return;
    onChange(updateBlock(draft, selectedBlockIndex, { ...block, ...patch }));
  }

  function addBlock(blockToAdd: QcLayoutBlock) {
    const next = clone(draft);
    next.layoutDraft.blocks.push(blockToAdd);
    onChange(next);
    onSelectBlock(next.layoutDraft.blocks.length - 1);
  }

  function removeBlock() {
    const next = clone(draft);
    next.layoutDraft.blocks.splice(selectedBlockIndex, 1);
    onChange(next);
    onSelectBlock(Math.max(0, selectedBlockIndex - 1));
    onSelectCell(undefined);
  }

  function addModuleTemplate(templateId: string) {
    const item = moduleLibrary.find((candidate) => candidate.id === templateId);
    if (!item) return;
    const next = clone(draft);
    const blocks = item.blocks?.length ? item.blocks : [{ type: "title", title: item.title, sectionSuffix: "auto", sectionSlot: "auto" }];
    next.layoutDraft.blocks.push(...blocks.map((candidate) => ({ ...clone(candidate), sourceTemplateId: item.templateId })));
    onChange(next);
    onSelectBlock(next.layoutDraft.blocks.length - blocks.length);
  }

  function setCell(patch: Partial<typeof cell>) {
    if (!cell || !selectedCell || !block?.rows) return;
    const nextBlock = clone(block);
    nextBlock.rows![selectedCell.row][selectedCell.cell] = { ...cell, ...patch };
    onChange(updateBlock(draft, selectedBlockIndex, nextBlock));
  }

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">草稿</h2>
            <p className="mt-1 text-xs text-slate-500">{draft.draftId}</p>
          </div>
          <button onClick={onSave} disabled={saving} className="h-9 rounded-md border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
            {saving ? "保存中" : "保存草稿"}
          </button>
        </div>
        {savedAt && <div className="mt-2 text-xs text-slate-500">已保存：{savedAt}</div>}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">添加模块</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => addBlock({ type: "title", title: "新一级标题", sectionSuffix: "auto", sectionSlot: "auto", sectionRole: `custom_${Date.now()}`, sectionAnchor: true })} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">一级标题</button>
          <button onClick={() => addBlock({ type: "title", title: "新次级标题", sectionRef: block?.sectionRole, sectionSuffix: "1" })} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">次级标题</button>
          <button onClick={() => addBlock(simpleTable())} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">表格</button>
        </div>
        <TemplateModulePicker moduleLibrary={moduleLibrary} onAdd={addModuleTemplate} actionLabel="添加模块" />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">模块属性</h2>
        {block ? (
          <>
            <select value={selectedBlockIndex} onChange={(event) => onSelectBlock(Number(event.target.value))} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">
              {draft.layoutDraft.blocks.map((item, index) => <option key={`${item.type}-${index}`} value={index}>{index + 1}. {blockLabel(item, index)}</option>)}
            </select>
            <input value={block.title || ""} onChange={(event) => setBlock({ title: event.target.value })} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="标题" />
            <div className="grid grid-cols-2 gap-2">
              <input value={block.sectionSuffix || ""} onChange={(event) => setBlock({ sectionSuffix: event.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="sectionSuffix" />
              <input value={block.sectionRef || ""} onChange={(event) => setBlock({ sectionRef: event.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="sectionRef" />
            </div>
            {block.type === "table" && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setBlock(addRow(block))} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">加行</button>
                <button onClick={() => setBlock(addColumn(block))} className="h-9 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">加列</button>
              </div>
            )}
            <button onClick={removeBlock} className="h-9 w-full rounded-md border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100">删除模块</button>
          </>
        ) : <div className="text-sm text-slate-500">请选择或添加模块。</div>}
      </section>

      {block?.type === "table" && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">单元格</h2>
          <div className="grid gap-1 overflow-x-auto">
            {block.rows?.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map((item, cellIndex) => (
                  <button key={cellIndex} onClick={() => onSelectCell({ row: rowIndex, cell: cellIndex })} className={`h-8 min-w-10 rounded border px-2 text-xs ${selectedCell?.row === rowIndex && selectedCell.cell === cellIndex ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
                    {rowIndex + 1}-{cellIndex + 1}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {cell && (
            <div className="space-y-2">
              <textarea value={cellText} onChange={(event) => setCell({ rawText: event.target.value, parts: parseParts(event.target.value) })} className="min-h-20 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
              <div className="text-xs text-slate-500">字段写法：m=[字段:字段1]-[字段:字段2]=[字段:字段3]mg</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={cell.align || "center"} onChange={(event) => setCell({ align: event.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm">
                  <option value="center">居中</option><option value="left">左对齐</option><option value="right">右对齐</option>
                </select>
                <input value={cell.width || ""} onChange={(event) => setCell({ width: event.target.value })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="宽度" />
                <input type="number" min={1} value={cell.colspan} onChange={(event) => setCell({ colspan: Number(event.target.value) || 1 })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" />
                <input type="number" min={1} value={cell.rowspan} onChange={(event) => setCell({ rowspan: Number(event.target.value) || 1 })} className="h-9 rounded-md border border-slate-300 px-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!cell.bold} onChange={(event) => setCell({ bold: event.target.checked })} />加粗</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!cell.header} onChange={(event) => setCell({ header: event.target.checked })} />表头</label>
            </div>
          )}
        </section>
      )}

      <TemplateEditorFieldPanel methodGroups={draft.methodDraft.methodGroups} fieldGroups={fieldGroups} formulaFunctions={formulaFunctions} onChange={(methodGroups) => onChange({ ...draft, methodDraft: { methodGroups } })} />
    </aside>
  );
}
