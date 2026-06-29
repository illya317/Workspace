"use client";

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "@workspace/core/ui";
import { type HRUser, hrCanEdit } from "@workspace/hr/types";
import type { DepartmentPositionMode, Position } from "./department-position/types";
import { DepartmentPositionMainContent } from "./department-position/department-position-main-content";
import { useDepartmentPositionDerivedState } from "./department-position/derived-state";
import { OrganizationModePanel } from "./department-position/organization-mode-panel";
import { useDepartmentPositionActions } from "./department-position/use-department-position-actions";
import { useDepartmentPositionData } from "./department-position/use-department-position-data";
import { useDepartmentPositionDrafts } from "./department-position/use-department-position-drafts";
import { useDepartmentPositionNavigation } from "./department-position/use-department-position-navigation";
import { useDepartmentPositionSideEffects } from "./department-position/use-department-position-side-effects";
import { useDepartmentPositionTreeRenderers } from "./department-position/use-department-position-tree-renderers";
import { useDepartmentPositionViewRenderers } from "./department-position/use-department-position-view-renderers";
import { usePositionDescriptionTemplates } from "./department-position/use-position-description-templates";
import { usePositionDescriptionDetailsSurface } from "./department-position/detail-editors";
import type { RosterSurfaceNavigationProps } from "../roster-surface";


