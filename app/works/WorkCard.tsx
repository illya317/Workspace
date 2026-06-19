"use client";

import { PanelCard } from "@workspace/core/ui";
import StarRating from "./StarRating";
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
      <div className="mb-2 flex items-start justify-between">
        <h4 className="text-sm font-semibold text-gray-800">{work.content}</h4>
        {isAdmin && (
          <div className="flex items-center gap-1">
            {!work.isArchived && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(work.id, -1)}
                  disabled={isFirst}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(work.id, 1)}
                  disabled={isLast}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(work)}
                  className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => onArchive?.(work.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >
                  归档
                </button>
              </>
            )}
            {work.isArchived && (
              <button
                type="button"
                onClick={() => onRestore?.(work.id)}
                className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50"
              >
                恢复
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(work.id)}
              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <StarRating value={work.importance} readOnly label="重要度" />
        <StarRating value={work.urgency} readOnly label="紧急度" />
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
