"use client";

import { CommandButton, InputControl, PanelCard } from "@workspace/core/ui";
import type { WorkItem } from "./types";
export default function WorkCard({
  work,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onArchive,
  onRestore,
  isFirst,
  isLast
}: {
  work: WorkItem;
  isAdmin: boolean;
  onEdit: (w: WorkItem) => void;
  onDelete: (id: number) => void;
  onMove: (id: number, direction: number) => void;
  onArchive?: (id: number) => void;
  onRestore?: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return <PanelCard bodyClassName="p-4">
      <div className="mb-2 flex items-start gap-3">
        <div className="text-sm font-semibold text-gray-800">{work.content}</div>
        {isAdmin && <div className="ml-auto flex items-center gap-1">
            {!work.isArchived && <>
                <CommandButton onClick={() => onMove(work.id, -1)} disabled={isFirst} size="sm" className="px-1.5 py-0.5 text-xs">
                  ↑
                </CommandButton>
                <CommandButton onClick={() => onMove(work.id, 1)} disabled={isLast} size="sm" className="px-1.5 py-0.5 text-xs">
                  ↓
                </CommandButton>
                <CommandButton onClick={() => onEdit(work)} size="sm" className="px-1.5 py-0.5 text-xs">
                  编辑
                </CommandButton>
                <CommandButton onClick={() => onArchive?.(work.id)} size="sm" className="px-1.5 py-0.5 text-xs">
                  归档
                </CommandButton>
              </>}
            {work.isArchived && <CommandButton onClick={() => onRestore?.(work.id)} size="sm" className="px-1.5 py-0.5 text-xs">
                恢复
              </CommandButton>}
            <CommandButton variant="danger" onClick={() => onDelete(work.id)} size="sm" className="px-1.5 py-0.5 text-xs">
              删除
            </CommandButton>
          </div>}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <InputControl spec={{ valueType: "number", editor: "rating", state: "disabled" }} value={work.importance} ratingLabel="重要度" />
        <InputControl spec={{ valueType: "number", editor: "rating", state: "disabled" }} value={work.urgency} ratingLabel="紧急度" />
      </div>
      {work.participants.length > 0 && <div className="mt-2 text-xs text-gray-500">
          参与人：{work.participants.map(p => p.name).join("、")}
        </div>}
      <div className="mt-1 text-xs text-gray-400">
        创建于 {new Date(work.createdAt).toLocaleDateString("zh-CN")}
      </div>
    </PanelCard>;
}
