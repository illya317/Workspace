export type WorkflowNodeApprovalMode = "any_one" | "all";
export type WorkflowNodeConditionFieldKind = "company" | "department";
export type WorkflowNodeAssigneeFieldKind = "relationship" | "position" | "employee";
export type WorkflowPolicyGatewayKind = "exclusive" | "inclusive" | "parallel";
export type WorkflowPolicyNodeKind = "approval" | "gateway";

export type WorkflowNodeCondition = {
  fieldKind: WorkflowNodeConditionFieldKind;
  value: string | null;
};

export type WorkflowNodeAssignee = {
  fieldKind: WorkflowNodeAssigneeFieldKind;
  value: string | null;
};

export type WorkflowPolicyApprovalNodeDefinition = {
  key: string;
  kind: "approval";
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
};

export type WorkflowPolicyGatewayBranchDefinition = {
  key: string;
  label: string;
  order: number;
  conditions: WorkflowNodeCondition[];
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
  children: WorkflowPolicyNodeDefinition[];
};

export type WorkflowPolicyGatewayNodeDefinition = {
  key: string;
  kind: "gateway";
  gatewayKind: WorkflowPolicyGatewayKind;
  branches: WorkflowPolicyGatewayBranchDefinition[];
};

export type WorkflowPolicyNodeDefinition =
  | WorkflowPolicyApprovalNodeDefinition
  | WorkflowPolicyGatewayNodeDefinition;

export type WorkflowPolicyApprovalTarget = {
  key: string;
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
};

export type WorkflowExecutionState = {
  activeNodeKeys: string[];
  joinState: Record<string, string[]>;
};
