"use client";

import WorkCard from "./WorkCard";
import WorkForm from "./WorkForm";
import { DataSurface, NavigationSurface } from "@workspace/core/ui";
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
      {/* 日常工作 */}
      <div className="mb-8">
        <NavigationSurface kind="disclosure" title="日常工作" count={routineWorks.length} expanded={routineExpanded} onToggle={onToggleRoutine} />
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
              <DataSurface kind="records" records={[]} empty="暂无日常工作项" />
            )}
          </div>
        )}
      </div>

      {/* 其他工作 */}
      <div className="mb-8">
        <NavigationSurface kind="disclosure" title="其他工作" count={nonRoutineWorks.length} expanded={nonRoutineExpanded} onToggle={onToggleNonRoutine} />
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
              <DataSurface kind="records" records={[]} empty="暂无其他工作项" />
            )}
          </div>
        )}
      </div>

      {/* 已归档 */}
      {archivedWorks.length > 0 && (
        <div>
          <NavigationSurface kind="disclosure" title="已归档" count={archivedWorks.length} expanded={archivedExpanded} onToggle={onToggleArchived} />
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
