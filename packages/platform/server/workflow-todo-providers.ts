import type { WorkflowFlowType, WorkflowStatus } from "./notification-workflow";

export type WorkflowTodoProviderItem = {
  requestId: number;
  businessActionKey: string;
  flowType: WorkflowFlowType;
  status?: WorkflowStatus;
  title: string;
  summary: string;
  href: string | null;
  eventType?: string | null;
  resourceKey: string | null;
  scopeId: string | null;
  createdAt: Date;
  actor?: { id: number; name: string; avatar?: string | null } | null;
};

export type WorkflowTodoProviderMatchInput = {
  requestId: number;
  resourceKey: string | null;
  scopeId: string | null;
};

type WorkflowTodoProvider = {
  handles: (input: WorkflowTodoProviderMatchInput) => boolean;
  list: (userId: number) => Promise<WorkflowTodoProviderItem[]>;
};

const workflowTodoProviders: WorkflowTodoProvider[] = [];

export function registerWorkflowTodoProvider(provider: WorkflowTodoProvider) {
  if (!workflowTodoProviders.includes(provider)) workflowTodoProviders.push(provider);
}

export function isWorkflowTodoProviderHandled(input: WorkflowTodoProviderMatchInput) {
  return workflowTodoProviders.some((provider) => provider.handles(input));
}

export async function listWorkflowTodoProviderItems(userId: number) {
  if (workflowTodoProviders.length === 0) return [];
  const results = await Promise.all(workflowTodoProviders.map((provider) => provider.list(userId).catch((error) => {
    console.error("Failed to list workflow todo provider items", error);
    return [] as WorkflowTodoProviderItem[];
  })));
  return results.flat();
}
