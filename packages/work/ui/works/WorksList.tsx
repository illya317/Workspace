"use client";

import WorkCard from "./WorkCard";
import WorkForm from "./WorkForm";
import { createPageBody, createPageDataBlock, PageSurface } from "@workspace/core/ui";
import type { WorkItem } from "./types";
import type { WorkFormData } from "./WorkFormSection";

interface WorksListProps {
  routineWorks: WorkItem[];
  nonRoutineWorks: WorkItem[];
  archivedWorks: WorkItem[];
  routineExpanded: boolean;
  nonRoutineExpanded: boolean;
  archivedExpanded: boolean;
  onToggleRoutine: () => void;
  onToggleNonRoutine: () => void;
  onToggleArchived: () => void;
  editingWork: WorkItem | null;
  isAdmin: boolean;
  onEdit: (work: WorkItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: WorkFormData) => Promise<void>;
  onDelete: (id: number) => void;
  onMove: (id: number, direction: number) => void;
  onArchive: (id: number) => void;
  onRestore: (id: number) => void;
}

export default function WorksList({
  routineWorks,
  nonRoutineWorks,
  archivedWorks,
  routineExpanded,
  nonRoutineExpanded,
  archivedExpanded,
  onToggleRoutine,
  onToggleNonRoutine,
  onToggleArchived,
  editingWork,
  isAdmin,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMove,
  onArchive,
  onRestore,
}: WorksListProps) {
  return (
    <>
      {/* 日常节点 */}
      <div className="mb-8">
        <DisclosureHeader title="日常节点" count={routineWorks.length} expanded={routineExpanded} onToggle={onToggleRoutine} />
        {routineExpanded && (
          <div className="space-y-3">
            {routineWorks.map((work, index) =>
              editingWork?.id === work.id ? (
                <WorkForm
                  key={work.id}
                  initial={work}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                />
              ) : (
                <WorkCard
                  key={work.id}
                  work={work}
                  isAdmin={isAdmin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                  onArchive={onArchive}
                  isFirst={index === 0}
                  isLast={index === routineWorks.length - 1}
                />
              )
            )}
            {routineWorks.length === 0 && (
              <EmptyWorksSurface blockKey="routine-works-empty" empty="暂无日常节点" />
            )}
          </div>
        )}
      </div>

      {/* 其他节点 */}
      <div className="mb-8">
        <DisclosureHeader title="其他节点" count={nonRoutineWorks.length} expanded={nonRoutineExpanded} onToggle={onToggleNonRoutine} />
        {nonRoutineExpanded && (
          <div className="space-y-3">
            {nonRoutineWorks.map((work, index) =>
              editingWork?.id === work.id ? (
                <WorkForm
                  key={work.id}
                  initial={work}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                />
              ) : (
                <WorkCard
                  key={work.id}
                  work={work}
                  isAdmin={isAdmin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                  onArchive={onArchive}
                  isFirst={index === 0}
                  isLast={index === nonRoutineWorks.length - 1}
                />
              )
            )}
            {nonRoutineWorks.length === 0 && (
              <EmptyWorksSurface blockKey="non-routine-works-empty" empty="暂无其他节点" />
            )}
          </div>
        )}
      </div>

      {/* 已归档 */}
      {archivedWorks.length > 0 && (
        <div>
          <DisclosureHeader title="已归档" count={archivedWorks.length} expanded={archivedExpanded} onToggle={onToggleArchived} />
          {archivedExpanded && (
            <div className="space-y-3">
              {archivedWorks.map((work) =>
                editingWork?.id === work.id ? (
                  <WorkForm
                    key={work.id}
                    initial={work}
                    onSave={onSaveEdit}
                    onCancel={onCancelEdit}
                  />
                ) : (
                  <WorkCard
                    key={work.id}
                    work={work}
                    isAdmin={isAdmin}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMove={onMove}
                    onRestore={onRestore}
                    isFirst={false}
                    isLast={false}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EmptyWorksSurface({ blockKey, empty }: { blockKey: string; empty: string }) {
  return <PageSurface embedded kind="list" body={createPageBody([createPageDataBlock(blockKey, { kind: "records", records: [], empty })])} />;
}

function DisclosureHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="mb-3 block w-full text-left text-sm font-semibold text-slate-900"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 pb-2">
        <span className="min-w-0 truncate">{title} <span className="font-normal text-slate-500">({count})</span></span>
        <span className="text-slate-500">{expanded ? "收起" : "展开"}</span>
      </span>
    </button>
  );
}
