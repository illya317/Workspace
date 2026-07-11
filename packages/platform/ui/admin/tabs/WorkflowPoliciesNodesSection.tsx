import { createPanelSection, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { WorkflowPoliciesBpmnDesigner } from "./WorkflowPoliciesBpmnDesigner";
import type { WorkflowCompanyOptionDto, WorkflowDepartmentOptionDto, WorkflowEmployeeOptionDto, WorkflowHandlerSource, WorkflowPositionOptionDto } from "./WorkflowPoliciesTabModel";
import type {
  WorkflowPolicyApprovalElementDraft,
  WorkflowPolicyGatewayBranchDraft,
  WorkflowPolicyGraphElementKind,
  WorkflowPolicyGraphSelectionKind,
  WorkflowPolicyTreeNodeDraft,
} from "./WorkflowPoliciesGraphModel";

type WorkflowPoliciesNodesSectionInput = {
  elements: readonly WorkflowPolicyTreeNodeDraft[];
  companyOptions: readonly WorkflowCompanyOptionDto[];
  departmentOptions: readonly WorkflowDepartmentOptionDto[];
  employeeOptions: readonly WorkflowEmployeeOptionDto[];
  handlerSourceOptions: readonly WorkflowHandlerSource[];
  positionOptions: readonly WorkflowPositionOptionDto[];
  selectedElementKey: string;
  saving: boolean;
  onAdd: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddAfter: (key: string, kind: WorkflowPolicyGraphElementKind) => void;
  onAddFromStart: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddBranch: (gatewayKey: string) => void;
  onRemoveBranch: (gatewayKey: string, branchKey: string) => void;
  onSelectElement: (key: string, kind: WorkflowPolicyGraphSelectionKind) => void;
  onRemove: (key: string) => void;
  onAddCondition: (key: string) => void;
  onRemoveCondition: (key: string, index: number) => void;
  onAddAssignee: (key: string) => void;
  onRemoveAssignee: (key: string, index: number) => void;
  onUpdateBranch: (key: string, patch: Partial<Pick<WorkflowPolicyGatewayBranchDraft, "conditions" | "assignees" | "approvalMode" | "label">>) => void;
  onUpdateApprovalElement: (key: string, patch: Partial<Pick<WorkflowPolicyApprovalElementDraft, "assignees" | "approvalMode">>) => void;
};

export function WorkflowPoliciesNodesSection(input: WorkflowPoliciesNodesSectionInput): BodySurfaceSectionSpec {
  return createPanelSection("workflow-policy-nodes", {
    title: "审批节点",
    sections: [{
      key: "workflow-policy-bpmn-designer",
      chrome: "plain",
      body: {
        kind: "form",
        form: {
          kind: "fields",
          content: {
            layout: { columns: 1, density: "compact" },
            items: [{
              kind: "note",
              key: "workflow-policy-bpmn-designer-body",
              content: renderWorkflowPoliciesBpmnDesigner(input),
            }],
          },
        },
      },
    }],
  });
}

function renderWorkflowPoliciesBpmnDesigner(input: WorkflowPoliciesNodesSectionInput) {
  return (
    <div>
      <WorkflowPoliciesBpmnDesigner
        elements={input.elements}
        companies={input.companyOptions}
        departments={input.departmentOptions}
        employees={input.employeeOptions}
        handlerSourceOptions={input.handlerSourceOptions}
        positions={input.positionOptions}
        saving={input.saving}
        selectedElementKey={input.selectedElementKey}
        onAddElement={input.onAdd}
        onAddElementFromStart={input.onAddFromStart}
        onAddElementAfter={input.onAddAfter}
        onAddBranch={input.onAddBranch}
        onRemoveBranch={input.onRemoveBranch}
        onRemoveElement={input.onRemove}
        onAddCondition={input.onAddCondition}
        onRemoveCondition={input.onRemoveCondition}
        onAddAssignee={input.onAddAssignee}
        onRemoveAssignee={input.onRemoveAssignee}
        onSelectElement={input.onSelectElement}
        onUpdateBranch={input.onUpdateBranch}
        onUpdateApprovalElement={input.onUpdateApprovalElement}
      />
    </div>
  );
}
