import type { Dispatch, SetStateAction } from "react";
import type { PageSurfaceBlockSpec } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
import { ArchivedDepartmentPositionPage } from "./archive-browser";
import { useDepartmentDetailPaneBlock } from "./department-detail-pane";
import type {
  PositionDescriptionTemplate,
  PositionDescriptionTemplateId,
} from "./description-details";
import {
  buildDepartmentTreePanelBlock,
  buildOrganizationRootPanelBlock,
} from "./navigation-panels";
import { usePositionEditorBlocks } from "./position-editor";
import type {
  ArchivedEntityTab,
  Department,
  DepartmentDescriptionDraft,
  DepartmentDraft,
  DepartmentPositionStats,
  CreatePositionDraft,
  DescriptionDraft,
  Position,
  PositionDraft,
  Selection,
} from "./types";

export function useDepartmentPositionViewRenderers(props: {
  archivedDepartments: Department[];
  archivedPositions: Position[];
  archivedTab: ArchivedEntityTab;
  canEdit: boolean;
  canEditDepartment: boolean;
  canEditPosition: boolean;
  createPanel: "department" | "position" | null;
  createPositionCode: string;
  createPositionDepartment: Department | undefined;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  departmentDescriptionDirty: boolean;
  departmentDescriptionDrafts: DepartmentDescriptionDraft[];
  departmentDirty: boolean;
  departmentDraft: DepartmentDraft | null;
  departmentNames: Set<string>;
  descriptionDirty: boolean;
  descriptionDraft: DescriptionDraft | null;
  dirty: boolean;
  draft: PositionDraft | null;
  error: string | null;
  isOrganizationMode: boolean;
  loading: boolean;
  positionDescriptionTemplate: PositionDescriptionTemplateId;
  positionDescriptionTemplates: PositionDescriptionTemplate[];
  positionNames: Set<string>;
  positions: Position[];
  positionsByDepartment: Map<number, Position[]>;
  departmentNodeBlock: (department: Department) => PageSurfaceBlockSpec | null;
  organizationRootBlock: (department: Department) => PageSurfaceBlockSpec | null;
  rootDepartments: Department[];
  saving: boolean;
  search: string;
  selectedDepartment: Department | undefined;
  selectedDepartmentStats: DepartmentPositionStats | null | undefined;
  selectedPosition: Position | undefined;
  selectedPositionDescriptionTemplate: PositionDescriptionTemplate;
  selectedPositionDescriptionTemplateDefault: boolean;
  selectedPositionDescriptionTemplateStored: boolean;
  selection: Selection;
  showArchived: boolean;
  templateDraftFields: string[];
  templateDraftName: string;
  templateEditorOpen: boolean;
  treeDrawerOpen: boolean;
  treeOpen: boolean;
  visibleRootDepartments: Department[];
  onArchiveDepartment: (departmentId: number, archived: boolean) => void | Promise<void>;
  onArchivePosition: (positionId: number, archived: boolean) => void | Promise<void>;
  onArchivedTabChange: (tab: ArchivedEntityTab) => void;
  onCollapseAll: (collapsed: boolean) => void;
  onCreatePosition: () => void | Promise<void>;
  onDeletePositionDescriptionTemplate: () => void | Promise<void>;
  onDrawerOpenChange: (open: boolean) => void;
  onOpenPositionDescriptionTemplateEditor: () => void;
  onPositionDescriptionTemplateChange: (value: string) => void;
  onSaveDepartmentDescription: () => void | Promise<void>;
  onSaveDepartmentInfo: () => void | Promise<void>;
  onSavePosition: () => void | Promise<void>;
  onSavePositionDescriptionTemplate: () => void | Promise<void>;
  onSearchChange: (search: string) => void;
  onSelect: (selection: Selection) => void;
  onSetCreatePanel: (panel: "department" | "position" | null) => void;
  onSetCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSideOpenChange: (open: boolean) => void;
  onTemplateDraftNameChange: (name: string) => void;
  onTemplateEditorOpenChange: (open: boolean) => void;
  onTogglePositionDescriptionTemplateField: (field: string) => void;
  onUpdateDepartmentDescriptionDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  onUpdateDepartmentDraft: <K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) => void;
  onUpdateDescriptionDraft: <K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) => void;
  onUpdateDraft: <K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) => void;
  onUpdateDraftCodeSuffix: (value: string, pad?: boolean) => void;
  onUpdateDraftDepartment: (departmentId: number | null) => void;
}) {
  const positionEditorBlocks = usePositionEditorBlocks({
    position: props.selectedPosition ?? null,
    draft: props.draft,
    descriptionDraft: props.descriptionDraft,
    departmentById: props.departmentById,
    positionsByDepartment: props.positionsByDepartment,
    selection: props.selection,
    showArchived: props.showArchived,
    canEdit: props.canEdit,
    canEditPosition: props.canEditPosition,
    dirty: props.dirty,
    descriptionDirty: props.descriptionDirty,
    saving: props.saving,
    positionDescriptionTemplate: props.positionDescriptionTemplate,
    positionDescriptionTemplates: props.positionDescriptionTemplates,
    selectedPositionDescriptionTemplate: props.selectedPositionDescriptionTemplate,
    selectedPositionDescriptionTemplateStored: props.selectedPositionDescriptionTemplateStored,
    selectedPositionDescriptionTemplateDefault: props.selectedPositionDescriptionTemplateDefault,
    templateEditorOpen: props.templateEditorOpen,
    templateDraftName: props.templateDraftName,
    templateDraftFields: props.templateDraftFields,
    positionNames: props.positionNames,
    positions: props.positions,
    departmentNames: props.departmentNames,
    onSelect: props.onSelect,
    onUpdateDraft: props.onUpdateDraft,
    onUpdateDraftDepartment: props.onUpdateDraftDepartment,
    onUpdateDraftCodeSuffix: props.onUpdateDraftCodeSuffix,
    onUpdateDescriptionDraft: props.onUpdateDescriptionDraft,
    onPositionDescriptionTemplateChange: props.onPositionDescriptionTemplateChange,
    onOpenPositionDescriptionTemplateEditor: props.onOpenPositionDescriptionTemplateEditor,
    onSavePositionDescriptionTemplate: props.onSavePositionDescriptionTemplate,
    onDeletePositionDescriptionTemplate: props.onDeletePositionDescriptionTemplate,
    onTemplateEditorOpenChange: props.onTemplateEditorOpenChange,
    onTemplateDraftNameChange: props.onTemplateDraftNameChange,
    onTogglePositionDescriptionTemplateField: props.onTogglePositionDescriptionTemplateField,
    onSavePosition: props.onSavePosition,
    onArchivePosition: props.onArchivePosition,
  });

  const detailPaneBlock = useDepartmentDetailPaneBlock({
    selection: props.selection,
    selectedDepartment: props.selectedDepartment,
    selectedDepartmentStats: props.selectedDepartmentStats,
    departmentDraft: props.departmentDraft,
    departmentDescriptionDrafts: props.departmentDescriptionDrafts,
    positionsByDepartment: props.positionsByDepartment,
    isOrganizationMode: props.isOrganizationMode,
    canEdit: props.canEdit,
    canEditDepartment: props.canEditDepartment,
    canEditPosition: props.canEditPosition,
    createPanel: props.createPanel,
    createPositionCode: props.createPositionCode,
    createPositionDepartment: props.createPositionDepartment,
    createPositionDraft: props.createPositionDraft,
    departmentById: props.departmentById,
    departmentDirty: props.departmentDirty,
    departmentDescriptionDirty: props.departmentDescriptionDirty,
    saving: props.saving,
    showArchived: props.showArchived,
    positionEditorBlocks: !props.isOrganizationMode ? positionEditorBlocks : [],
    setCreatePanel: props.onSetCreatePanel,
    setCreatePositionDraft: props.onSetCreatePositionDraft,
    onSelect: props.onSelect,
    onCreatePosition: props.onCreatePosition,
    onUpdateDepartmentDraft: props.onUpdateDepartmentDraft,
    onUpdateDepartmentDescriptionDraft: props.onUpdateDepartmentDescriptionDraft,
    onSaveDepartmentInfo: props.onSaveDepartmentInfo,
    onSaveDepartmentDescription: props.onSaveDepartmentDescription,
    onArchiveDepartment: props.onArchiveDepartment,
  });
  const detailBlocks = [detailPaneBlock];

  function treePanelBlocks(mode: "desktop" | "drawer"): PageSurfaceBlockSpec[] {
    return [
      buildDepartmentTreePanelBlock({
        mode,
        isOrganizationMode: props.isOrganizationMode,
        search: props.search,
        loading: props.loading,
        error: props.error,
        rootDepartments: props.rootDepartments,
        onSearchChange: props.onSearchChange,
        onClose: () => props.onDrawerOpenChange(false),
        onCollapseAll: props.onCollapseAll,
        departmentNodeBlock: props.departmentNodeBlock,
      }),
    ];
  }

  function organizationRootPanelBlocks(mode: "desktop" | "drawer"): PageSurfaceBlockSpec[] {
    return [
      buildOrganizationRootPanelBlock({
        mode,
        loading: props.loading,
        error: props.error,
        departments: props.visibleRootDepartments,
        onClose: () => props.onDrawerOpenChange(false),
        organizationRootBlock: props.organizationRootBlock,
      }),
    ];
  }

  function renderArchivedBrowser(surface?: RosterSurfaceNavigationProps) {
    return (
      <ArchivedDepartmentPositionPage
        archivedDepartments={props.archivedDepartments}
        archivedPositions={props.archivedPositions}
        archivedTab={props.archivedTab}
        selection={props.selection}
        sideOpen={props.treeOpen}
        drawerOpen={props.treeDrawerOpen}
        onArchivedTabChange={props.onArchivedTabChange}
        onSideOpenChange={props.onSideOpenChange}
        onDrawerOpenChange={props.onDrawerOpenChange}
        onSelect={props.onSelect}
        blocks={detailBlocks}
        surface={surface}
      />
    );
  }

  return {
    renderArchivedBrowser,
    detailBlocks,
    organizationRootPanelBlocks,
    treePanelBlocks,
  };
}
