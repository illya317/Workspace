import type { Dispatch, SetStateAction } from "react";
import type { FormSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import type { RosterSurfaceNavigationProps } from "../../roster-surface";
import { ArchivedDepartmentPositionPage } from "./archive-browser";
import { useDepartmentDetailPaneSection } from "./department-detail-pane";
import type {
  PositionDescriptionTemplate,
  PositionDescriptionTemplateId,
} from "./description-details";
import { usePositionEditorSections } from "./position-editor";
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
  canArchive: boolean;
  canEditDepartment: boolean;
  canEditPosition: boolean;
  createPanel: "department" | "position" | null;
  createPositionCode: string;
  createPositionDescriptionDetailsSurface: FormSurfaceProps;
  createPositionDescriptionDraft: DescriptionDraft;
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
  departmentTreeSelector: (options: { loading: boolean; error: string | null; onClose?: () => void }) => SelectorSurfaceProps<Department>;
  organizationRootSelector: (options: { loading: boolean; error: string | null; onClose?: () => void }) => SelectorSurfaceProps<Department>;
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
  onCreatePosition: (descriptionDraft: DescriptionDraft) => void | Promise<void>;
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
  onSetCreatePositionDescriptionDraft: Dispatch<SetStateAction<DescriptionDraft>>;
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
  const positionEditorSections = usePositionEditorSections({
    position: props.selectedPosition ?? null,
    draft: props.draft,
    descriptionDraft: props.descriptionDraft,
    departmentById: props.departmentById,
    positionsByDepartment: props.positionsByDepartment,
    selection: props.selection,
    showArchived: props.showArchived,
    canArchive: props.canArchive,
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

  const detailPaneBlock = useDepartmentDetailPaneSection({
    selection: props.selection,
    selectedDepartment: props.selectedDepartment,
    selectedDepartmentStats: props.selectedDepartmentStats,
    departmentDraft: props.departmentDraft,
    departmentDescriptionDrafts: props.departmentDescriptionDrafts,
    positionsByDepartment: props.positionsByDepartment,
    isOrganizationMode: props.isOrganizationMode,
    canArchive: props.canArchive,
    canEditDepartment: props.canEditDepartment,
    canEditPosition: props.canEditPosition,
    createPanel: props.createPanel,
    createPositionCode: props.createPositionCode,
    createPositionDescriptionDetailsSurface: props.createPositionDescriptionDetailsSurface,
    createPositionDescriptionDraft: props.createPositionDescriptionDraft,
    createPositionDepartment: props.createPositionDepartment,
    createPositionDraft: props.createPositionDraft,
    departmentById: props.departmentById,
    departmentDirty: props.departmentDirty,
    departmentDescriptionDirty: props.departmentDescriptionDirty,
    saving: props.saving,
    showArchived: props.showArchived,
    positionEditorSections: !props.isOrganizationMode ? positionEditorSections : [],
    setCreatePanel: props.onSetCreatePanel,
    setCreatePositionDescriptionDraft: props.onSetCreatePositionDescriptionDraft,
    setCreatePositionDraft: props.onSetCreatePositionDraft,
    onSelect: props.onSelect,
    onCreatePosition: props.onCreatePosition,
    onUpdateDepartmentDraft: props.onUpdateDepartmentDraft,
    onUpdateDepartmentDescriptionDraft: props.onUpdateDepartmentDescriptionDraft,
    onSaveDepartmentInfo: props.onSaveDepartmentInfo,
    onSaveDepartmentDescription: props.onSaveDepartmentDescription,
    onArchiveDepartment: props.onArchiveDepartment,
  });
  const detailSections = [detailPaneBlock];

  const treeSelector = props.departmentTreeSelector({
    loading: props.loading,
    error: props.error,
  });
  const treeDrawerSelector = props.departmentTreeSelector({
    loading: props.loading,
    error: props.error,
    onClose: () => props.onDrawerOpenChange(false),
  });

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
        sections={detailSections}
        surface={surface}
      />
    );
  }

  return {
    renderArchivedBrowser,
    detailSections,
    treeSelector,
    treeDrawerSelector,
  };
}
