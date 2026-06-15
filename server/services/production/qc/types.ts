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
  layout?: QcTemplateLayoutAssignment;
  methodFile?: string;
  methodGroups: QcTemplateMethodGroup[];
}

export interface QcTemplateStage {
  key: string;
  label: string;
  precheckItemCount: number;
  documentCount: number;
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
