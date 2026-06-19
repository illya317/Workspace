"use client";

import { useConfirmDelete } from "@workspace/core/ui/ConfirmProvider";
import { SectionCard } from "@workspace/core/ui";
import SelectField from "@workspace/core/ui/SelectField";
import AutoResizeTextarea from "./AutoResizeTextarea";

export interface ItemRow {
  plan: string;
  completion: string;
  nextGoal: string;
  workId?: number;
  isImported?: boolean;
  isNew?: boolean;
  lastWeekGoal?: string;
}

interface WorkItem {
  id: number;
  category: string;
  content: string;
}

interface Props {
  title: string;
  subtitle: string;
  items: ItemRow[];
  disabled: boolean;
  workList: WorkItem[];
  category: string;
  showImport: boolean;
  onShowImport: (show: boolean) => void;
  onImportWork: (content: string) => void;
  onUpdate: (index: number, field: keyof ItemRow, value: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: number) => void;
}

export default function WorkSection({
  title,
  subtitle,
  items,
  disabled,
  workList,
  category,
  showImport,
  onShowImport,
  onImportWork,
  onUpdate,
  onRemove,
  onMove,
}: Props) {
  const confirmDelete = useConfirmDelete();
  const availableWorks = workList.filter(
    (w) => w.category === category && !items.some((item) => item.plan === w.content)
  );

  async function confirmRemove(index: number) {
    const ok = await confirmDelete({
      message: `确定删除这条${title}吗？`,
    });
    if (!ok) return;
    onRemove(index);
  }

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className={`rounded-md border p-3 ${category === "routine" ? "border-gray-100 bg-gray-50" : "border-gray-200"}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{item.plan || `第 ${index + 1} 条`}</span>
              {!disabled && (
                <div className="flex gap-1">
                  <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0}
                    className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => onMove(index, 1)} disabled={index === items.length - 1}
                    className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => confirmRemove(index)}
                    className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50">删除</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <AutoResizeTextarea
                value={item.completion}
                onChange={(e) => onUpdate(index, "completion", e.target.value)}
                placeholder={item.lastWeekGoal || "完成情况"}
                disabled={disabled}
                className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                  disabled ? "border-gray-200 bg-gray-100 text-gray-500" : "border-gray-200 focus:border-emerald-400"
                }`}
              />
              <AutoResizeTextarea
                value={item.nextGoal}
                onChange={(e) => onUpdate(index, "nextGoal", e.target.value)}
                placeholder="下周目标"
                disabled={disabled}
                className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                  disabled ? "border-gray-200 bg-gray-100 text-gray-500" : "border-gray-200 focus:border-emerald-400"
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="mt-3">
          {showImport ? (
            <div className="flex items-center gap-2">
              <SelectField
                value=""
                onChange={(nextValue) => onImportWork(nextValue)}
                placeholder="选择工作清单中的工作..."
                options={availableWorks.map((w) => ({ value: w.content, label: w.content }))}
                selectClassName="min-w-64 px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => onShowImport(false)}
                className="text-sm text-gray-500 hover:text-gray-700">取消</button>
            </div>
          ) : (
            <button type="button" onClick={() => onShowImport(true)}
              className="rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:text-emerald-600">
              + 添加{title}
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
