"use client";

import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { DepartmentDescriptionDetailsEditor } from "./detail-editors";
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
  const blocks: PageSurfaceBlockSpec[] = drafts.length === 0
    ? [{ kind: "empty", key: "empty", presentation: "plain", content: "暂无部门说明书" }]
    : drafts.map((draft, index) => ({
        kind: "panel" as const,
        key: String(draft.id || `new-${index}`),
        title: draft.name || `部门说明书 ${index + 1}`,
        bodyClassName: "p-3",
        blocks: [
          {
            kind: "moduleView" as const,
            key: "details",
            view: (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DepartmentDescriptionDetailsEditor
                  value={draft.details}
                  disabled={!canEditDepartment}
                  onChange={(value) => onUpdateDraft(index, "details", value)}
                />
              </div>
            ),
          },
        ],
      }));

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[
        {
          kind: "panel",
          key: "department-descriptions",
          title: (
            <div className="flex flex-wrap items-center gap-2">
              <span>部门说明书</span>
              {dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
            </div>
          ),
          bodyClassName: "p-4",
          blocks,
        },
      ]}
    />
  );
}
