import type {
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowPolicyMode,
  WorkflowSeparationPolicy,
} from "./workflow-types";
import type { WorkflowPolicyNodeDefinition } from "./workflow-policy-node-contract";

export type WorkflowPolicyDefaults = {
  businessActionKey?: string | null;
  scopeType?: string | null;
  mode?: WorkflowPolicyMode | string | null;
  flowType?: WorkflowFlowType | string | null;
  separationPolicy?: WorkflowSeparationPolicy | string | null;
  handlerSource?: WorkflowHandlerSource | string | null;
  workflowNodes?: readonly WorkflowPolicyNodeDefinition[] | null;
  handlerCanRevise?: boolean | null;
  requestCanWithdraw?: boolean | null;
  requestCanResubmit?: boolean | null;
  requestCanCancel?: boolean | null;
  requestCanRevise?: boolean | null;
};
