export const WORKFLOW_CATEGORY_KEYS = [
  "assessment",
  "document",
  "hr",
  "collaboration",
  "finance",
  "administration",
  "procurement",
  "contract",
  "quality",
  "it",
] as const;

export type WorkflowCategoryKey = (typeof WORKFLOW_CATEGORY_KEYS)[number];

export interface WorkflowCategoryRegistration {
  key: WorkflowCategoryKey;
  label: string;
  sortOrder: number;
}

export const WORKFLOW_CATEGORY_REGISTRATIONS = [
  { key: "assessment", label: "考核流程", sortOrder: 100 },
  { key: "document", label: "文档流程", sortOrder: 200 },
  { key: "hr", label: "人事流程", sortOrder: 300 },
  { key: "collaboration", label: "协作流程", sortOrder: 400 },
  { key: "finance", label: "财务流程", sortOrder: 500 },
  { key: "administration", label: "行政流程", sortOrder: 600 },
  { key: "procurement", label: "采购流程", sortOrder: 700 },
  { key: "contract", label: "合同流程", sortOrder: 800 },
  { key: "quality", label: "质量流程", sortOrder: 900 },
  { key: "it", label: "IT 流程", sortOrder: 1000 },
] as const satisfies readonly WorkflowCategoryRegistration[];

const REGISTRATION_BY_KEY = new Map<WorkflowCategoryKey, WorkflowCategoryRegistration>(
  WORKFLOW_CATEGORY_REGISTRATIONS.map((registration) => [registration.key, registration]),
);

export function listWorkflowCategoryRegistrations(): readonly WorkflowCategoryRegistration[] {
  return WORKFLOW_CATEGORY_REGISTRATIONS;
}

export function getWorkflowCategoryRegistration(key: string | null | undefined): WorkflowCategoryRegistration | null {
  return key && isWorkflowCategoryKey(key) ? REGISTRATION_BY_KEY.get(key) ?? null : null;
}

export function isWorkflowCategoryKey(value: string | null | undefined): value is WorkflowCategoryKey {
  return Boolean(value && REGISTRATION_BY_KEY.has(value as WorkflowCategoryKey));
}
