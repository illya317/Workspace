"use client";

import type { Ref } from "react";
import { createPageBody, createEmptySection, createPanelSection, PageSurface, type ConfirmOptions, type BodySurfaceSectionSpec, useFeedback } from "@workspace/core/ui";
import { useScrollToAddedItem } from "../../hooks/useScrollToAddedItem";
import { createDepartmentDescriptionDetailsSections, departmentDescriptionDutyRecords } from "./department-description-details-editor";
import type { DepartmentDescriptionDraft } from "./types";

interface DepartmentDescriptionsBlockOptions {
  drafts: DepartmentDescriptionDraft[];
  dirty: boolean;
  canEditDepartment: boolean;
  onUpdateDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
}

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
  const section = useDepartmentDescriptionsSection({ drafts, dirty, canEditDepartment, onUpdateDraft });
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([section])}
    />
  );
}

export function useDepartmentDescriptionsSection(options: DepartmentDescriptionsBlockOptions): BodySurfaceSectionSpec {
  const feedback = useFeedback();
  const dutyRecords = options.drafts.flatMap((draft) => departmentDescriptionDutyRecords(draft.details));
  const { getItemRef, requestScrollToIndex } = useScrollToAddedItem(dutyRecords);
  return createDepartmentDescriptionsSection({
    ...options,
    confirmDelete: feedback.confirmDelete,
    getDutyItemRef: getItemRef,
    requestDutyScrollToIndex: requestScrollToIndex,
  });
}

function createDepartmentDescriptionsSection({
  drafts,
  dirty,
  canEditDepartment,
  onUpdateDraft,
  confirmDelete,
  getDutyItemRef,
  requestDutyScrollToIndex,
}: {
  drafts: DepartmentDescriptionDraft[];
  dirty: boolean;
  canEditDepartment: boolean;
  onUpdateDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  confirmDelete: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  getDutyItemRef?: (index: number) => Ref<HTMLDivElement>;
  requestDutyScrollToIndex?: (index: number) => void;
}): BodySurfaceSectionSpec {
  let dutyOffset = 0;
  const sections: BodySurfaceSectionSpec[] = drafts.length === 0
    ? [createEmptySection("empty", {
      presentation: "plain",
      content: "暂无部门说明书"
    })]
    : drafts.map((draft, index) => {
        const offset = dutyOffset;
        dutyOffset += departmentDescriptionDutyRecords(draft.details).length;
        return createPanelSection(String(draft.id || `new-${index}`), {
          title: draft.name || `部门说明书 ${index + 1}`,

          sections: createDepartmentDescriptionDetailsSections({
            value: draft.details,
            disabled: !canEditDepartment,
            onChange: (value) => onUpdateDraft(index, "details", value),
            confirmDelete,
            getDutyItemRef: getDutyItemRef ? (itemIndex) => getDutyItemRef(offset + itemIndex) : undefined,
            requestDutyScrollToIndex: requestDutyScrollToIndex ? (itemIndex) => requestDutyScrollToIndex(offset + itemIndex) : undefined,
          }),
        });
      });

  return createPanelSection("department-descriptions", {
    title: (
      <div className="flex flex-wrap items-center gap-2">
        <span>部门说明书</span>
        {dirty && <span className="text-xs text-amber-600">有未保存修改</span>}
      </div>
    ),

    sections,
  });
}
