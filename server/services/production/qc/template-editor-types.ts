import type {
  QcLayoutBlock,
  QcTemplateDetail,
  QcTemplateMethodField,
  QcTemplateMethodGroup,
} from "./types";

export type QcTemplateEditorNodeType = "precheck" | "experiment" | "test";

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

export interface QcTemplateEditorLayoutDraft {
  blocks: QcLayoutBlock[];
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
  category: string;
  templateId: string;
  status?: string;
  subcomponent?: boolean;
  blocks?: QcLayoutBlock[];
}

export interface QcTemplateEditorFieldGroup {
  label: string;
  fields: QcTemplateMethodField[];
}

export interface QcTemplateEditorData {
  detail: QcTemplateDetail;
  drafts: QcTemplateEditorDraft[];
  moduleLibrary: QcTemplateModuleLibraryItem[];
  fieldGroups: QcTemplateEditorFieldGroup[];
  formulaFunctions: string[];
}

export interface QcTemplateEditorPreview {
  target: QcTemplateEditorTarget;
  blocks: QcLayoutBlock[];
  methodGroups: QcTemplateMethodGroup[];
  errors: string[];
}
