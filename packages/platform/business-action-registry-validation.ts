import { isWorkflowCategoryKey } from "./workflow-category-registry";

type RegistryEntry = {
  key: string;
  eligibility: string;
  flowType?: string;
  separationPolicy?: string;
  workflowCategoryKey?: string;
};

export function assertBusinessActionRegistryValid(registrations: readonly RegistryEntry[]) {
  const keys = new Set<string>();
  for (const registration of registrations) {
    if (keys.has(registration.key)) {
      throw new Error(`Duplicate business action registration: ${registration.key}`);
    }
    keys.add(registration.key);
    if (!registration.eligibility.startsWith("workflow_")) continue;
    if (registration.key.startsWith("space.")) {
      throw new Error(`Workflow-eligible business action must use a base businessActionKey, not a space-derived key: ${registration.key}`);
    }
    if (!registration.flowType || !registration.separationPolicy) {
      throw new Error(`Workflow-eligible business action must declare flowType and separationPolicy: ${registration.key}`);
    }
    if (!isWorkflowCategoryKey(registration.workflowCategoryKey)) {
      throw new Error(`Workflow-eligible business action must declare a registered workflowCategoryKey: ${registration.key}`);
    }
  }
}
