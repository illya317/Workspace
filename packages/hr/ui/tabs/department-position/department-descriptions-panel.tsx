"use client";

import { EmptyStateCard, PanelCard } from "@workspace/core/ui";
import { DepartmentDescriptionDetailsEditor } from "./detail-editors";
import { DetailSectionHeader } from "./detail-editors";
import type { DepartmentDescriptionDraft } from "./types";

export function DepartmentDescriptionsPanel({
  drafts,
  dirty,
  canEditDepartment,
  onUpdateDraft,
}: {
  drafts: DepartmentDescriptionDraft[];
  dirty: boolean;
  canEditDepartment: boolean;
  onUpdateDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
}) {
  return (
    <PanelCard bodyClassName="p-4">
      <DetailSectionHeader
        title="部门说明书"
        meta={dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
      />
      <div className="space-y-5">
        {drafts.map((draft, index) => (
          <PanelCard key={draft.id || `new-${index}`} bodyClassName="p-3">
            <div className="mb-3 text-sm font-semibold text-slate-900">{draft.name || `部门说明书 ${index + 1}`}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <DepartmentDescriptionDetailsEditor
                value={draft.details}
                disabled={!canEditDepartment}
                onChange={(value) => onUpdateDraft(index, "details", value)}
              />
            </div>
          </PanelCard>
        ))}
        {drafts.length === 0 && <EmptyStateCard compact>暂无部门说明书</EmptyStateCard>}
      </div>
    </PanelCard>
  );
}
