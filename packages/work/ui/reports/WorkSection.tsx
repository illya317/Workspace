"use client";

import { useConfirmDelete } from "@workspace/core/ui/ConfirmProvider";
import { ActionButton, SectionCard, TextareaField } from "@workspace/core/ui";
import SelectField from "@workspace/core/ui/SelectField";

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
          <div key={index} className="border-l border-slate-200 pl-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">{item.plan || `第 ${index + 1} 条`}</span>
              {!disabled && (
                <div className="ml-auto flex gap-1">
                  <ActionButton onClick={() => onMove(index, -1)} disabled={index === 0} className="px-2 py-0.5 text-xs">
                    ↑
                  </ActionButton>
                  <ActionButton onClick={() => onMove(index, 1)} disabled={index === items.length - 1} className="px-2 py-0.5 text-xs">
                    ↓
                  </ActionButton>
                  <ActionButton variant="danger" onClick={() => confirmRemove(index)} className="px-2 py-0.5 text-xs">
                    删除
                  </ActionButton>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <TextareaField
                value={item.completion}
                onChange={(value) => onUpdate(index, "completion", value)}
                placeholder={item.lastWeekGoal || "完成情况"}
                disabled={disabled}
                rows={1}
                className="text-sm"
              />
              <TextareaField
                value={item.nextGoal}
                onChange={(value) => onUpdate(index, "nextGoal", value)}
                placeholder="下周目标"
                disabled={disabled}
                rows={1}
                className="text-sm"
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
                placeholder="选择工作计划中的工作..."
                options={availableWorks.map((w) => ({ value: w.content, label: w.content }))}
                selectClassName="min-w-64 px-3 py-2 text-sm"
              />
              <ActionButton onClick={() => onShowImport(false)} className="px-3 py-2 text-sm">
                取消
              </ActionButton>
            </div>
          ) : (
            <ActionButton onClick={() => onShowImport(true)} className="border-dashed px-4 py-2 text-sm">
              + 添加{title}
            </ActionButton>
          )}
        </div>
      )}
    </SectionCard>
  );
}
