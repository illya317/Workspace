import { canConfigureWorkflowAction } from "./WorkflowPoliciesLabels";
import type { BusinessActionDto } from "./WorkflowPoliciesTabModel";

export type WorkflowActionFilter = "all" | "workflow_configurable" | "permission_direct";

export const DEFAULT_WORKFLOW_ACTION_FILTER: WorkflowActionFilter = "workflow_configurable";

export const WORKFLOW_ACTION_FILTER_OPTIONS: Array<{ value: WorkflowActionFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "workflow_configurable", label: "可配置流程" },
  { value: "permission_direct", label: "权限直写" },
];

export function matchesWorkflowActionFilter(action: BusinessActionDto, filter: WorkflowActionFilter) {
  if (filter === "all") return true;
  const configurable = canConfigureWorkflowAction(action);
  return filter === "workflow_configurable" ? configurable : !configurable;
}
