"use client";

import { useEffect, useState } from "react";
import { listAssignedWorkItems } from "./api";
import { useWorkTaskTableSection } from "./WorkTaskTable";
import type { WorkAssignedPlanGroup, WorkItem } from "./types";

export function useAssignedWorkItems({
  enabled,
  onToast,
}: {
  enabled: boolean;
  onToast: (message: string, type: "success" | "error") => void;
}) {
  const [departmentWorks, setDepartmentWorks] = useState<WorkItem[]>([]);
  const [collaborationWorks, setCollaborationWorks] = useState<WorkItem[]>([]);
  const [departmentPlanGroups, setDepartmentPlanGroups] = useState<WorkAssignedPlanGroup[]>([]);
  const [collaborationPlanGroups, setCollaborationPlanGroups] = useState<WorkAssignedPlanGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setDepartmentWorks([]);
      setCollaborationWorks([]);
      setDepartmentPlanGroups([]);
      setCollaborationPlanGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listAssignedWorkItems()
      .then((data) => {
        if (!cancelled) {
          setDepartmentWorks(data.works || []);
          setCollaborationWorks(data.collaborationWorks || []);
          setDepartmentPlanGroups(data.planGroups || []);
          setCollaborationPlanGroups(data.collaborationPlanGroups || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDepartmentWorks([]);
          setCollaborationWorks([]);
          setDepartmentPlanGroups([]);
          setCollaborationPlanGroups([]);
          onToast(err instanceof Error ? err.message : "加载负责/协作事项失败", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, onToast]);

  return { departmentWorks, collaborationWorks, departmentPlanGroups, collaborationPlanGroups, loading };
}

export function useReadOnlyAssignedWorkSection({
  works,
  loading,
  sectionKey,
  sectionTitle,
  tableLabel,
  emptyText,
}: {
  works: WorkItem[];
  loading: boolean;
  sectionKey: string;
  sectionTitle: string;
  tableLabel: string;
  emptyText: string;
}) {
  const [detailId, setDetailId] = useState<number | null>(null);
  return useWorkTaskTableSection({
    works,
    sectionKey,
    sectionTitle,
    tableLabel,
    emptyText,
    loading,
    canEdit: false,
    canSubmit: false,
    canDelete: false,
    saving: false,
    detailId,
    editingId: null,
    editDraft: null,
    workflowRequests: [],
    statusFilter: "active",
    itemTypeFilter: "all",
    groupByObjective: false,
    onDetail: (work) => setDetailId((current) => current === work.id ? null : work.id),
    onEdit: () => {},
    onSave: () => {},
    onSubmitEdit: () => {},
    onCancelEdit: () => {},
    onEditDraftChange: () => {},
    onDelete: () => {},
  });
}
