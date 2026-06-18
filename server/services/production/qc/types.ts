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

export interface QcProductStageSummary { key: string; label: string; itemCount: number }

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

export interface QcRecommendedRange { min?: number | null; max?: number | null }

export type QcLayoutPartType = "text" | "hint" | "note" | "line" | "date" | "duration_days" | "duration_hours" | "radio" | "checkbox" | "select" | "field" | "br" | "param" | "section_heading" | "test_value";

export interface QcLayoutPart {
  type: QcLayoutPartType | string;
  text?: string;
  sectionRef?: string;
  sectionSuffix?: string;
  fieldKey?: string;
  field?: string;
  name?: string;
  options?: string[];
  width?: string;
  underline?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  withTime?: boolean;
  inputType?: string;
  defaultValue?: string;
  defaultOffsetDays?: number;
  readonlyDisplay?: boolean;
  referenceFieldKey?: string;
  reference_field_key?: string;
  valueSource?: { type?: string; fieldKey?: string; field_key?: string };
  value_source?: { type?: string; fieldKey?: string; field_key?: string };
  occurrence?: number;
  startKey?: string;
  endKey?: string;
  startHourKey?: string;
  endHourKey?: string;
  recommendedRange?: QcRecommendedRange; summaryDay?: number;
  advancedFormulaText?: string;
  advancedFormulaTextMap?: Record<string, string>;
  advancedFormulaValueFieldKey?: string;
  advancedDependencyFieldKeys?: string[];
  advancedDependencyFieldKeyMap?: Record<string, string[]>;
  advancedDependencyValueFieldKey?: string;
  path?: string;
  stripPlaceholder?: boolean;
  bold?: boolean;
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
  sectionSlot?: string;
  sectionRole?: string;
  sectionRef?: string;
  sectionAnchor?: boolean;
  fieldPrefix?: string; fileSectionSuffix?: string; fileTitle?: string;
  inspectionDateKey?: string;
  completionDateKey?: string;
  judgmentDateKey?: string;
  packagingKey?: string;
  sampleQuantityKey?: string;
  fieldKeyOverrides?: Record<string, string>;
  sourceTemplateId?: string;
  compactTable?: boolean;
  rows?: QcLayoutCell[][];
  columnWidths?: string[];
  rowHeights?: string[];
  parts?: QcLayoutPart[];
  devices?: Array<{ name: string; status?: string }>;
  materials?: Array<{ name: string }>; standards?: Array<{ name: string }>;
  items?: string[];
  temperatureRange?: string;
  humidityLimit?: string;
  roomRows?: number;
  hasValue?: boolean;
  autoJudgment?: boolean;
  conclusionName?: string;
  unit?: string;
  fieldKey?: string;
  buttonText?: string;
  order?: number;
  moduleOrder?: number;
}

export interface QcTemplateMethodField {
  name: string;
  fieldKey: string;
  group: string;
  type?: string;
  attr?: string;
  unit?: string;
  formula?: string;
  rule?: string;
  referenceFieldKey?: string;
  reference_field_key?: string;
  valueSource?: { type?: string; fieldKey?: string; field_key?: string };
  value_source?: { type?: string; fieldKey?: string; field_key?: string };
  options?: string[];
  defaultValue?: string;
  recommendedValue?: string;
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
  conclusionFieldKey?: string;
  hasNumericConclusion: boolean;
  cleanupItems?: string[];
  layout?: QcTemplateLayoutAssignment;
  layoutBlocks?: QcLayoutBlock[];
  methodFile?: string;
  methodGroups: QcTemplateMethodGroup[];
  copyFromPackaging?: boolean;
  copiedFrom?: {
    stage?: string;
    sequence?: string;
    key?: string;
    name?: string;
  };
  packagingReferencePhrases?: string[];
}

export interface QcTemplatePrecheckFile { name: string; code: string }

export interface QcTemplatePrecheckItem { name: string }

export interface QcTemplateStage {
  key: string;
  label: string;
  precheckItemCount: number;
  documentCount: number;
  precheckInfo: Record<string, string>;
  precheckFiles: QcTemplatePrecheckFile[];
  precheckItems: QcTemplatePrecheckItem[];
  precheckLayoutBlocks?: QcLayoutBlock[];
  experimentLayoutBlocks?: QcLayoutBlock[];
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

export type {
  QcTemplateFeedbackContext,
  QcTemplateFeedbackItem,
  QcTemplateFeedbackItemType,
  QcTemplateFeedbackList,
  QcTemplateFeedbackSectionKey,
  QcTemplateFeedbackSections,
  QcTemplateFeedbackState,
  QcTemplateInlineFeedbackEntry,
  QcTemplateInlineFeedbackTarget,
  QcTemplateInlineFeedbackTargetKind,
} from "./feedback-types";

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
  counts: { total: number; draft: number; submitted: number };
}

export interface QcBatchCreateInput { productKey: string; batchNumber: string }
