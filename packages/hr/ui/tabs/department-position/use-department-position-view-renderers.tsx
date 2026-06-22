import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ArchivedDepartmentPositionPage } from "./archive-browser";
import { DepartmentDetailPane } from "./department-detail-pane";
import type {
  PositionDescriptionTemplate,
  PositionDescriptionTemplateId,
} from "./description-details";
import {
  DepartmentTreePanel,
  OrganizationRootPanel,
} from "./navigation-panels";
import { PositionEditor } from "./position-editor";
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
  createPanel: "position" | null;
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
  renderDepartmentNode: (department: Department, level?: number) => ReactNode;
  renderOrganizationRoot: (department: Department) => ReactNode;
  rootDepartments: Department[];
  saving: boolean;
  search: string;
  selectedDepartment: Department | undefined;
  selectedDepartmentParentPath: string;
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
  toast: { message: string; type: "success" | "error" } | null;
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
  onSetCreatePanel: (panel: "position" | null) => void;
  onSetCreatePositionDraft: Dispatch<SetStateAction<CreatePositionDraft>>;
  onSideOpenChange: (open: boolean) => void;
  onTemplateDraftNameChange: (name: string) => void;
  onTemplateEditorOpenChange: (open: boolean) => void;
  onToastClose: () => void;
  onTogglePositionDescriptionTemplateField: (field: string) => void;
  onUpdateDepartmentDescriptionDraft: <K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) => void;
  onUpdateDepartmentDraft: <K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) => void;
  onUpdateDescriptionDraft: <K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) => void;
  onUpdateDraft: <K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) => void;
  onUpdateDraftCodeSuffix: (value: string, pad?: boolean) => void;
  onUpdateDraftDepartment: (departmentId: number | null) => void;
}) {
  function renderPositionEditor() {
    if (!props.selectedPosition) return null;
    return (
      <PositionEditor
        position={props.selectedPosition}
        draft={props.draft}
        descriptionDraft={props.descriptionDraft}
        departmentById={props.departmentById}
        positionsByDepartment={props.positionsByDepartment}
        selection={props.selection}
        showArchived={props.showArchived}
        canEdit={props.canEdit}
        canEditPosition={props.canEditPosition}
        dirty={props.dirty}
        descriptionDirty={props.descriptionDirty}
        saving={props.saving}
        positionDescriptionTemplate={props.positionDescriptionTemplate}
        positionDescriptionTemplates={props.positionDescriptionTemplates}
        selectedPositionDescriptionTemplate={props.selectedPositionDescriptionTemplate}
        selectedPositionDescriptionTemplateStored={props.selectedPositionDescriptionTemplateStored}
        selectedPositionDescriptionTemplateDefault={props.selectedPositionDescriptionTemplateDefault}
        templateEditorOpen={props.templateEditorOpen}
        templateDraftName={props.templateDraftName}
        templateDraftFields={props.templateDraftFields}
        positionNames={props.positionNames}
        positions={props.positions}
        departmentNames={props.departmentNames}
        onSelect={props.onSelect}
        onUpdateDraft={props.onUpdateDraft}
        onUpdateDraftDepartment={props.onUpdateDraftDepartment}
        onUpdateDraftCodeSuffix={props.onUpdateDraftCodeSuffix}
        onUpdateDescriptionDraft={props.onUpdateDescriptionDraft}
        onPositionDescriptionTemplateChange={props.onPositionDescriptionTemplateChange}
        onOpenPositionDescriptionTemplateEditor={props.onOpenPositionDescriptionTemplateEditor}
        onSavePositionDescriptionTemplate={props.onSavePositionDescriptionTemplate}
        onDeletePositionDescriptionTemplate={props.onDeletePositionDescriptionTemplate}
        onTemplateEditorOpenChange={props.onTemplateEditorOpenChange}
        onTemplateDraftNameChange={props.onTemplateDraftNameChange}
        onTogglePositionDescriptionTemplateField={props.onTogglePositionDescriptionTemplateField}
        onSavePosition={props.onSavePosition}
        onArchivePosition={props.onArchivePosition}
      />
    );
  }

  function renderDetailPane() {
    return (
      <DepartmentDetailPane
        selection={props.selection}
        selectedDepartment={props.selectedDepartment}
        selectedDepartmentParentPath={props.selectedDepartmentParentPath}
        selectedDepartmentStats={props.selectedDepartmentStats}
        departmentDraft={props.departmentDraft}
        departmentDescriptionDrafts={props.departmentDescriptionDrafts}
        positionsByDepartment={props.positionsByDepartment}
        isOrganizationMode={props.isOrganizationMode}
        canEdit={props.canEdit}
        canEditDepartment={props.canEditDepartment}
        canEditPosition={props.canEditPosition}
        createPanel={props.createPanel}
        createPositionCode={props.createPositionCode}
        createPositionDepartment={props.createPositionDepartment}
        createPositionDraft={props.createPositionDraft}
        departmentById={props.departmentById}
        departmentDirty={props.departmentDirty}
        departmentDescriptionDirty={props.departmentDescriptionDirty}
        saving={props.saving}
        showArchived={props.showArchived}
        positionEditor={!props.isOrganizationMode && props.selectedPosition ? renderPositionEditor() : null}
        setCreatePanel={props.onSetCreatePanel}
        setCreatePositionDraft={props.onSetCreatePositionDraft}
        onSelect={props.onSelect}
        onCreatePosition={props.onCreatePosition}
        onUpdateDepartmentDraft={props.onUpdateDepartmentDraft}
        onUpdateDepartmentDescriptionDraft={props.onUpdateDepartmentDescriptionDraft}
        onSaveDepartmentInfo={props.onSaveDepartmentInfo}
        onSaveDepartmentDescription={props.onSaveDepartmentDescription}
        onArchiveDepartment={props.onArchiveDepartment}
      />
    );
  }

  function renderTreePanel(mode: "desktop" | "drawer") {
    return (
      <DepartmentTreePanel
        mode={mode}
        isOrganizationMode={props.isOrganizationMode}
        search={props.search}
        loading={props.loading}
        error={props.error}
        rootDepartments={props.rootDepartments}
        onSearchChange={props.onSearchChange}
        onClose={() => props.onDrawerOpenChange(false)}
        onCollapseAll={props.onCollapseAll}
        renderDepartmentNode={props.renderDepartmentNode}
      />
    );
  }

  function renderOrganizationRootPanel(mode: "desktop" | "drawer") {
    return (
      <OrganizationRootPanel
        mode={mode}
        loading={props.loading}
        error={props.error}
        departments={props.visibleRootDepartments}
        onClose={() => props.onDrawerOpenChange(false)}
        renderOrganizationRoot={props.renderOrganizationRoot}
      />
    );
  }

  function renderArchivedBrowser() {
    return (
      <ArchivedDepartmentPositionPage
        archivedDepartments={props.archivedDepartments}
        archivedPositions={props.archivedPositions}
        archivedTab={props.archivedTab}
        search={props.search}
        selection={props.selection}
        sideOpen={true}
        drawerOpen={props.treeDrawerOpen}
        toast={props.toast}
        onArchivedTabChange={props.onArchivedTabChange}
        onSearchChange={props.onSearchChange}
        onSideOpenChange={props.onSideOpenChange}
        onDrawerOpenChange={props.onDrawerOpenChange}
        onSelect={props.onSelect}
        onToastClose={props.onToastClose}
      >
        {renderDetailPane()}
      </ArchivedDepartmentPositionPage>
    );
  }

  return {
    renderArchivedBrowser,
    renderDetailPane,
    renderOrganizationRootPanel,
    renderTreePanel,
  };
}
