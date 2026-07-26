export type WorkflowFlowType = "approval" | "review" | "publish";
export type WorkflowSeparationPolicy = "independent_required" | "auto_pass_if_authorized";
export type WorkflowPolicyMode = "direct" | "optional" | "required" | "permission_only";
export type WorkflowPolicyScopeType = "global" | "department" | "company" | "committee" | "personal" | "custom";

export const WORKFLOW_POLICY_MODES = ["direct", "optional", "required", "permission_only"] as const;
export const WORKFLOW_FLOW_TYPES = ["approval", "review", "publish"] as const;
export const WORKFLOW_SEPARATION_POLICIES = ["independent_required", "auto_pass_if_authorized"] as const;
export const WORKFLOW_HANDLER_SOURCES = ["direct_manager", "department_owner", "permission"] as const;
export type WorkflowHandlerSource = typeof WORKFLOW_HANDLER_SOURCES[number];
