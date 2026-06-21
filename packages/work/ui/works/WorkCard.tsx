"use client";

import { ActionButton, PanelCard, RatingControl } from "@workspace/core/ui";
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
  isLast,
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
  return (
    <PanelCard bodyClassName="p-4">
      <div className="mb-2 flex items-start gap-3">
        <div className="text-sm font-semibold text-gray-800">{work.content}</div>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-1">
            {!work.isArchived && (
              <>
                <ActionButton
                  onClick={() => onMove(work.id, -1)}
                  disabled={isFirst}
                  className="px-1.5 py-0.5 text-xs"
                >
                  ↑
                </ActionButton>
                <ActionButton
                  onClick={() => onMove(work.id, 1)}
                  disabled={isLast}
                  className="px-1.5 py-0.5 text-xs"
                >
                  ↓
                </ActionButton>
                <ActionButton
                  onClick={() => onEdit(work)}
                  className="px-1.5 py-0.5 text-xs"
                >
                  编辑
                </ActionButton>
                <ActionButton
                  onClick={() => onArchive?.(work.id)}
                  className="px-1.5 py-0.5 text-xs"
                >
                  归档
                </ActionButton>
              </>
            )}
            {work.isArchived && (
              <ActionButton
                onClick={() => onRestore?.(work.id)}
                className="px-1.5 py-0.5 text-xs"
              >
                恢复
              </ActionButton>
            )}
            <ActionButton
              variant="danger"
              onClick={() => onDelete(work.id)}
              className="px-1.5 py-0.5 text-xs"
            >
              删除
            </ActionButton>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <RatingControl value={work.importance} readOnly label="重要度" />
        <RatingControl value={work.urgency} readOnly label="紧急度" />
      </div>
      {work.participants.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          参与人：{work.participants.map((p) => p.name).join("、")}
        </div>
      )}
      <div className="mt-1 text-xs text-gray-400">
        创建于 {new Date(work.createdAt).toLocaleDateString("zh-CN")}
      </div>
    </PanelCard>
  );
}
