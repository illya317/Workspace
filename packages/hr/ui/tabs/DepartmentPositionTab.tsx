"use client";

import { useEffect, useState } from "react";
import { Toast, useConfirm, useConfirmDelete } from "@workspace/core/ui";
import { type HRUser, hrCanEdit } from "@workspace/hr/types";
import type { DepartmentPositionMode } from "./department-position/types";
import { DepartmentPositionActiveWorkspace } from "./department-position/active-workspace";
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
import { DepartmentPositionSearch } from "./department-position/department-position-search";

export default function DepartmentPositionTab({
  user,
  mode = "position",
  lifecycle = "active",
  focusPositionId = null,
  onFocusPositionConsumed,
  onOpenPositionDetails,
  onUnsavedChange,
}: {
  user: HRUser;
  mode?: DepartmentPositionMode;
  lifecycle?: "active" | "archived";
  focusPositionId?: number | null;
  onFocusPositionConsumed?: () => void;
  onOpenPositionDetails?: (positionId: number) => void;
  onUnsavedChange?: (dirty: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const confirm = useConfirm();
  const confirmDelete = useConfirmDelete();
  async function showActionPrompt(title: string, message: string, danger: boolean) {
    await confirm({
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
    createPositionDraft,
    search,
    selectItem,
    selection,
    setActiveOrganizationRootId,
    setArchivedTab,
    setCollapsedDepartments,
    setCreatePanel,
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
  } = usePositionDescriptionTemplates({ confirmDelete, enabled: !isOrganizationMode, setToast });

  const canEdit = hrCanEdit(user);
  const canEditDepartment = canEdit && !isOrganizationMode && !showArchived;
  const canEditPosition = canEdit && !isOrganizationMode && !showArchived;
  const { departments, error, loadData, loading, positions } = useDepartmentPositionData({
    compact: isOrganizationMode,
    setSelection,
    showArchived,
  });
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
    selectedDepartmentParentPath,
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
    renderDepartmentNode,
    renderOrganizationRoot,
  } = useDepartmentPositionTreeRenderers({
    activeOrganizationRootId,
    collapsedDepartments,
    departmentStats,
    departments,
    search,
    selection,
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
    renderArchivedBrowser,
    renderDetailPane,
    renderTreePanel,
  } = useDepartmentPositionViewRenderers({
    archivedDepartments,
    archivedPositions,
    archivedTab,
    canEdit,
    canEditDepartment,
    canEditPosition,
    createPanel,
    createPositionCode,
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
    renderDepartmentNode,
    renderOrganizationRoot,
    rootDepartments,
    saving,
    search,
    selectedDepartment,
    selectedDepartmentParentPath,
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
    toast,
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
    onSetCreatePositionDraft: setCreatePositionDraft,
    onSideOpenChange: setTreeOpen,
    onTemplateDraftNameChange: setTemplateDraftName,
    onTemplateEditorOpenChange: setTemplateEditorOpen,
    onToastClose: () => setToast(null),
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
        drawerOpen={treeDrawerOpen}
        error={error}
        loading={loading}
        selectedDepartment={organizationSelectedDepartment}
        selectedPositionId={selectedPosition?.id ?? null}
        positions={positions}
        positionsByDepartment={positionsByDepartment}
        renderSide={renderTreePanel}
        sideOpen={treeOpen}
        onDrawerOpenChange={setTreeDrawerOpen}
        onOpenPositionDetails={onOpenPositionDetails}
        onSelectPosition={(position) => selectItem({ type: "position", id: position.id })}
        onSideOpenChange={setTreeOpen}
        onUnsavedChange={onUnsavedChange}
        onReload={loadData}
      />
    );
  }

  if (showArchived) {
    return renderArchivedBrowser();
  }

  return (
    <>
      <div className="mb-3">
        <DepartmentPositionSearch
          departments={departments}
          departmentById={departmentById}
          keyword={search}
          positions={positions}
          onKeywordChange={setSearch}
          onSelect={selectItem}
        />
      </div>

      <DepartmentPositionActiveWorkspace
        sideOpen={treeOpen}
        drawerOpen={treeDrawerOpen}
        onSideOpenChange={setTreeOpen}
        onDrawerOpenChange={setTreeDrawerOpen}
        renderSide={renderTreePanel}
      >
        {renderDetailPane()}
      </DepartmentPositionActiveWorkspace>

      <Toast
        message={toast?.message || ""}
        type={toast?.type}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </>
  );
}
