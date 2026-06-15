export interface QcSourceStatus {
  root: string;
  configRoot: string;
  available: boolean;
  message?: string;
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