export default function DepartmentPositionTab({
  user,
  mode = "position",
  lifecycle = "active",
  focusDepartmentId = null,
  focusPositionId = null,
  surface,
  onFocusDepartmentConsumed,
  onFocusPositionConsumed,
  onOpenDepartmentDetails,
  onOpenPositionDetails,
  onUnsavedChange,
}: {
  user: HRUser;
  mode?: DepartmentPositionMode;
  lifecycle?: "active" | "archived";
  focusDepartmentId?: number | null;
  focusPositionId?: number | null;
  surface?: RosterSurfaceNavigationProps;
  onFocusDepartmentConsumed?: () => void;
  onFocusPositionConsumed?: () => void;
  onOpenDepartmentDetails?: (departmentId: number) => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onUnsavedChange?: (dirty: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();
  const setToast = useCallback((toast: { message: string; type: "success" | "error" } | null) => {
    if (toast) feedback.notify(toast.message, toast.type);
    else feedback.closeToast();
  }, [feedback]);
  async function showActionPrompt(title: string, message: string, danger: boolean) {
    await feedback.confirm({
      title,
      message,
      confirmLabel: "关闭",
      confirmDanger: danger,
      showCancel: false,
    });
  }
  const isOrganizationMode = mode === "organization";
  const {
    activeOrganizationRootId,
    archivedTab,
    collapsedDepartments,
    createPanel,
    createPositionDescriptionDraft,
    createPositionDraft,
    search,
    selectItem,
    selection,
    setActiveOrganizationRootId,
    setArchivedTab,
    setCollapsedDepartments,
    setCreatePanel,
    setCreatePositionDescriptionDraft,
    setCreatePositionDraft,
    setSearch,
    setSelection,
    setShowArchived,
    setTreeDrawerOpen,
    setTreeOpen,
    showArchived,
    treeDrawerOpen,
    treeOpen,
  } = useDepartmentPositionNavigation({ mode });
  useEffect(() => {
    if (mode === "organization") return;
    setShowArchived(lifecycle === "archived");
    if (lifecycle === "archived") setArchivedTab("departments");
  }, [lifecycle, mode, setArchivedTab, setShowArchived]);
  const {
    deletePositionDescriptionTemplate,
    handlePositionDescriptionTemplateChange,
    openPositionDescriptionTemplateEditor,
    positionDescriptionTemplate,
    positionDescriptionTemplates,
    savePositionDescriptionTemplate,
    selectedPositionDescriptionTemplate,
    selectedPositionDescriptionTemplateDefault,
    selectedPositionDescriptionTemplateStored,
    setTemplateDraftName,
    setTemplateEditorOpen,
    templateDraftFields,
    templateDraftName,
    templateEditorOpen,
    togglePositionDescriptionTemplateField,
  } = usePositionDescriptionTemplates({ confirmDelete: feedback.confirmDelete, enabled: !isOrganizationMode, setToast });

  const canEdit = hrCanEdit(user);
  const canEditDepartment = canEdit && !isOrganizationMode && !showArchived;
  const canEditPosition = canEdit && !isOrganizationMode && !showArchived;
  const { departments, error, loadData, loading, positions } = useDepartmentPositionData({
    compact: isOrganizationMode,
    setSelection,
    showArchived,
  });
  useEffect(() => {
    if (mode !== "position" || !focusDepartmentId) return;
    if (!departments.some((department) => department.id === focusDepartmentId)) return;
    setShowArchived(false);
    setSelection({ type: "department", id: focusDepartmentId });
    setTreeDrawerOpen(false);
    onFocusDepartmentConsumed?.();
  }, [departments, focusDepartmentId, mode, onFocusDepartmentConsumed, setSelection, setShowArchived, setTreeDrawerOpen]);
  useEffect(() => {
    if (mode !== "position" || !focusPositionId) return;
    if (!positions.some((position) => position.id === focusPositionId)) return;
    setShowArchived(false);
    setSelection({ type: "position", id: focusPositionId });
    setTreeDrawerOpen(false);
    onFocusPositionConsumed?.();
  }, [focusPositionId, mode, onFocusPositionConsumed, positions, setSelection, setShowArchived, setTreeDrawerOpen]);
  const {
    archivedDepartments,
    archivedPositions,
    createPositionCode,
    createPositionDepartment,
    departmentById,
    departmentNames,
    departmentStats,
    positionNames,
    positionsByDepartment,
    rootDepartments,
    selectedDepartment,
    selectedDepartmentStats,
    selectedPosition,
    visibleDepartmentIds,
    visibleRootDepartments,
  } = useDepartmentPositionDerivedState({
    activeOrganizationRootId,
    createPositionDraft,
    departments,
    isOrganizationMode,
    positions,
    search,
    selection,
  });
  const organizationSelectedDepartment = isOrganizationMode && selectedPosition?.departmentId
    ? departmentById.get(selectedPosition.departmentId)
    : selectedDepartment;
  const createPositionDescriptionDetailsSurface = usePositionDescriptionDetailsSurface({
    value: createPositionDescriptionDraft.details,
    disabled: saving,
    positionNames,
    currentPosition: {
      id: 0,
      code: createPositionCode,
      name: createPositionDraft.name,
      departmentName: createPositionDepartment?.name ?? "",
    } as Position,
    positions,
    departmentNames,
    template: selectedPositionDescriptionTemplate,
    onChange: (value) => setCreatePositionDescriptionDraft((prev) => ({ ...prev, details: value })),
  });
  useEffect(() => {
    if (!isOrganizationMode) return;
    setActiveOrganizationRootId((prev) => {
      if (prev && visibleRootDepartments.some((department) => department.id === prev)) return prev;
      return visibleRootDepartments[0]?.id ?? null;
    });
  }, [isOrganizationMode, setActiveOrganizationRootId, visibleRootDepartments]);
  useEffect(() => {
    if (!isOrganizationMode || activeOrganizationRootId === null) return;
    setCollapsedDepartments((prev) => {
      if (!prev.has(activeOrganizationRootId)) return prev;
      const next = new Set(prev);
      next.delete(activeOrganizationRootId);
      return next;
    });
  }, [activeOrganizationRootId, isOrganizationMode, setCollapsedDepartments]);
  const {
    departmentTreeSelector,
    organizationRootSelector,
  } = useDepartmentPositionTreeRenderers({
    activeOrganizationRootId,
    collapsedDepartments,
    departmentStats,
    departments,
    search,
    selection,
    onSearchChange: setSearch,
    setActiveOrganizationRootId,
    setCollapsedDepartments,
    selectItem,
    visibleDepartmentIds,
  });
  const {
    departmentDescriptionDirty,
    departmentDescriptionDrafts,
    departmentDirty,
    departmentDraft,
    descriptionDirty,
    descriptionDraft,
    dirty,
    draft,
    positionDirty,
    updateDepartmentDescriptionDraft,
    updateDepartmentDraft,
    updateDescriptionDraft,
    updateDraft,
    updateDraftCodeSuffix,
    updateDraftDepartment,
  } = useDepartmentPositionDrafts({
    departmentById,
    selectedDepartment,
    selectedPosition,
  });
  const hasUnsavedChanges = dirty || departmentDirty || departmentDescriptionDirty;
  useEffect(() => {
    if (isOrganizationMode) return;
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, isOrganizationMode, onUnsavedChange]);
  const {
    createPosition,
    saveDepartmentDescription,
    saveDepartmentInfo,
    savePosition,
    setDepartmentArchived,
    setPositionArchived,
  } = useDepartmentPositionActions({
    createPositionCode,
    createPositionDescriptionDraft,
    createPositionDraft,
    departmentById,
    departmentDescriptionDirty,
    departmentDescriptionDrafts,
    departmentDirty,
    departmentDraft,
    descriptionDirty,
    descriptionDraft,
    draft,
    loadData,
    positionDirty,
    positions,
    selectedDepartment,
    selectedPosition,
    setCreatePanel,
    setCreatePositionDescriptionDraft,
    setCreatePositionDraft,
    setSaving,
    setSelection,
    setToast,
    showActionPrompt,
  });

  const { setAllDepartmentsCollapsed } = useDepartmentPositionSideEffects({
    archivedDepartments,
    archivedPositions,
    archivedTab,
    departments,
    setCollapsedDepartments,
    setSelection,
    showArchived,
  });

  const {
    detailBlocks,
    renderArchivedBrowser,
    treeSelector,
    treeDrawerSelector,
  } = useDepartmentPositionViewRenderers({
    archivedDepartments,
    archivedPositions,
    archivedTab,
    canEdit,
    canEditDepartment,
    canEditPosition,
    createPanel,
    createPositionCode,
    createPositionDescriptionDetailsSurface,
    createPositionDescriptionDraft,
    createPositionDepartment,
    createPositionDraft,
    departmentById,
    departmentDescriptionDirty,
    departmentDescriptionDrafts,
    departmentDirty,
    departmentDraft,
    departmentNames,
    descriptionDirty,
    descriptionDraft,
    dirty,
    draft,
    error,
    isOrganizationMode,
    loading,
    positionDescriptionTemplate,
    positionDescriptionTemplates,
    positionNames,
    positions,
    positionsByDepartment,
    departmentTreeSelector,
    organizationRootSelector,
    rootDepartments,
    saving,
    search,
    selectedDepartment,
    selectedDepartmentStats,
    selectedPosition,
    selectedPositionDescriptionTemplate,
    selectedPositionDescriptionTemplateDefault,
    selectedPositionDescriptionTemplateStored,
    selection,
    showArchived,
    templateDraftFields,
    templateDraftName,
    templateEditorOpen,
    treeDrawerOpen,
    treeOpen,
    visibleRootDepartments,
    onArchiveDepartment: setDepartmentArchived,
    onArchivePosition: setPositionArchived,
    onArchivedTabChange: setArchivedTab,
    onCollapseAll: setAllDepartmentsCollapsed,
    onCreatePosition: createPosition,
    onDeletePositionDescriptionTemplate: deletePositionDescriptionTemplate,
    onDrawerOpenChange: setTreeDrawerOpen,
    onOpenPositionDescriptionTemplateEditor: openPositionDescriptionTemplateEditor,
    onPositionDescriptionTemplateChange: handlePositionDescriptionTemplateChange,
    onSaveDepartmentDescription: saveDepartmentDescription,
    onSaveDepartmentInfo: saveDepartmentInfo,
    onSavePosition: savePosition,
    onSavePositionDescriptionTemplate: savePositionDescriptionTemplate,
    onSearchChange: setSearch,
    onSelect: selectItem,
    onSetCreatePanel: setCreatePanel,
    onSetCreatePositionDescriptionDraft: setCreatePositionDescriptionDraft,
    onSetCreatePositionDraft: setCreatePositionDraft,
    onSideOpenChange: setTreeOpen,
    onTemplateDraftNameChange: setTemplateDraftName,
    onTemplateEditorOpenChange: setTemplateEditorOpen,
    onTogglePositionDescriptionTemplateField: togglePositionDescriptionTemplateField,
    onUpdateDepartmentDescriptionDraft: updateDepartmentDescriptionDraft,
    onUpdateDepartmentDraft: updateDepartmentDraft,
    onUpdateDescriptionDraft: updateDescriptionDraft,
    onUpdateDraft: updateDraft,
    onUpdateDraftCodeSuffix: updateDraftCodeSuffix,
    onUpdateDraftDepartment: updateDraftDepartment,
  });

  if (isOrganizationMode) {
    return (
      <OrganizationModePanel
        canEdit={canEdit}
        createPanel={createPanel}
        departments={departments}
        departmentById={departmentById}
        drawerOpen={treeDrawerOpen}
        error={error}
        loading={loading}
        selectedDepartment={organizationSelectedDepartment}
        selectedPositionId={selectedPosition?.id ?? null}
        positions={positions}
        positionsByDepartment={positionsByDepartment}
        selector={organizationRootSelector({
          loading,
          error,
          onClose: () => setTreeDrawerOpen(false),
        })}
        sideOpen={treeOpen}
        onDrawerOpenChange={setTreeDrawerOpen}
        onCreatePanelChange={setCreatePanel}
        onOpenDepartmentDetails={onOpenDepartmentDetails}
        onOpenPositionDetails={onOpenPositionDetails}
        onSelectPosition={(position) => selectItem({ type: "position", id: position.id })}
        onSideOpenChange={setTreeOpen}
        onUnsavedChange={onUnsavedChange}
        onReload={loadData}
        surface={surface}
      />
    );
  }

  if (showArchived) {
    return renderArchivedBrowser(surface);
  }

  return (
    <DepartmentPositionMainContent
      treeOpen={treeOpen}
      treeDrawerOpen={treeDrawerOpen}
	      treeSelector={treeSelector}
	      treeDrawerSelector={treeDrawerSelector}
	      createPanel={createPanel}
	      departments={departments}
	      departmentById={departmentById}
	      canEdit={canEdit}
      isOrganizationMode={isOrganizationMode}
      showArchived={showArchived}
	      search={search}
	      collapsedDepartments={collapsedDepartments}
	      onSearchChange={setSearch}
	      onCreatePanelChange={setCreatePanel}
      onCollapseAll={setAllDepartmentsCollapsed}
      onLoadData={loadData}
      detailBlocks={detailBlocks}
      onSideOpenChange={setTreeOpen}
      onDrawerOpenChange={setTreeDrawerOpen}
      surface={surface}
    />
  );
}
