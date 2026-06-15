export interface QcSourceStatus {
  root: string;
  configRoot: string;
  available: boolean;
  message?: string;
  gitAvailable?: boolean;
  revision?: string;
  dirty?: boolean;
  changedFileCount?: number;
  changedFiles?: string[];
}

export interface QcProductStageSummary {
  key: string;
  label: string;
  itemCount: number;
}

export interface QcProductSummary {
  name: string;
  stageCount: number;
  itemCount: number;
  stages: QcProductStageSummary[];
}

export interface QcRecordTemplateSummary {
  id: string;
  fileName: string;
  productName: string;
  stageCount: number;
  itemCount: number;
}

export interface QcMethodSummary {
  id: string;
  fileName: string;
  methodCount: number;
  fieldCount: number;
}

export interface QcLayoutAssignmentSample {
  key: string;
  templateId: string;
  status: string;
  sourceRef?: string;
}

export interface QcLayoutMappingSummary {
  schemaVersion?: number;
  assignmentCount: number;
  statusCounts: Record<string, number>;
  samples: QcLayoutAssignmentSample[];
}

export interface QcConfigOverview {
  source: QcSourceStatus;
  products: QcProductSummary[];
  recordTemplates: QcRecordTemplateSummary[];
  methods: QcMethodSummary[];
  layoutMapping: QcLayoutMappingSummary;
}

export interface QcTemplateLayoutAssignment {
  key: string;
  templateId: string;
  status: string;
  sourceRef?: string;
  familyId?: string;
  reusedFrom?: string;
  params: Record<string, unknown>;
}

export type QcLayoutPartType = "text" | "note" | "line" | "date" | "radio" | "checkbox" | "field" | "br" | "param";

export interface QcLayoutPart {
  type: QcLayoutPartType | string;
  text?: string;
  fieldKey?: string;
  field?: string;
  name?: string;
  options?: string[];
  width?: string;
  withTime?: boolean;
  defaultValue?: string;
  readonlyDisplay?: boolean;
}

export interface QcLayoutCell {
  rawText: string;
  parts: QcLayoutPart[];
  colspan: number;
  rowspan: number;
  isEmpty: boolean;
  header?: boolean;
  align?: string;
  bold?: boolean;
  width?: string;
  className?: string;
}

export interface QcLayoutBlock {
  type: "table" | string;
  label?: string;
  title?: string;
  text?: string;
  sectionSuffix?: string;
  sectionRole?: string;
  sectionAnchor?: boolean;
  fieldPrefix?: string;
  rows?: QcLayoutCell[][];
  parts?: QcLayoutPart[];
  devices?: Array<{ name: string; status?: string }>;
  items?: string[];
  temperatureRange?: string;
  humidityLimit?: string;
  roomRows?: number;
  hasValue?: boolean;
  autoJudgment?: boolean;
  conclusionName?: string;
  unit?: string;
  order?: number;
  moduleOrder?: number;
}

export interface QcTemplateMethodField {
  name: string;
  group: string;
  type?: string;
  attr?: string;
  unit?: string;
  formula?: string;
}

export interface QcTemplateMethodGroup {
  name: string;
  fields: QcTemplateMethodField[];
}

export interface QcTemplateTestItem {
  sequence: string;
  name: string;
  englishName: string;
  methodName: string;
  standardText?: string;
  conclusionName?: string;
  hasNumericConclusion: boolean;
  cleanupItems?: string[];
  layout?: QcTemplateLayoutAssignment;
  layoutBlocks?: QcLayoutBlock[];
  methodFile?: string;
  methodGroups: QcTemplateMethodGroup[];
}

export interface QcTemplatePrecheckFile {
  name: string;
  code: string;
}

export interface QcTemplatePrecheckItem {
  name: string;
}

export interface QcTemplateStage {
  key: string;
  label: string;
  precheckItemCount: number;
  documentCount: number;
  precheckInfo: Record<string, string>;
  precheckFiles: QcTemplatePrecheckFile[];
  precheckItems: QcTemplatePrecheckItem[];
  tests: QcTemplateTestItem[];
}

export interface QcTemplateDetail {
  source: QcSourceStatus;
  id: string;
  fileName: string;
  productName: string;
  stages: QcTemplateStage[];
  methodFileCount: number;
  layoutAssignmentCount: number;
}

export type QcTemplateFeedbackItemType = "precheck" | "experiment" | "test";

export interface QcTemplateFeedbackContext {
  productKey: string;
  productName: string;
  stageKey?: string;
  stageLabel?: string;
  itemType: QcTemplateFeedbackItemType;
  sequence?: string;
  testName?: string;
  testNameEn?: string;
  methodName?: string;
  layoutKey?: string;
  templateId?: string;
}

export interface QcTemplateFeedbackItem {
  key: string;
  context: QcTemplateFeedbackContext;
  note: string;
  updatedAt: string;
}

export interface QcTemplateFeedbackList {
  items: QcTemplateFeedbackItem[];
  keys: string[];
}

export type QcBatchStatus = "draft" | "submitted";

export interface QcBatchSummary {
  id: number;
  batchNumber: string;
  productKey: string;
  productName: string;
  inspector: string;
  status: QcBatchStatus;
  createdAt: string;
  updatedAt: string;
  fields: Record<string, string>;
}

export interface QcBatchList {
  batches: QcBatchSummary[];
  counts: {
    total: number;
    draft: number;
    submitted: number;
  };
}

export interface QcBatchCreateInput {
  productKey: string;
  batchNumber: string;
}
