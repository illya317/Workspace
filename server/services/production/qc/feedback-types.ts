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

export type QcTemplateFeedbackSectionKey =
  | "descriptionText"
  | "tableLayout"
  | "formulaCalculation"
  | "autoFilledText"
  | "other";

export interface QcTemplateFeedbackSections {
  descriptionText: string;
  tableLayout: string;
  formulaCalculation: string;
  autoFilledText: string;
  other: string;
}

export type QcTemplateInlineFeedbackTargetKind = "heading" | "field";

export interface QcTemplateInlineFeedbackTarget {
  kind: QcTemplateInlineFeedbackTargetKind;
  key: string;
  label: string;
  section?: string;
  badgeKind?: string;
}

export interface QcTemplateInlineFeedbackEntry {
  id: string;
  target: QcTemplateInlineFeedbackTarget;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface QcTemplateFeedbackItem {
  key: string;
  contextKey: string;
  context: QcTemplateFeedbackContext;
  userId: number;
  userName: string;
  note: string;
  sections?: QcTemplateFeedbackSections;
  inlineEntries?: QcTemplateInlineFeedbackEntry[];
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  updatedAt: string;
}

export type QcTemplateFeedbackState = "open" | "resolved";

export interface QcTemplateFeedbackList {
  items: QcTemplateFeedbackItem[];
  keys: string[];
  states: Record<string, QcTemplateFeedbackState>;
}
