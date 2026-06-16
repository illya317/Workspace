import type {
  QcLayoutBlock,
  QcTemplateDetail,
  QcTemplateMethodField,
  QcTemplateMethodGroup,
} from "./types";

export type QcTemplateEditorNodeType = "precheck" | "experiment" | "test" | "module";

export interface QcTemplateEditorTarget {
  productKey: string;
  productName: string;
  stageKey: string;
  stageLabel: string;
  nodeType: QcTemplateEditorNodeType;
  testNameEn?: string;
  testName?: string;
  sequence?: string;
}

export interface QcTemplateEditorTestDraft {
  id: string;
  name: string;
  englishName: string;
  methodName: string;
  templateId?: string;
  sequence?: string;
  defaultOrder?: number;
  order: number;
  source: "yaml" | "draft";
}

export interface QcTemplateEditorLayoutDraft {
  blocks: QcLayoutBlock[];
  tests?: QcTemplateEditorTestDraft[];
}

export interface QcTemplateEditorMethodDraft {
  methodGroups: QcTemplateMethodGroup[];
}

export interface QcTemplateEditorDraft extends QcTemplateEditorTarget {
  draftId: string;
  layoutDraft: QcTemplateEditorLayoutDraft;
  methodDraft: QcTemplateEditorMethodDraft;
  sourceTemplateId?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface QcTemplateModuleLibraryItem {
  id: string;
  title: string;
  displayName: string;
  category: string;
  categoryLabel: string;
  templateId: string;
  status?: string;
  subcomponent?: boolean;
  blocks?: QcLayoutBlock[];
}

export interface QcTemplateInspectionTemplateOption {
  id: string;
  displayName: string;
  templateId: string;
}

export interface QcTemplateInspectionCatalogItem {
  key: string;
  label: string;
  englishName: string;
  methodName: string;
  matchKeys: string[];
  templates: QcTemplateInspectionTemplateOption[];
}

export interface QcTemplateEditorFieldGroup {
  label: string;
  fields: QcTemplateMethodField[];
}

export interface QcTemplateEditorData {
  detail: QcTemplateDetail;
  drafts: QcTemplateEditorDraft[];
  moduleLibrary: QcTemplateModuleLibraryItem[];
  inspectionCatalog: QcTemplateInspectionCatalogItem[];
  fieldGroups: QcTemplateEditorFieldGroup[];
  formulaFunctions: string[];
}

export interface QcTemplateEditorPreview {
  target: QcTemplateEditorTarget;
  blocks: QcLayoutBlock[];
  methodGroups: QcTemplateMethodGroup[];
  errors: string[];
}
