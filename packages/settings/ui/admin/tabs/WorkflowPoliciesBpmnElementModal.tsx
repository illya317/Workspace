"use client";

import { InputSurface, type InputOptions } from "@workspace/core/ui";
import { BpmnIconButton } from "./WorkflowPoliciesBpmnButtons";
import {
  assigneeOptions,
  assigneeSelectionValue,
  conditionOptions,
  conditionSelectionValue,
} from "./WorkflowPoliciesBpmnModalFields";
import type { WorkflowCompanyOptionDto, WorkflowDepartmentOptionDto, WorkflowEmployeeOptionDto, WorkflowPositionOptionDto } from "./WorkflowPoliciesTabModel";
import {
  sortedWorkflowBranches,
  type WorkflowNodeRelationshipSource,
  type WorkflowPolicyGatewayBranchDraft,
  type WorkflowPolicyGatewayKind,
  type WorkflowPolicyGatewayNodeDraft,
  type WorkflowPolicyGraphElementKind,
  type WorkflowPolicyTreeNodeDraft,
} from "./WorkflowPoliciesGraphModel";

const MAX_GATEWAY_BRANCHES = 3;

/** @ui-specialized-surface Workflow graph element editor owns gateway, branch, condition, and assignee editing. */
export function WorkflowElementConfigModal(input: {
  open: boolean;
  element: WorkflowPolicyTreeNodeDraft | null;
  branch: WorkflowPolicyGatewayBranchDraft | null;
  parentGateway: WorkflowPolicyGatewayNodeDraft | null;
  elements: readonly WorkflowPolicyTreeNodeDraft[];
  startSelected: boolean;
  canRemoveElement: boolean;
  companies: readonly WorkflowCompanyOptionDto[];
  departments: readonly WorkflowDepartmentOptionDto[];
  employees: readonly WorkflowEmployeeOptionDto[];
  positions: readonly WorkflowPositionOptionDto[];
  relationshipOptions: readonly WorkflowNodeRelationshipSource[];
  saving: boolean;
  onClose: () => void;
  onRemoveElement: () => void;
  onAddElement: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddBranch: () => void;
  onSelectBranch: (branchKey: string) => void;
  onRemoveBranch: (branchKey: string) => void;
  onAddCondition: () => void;
  onRemoveCondition: (index: number) => void;
  onAddAssignee: () => void;
  onRemoveAssignee: (index: number) => void;
  onUpdateCondition: (index: number, value: unknown) => void;
  onUpdateAssignee: (index: number, value: unknown) => void;
}) {
  if (!input.open || (!input.element && !input.branch && !input.startSelected)) return null;
  const gateway = input.element?.kind === "gateway" ? input.element : null;
  const approval = input.element?.kind === "approval" ? input.element : null;
  const branch = input.branch;
  const branchTitle = branch ? branchAssigneeSummary(branch, input) : null;
  const title = input.startSelected
    ? "开始"
    : branch
    ? branchTitle
    : gateway
    ? `${gatewayKindLabel(gateway.gatewayKind)}网关`
    : "审批节点";
  const removeLabel = branch ? "删除分支" : gateway ? "删除网关" : "删除审批节点";
  const canRemoveBranch = branch && input.parentGateway
    ? canDeleteBranch(input.parentGateway, branch.key)
    : false;
  const canRemove = branch ? canRemoveBranch : input.canRemoveElement;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭配置" onClick={input.onClose} />
      <div className="relative max-h-[86vh] w-full max-w-3xl overflow-visible rounded-md border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {branch && input.parentGateway ? (
              <div className="mt-1 text-sm text-slate-500">{gatewayKindLabel(input.parentGateway.gatewayKind)}分支</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!input.startSelected ? (
              <BpmnIconButton kind="delete" label={removeLabel} disabled={input.saving || !canRemove} onClick={input.onRemoveElement} variant="danger" />
            ) : null}
            <BpmnIconButton kind="x" label="关闭" disabled={false} onClick={input.onClose} />
          </div>
        </div>
        <div className="max-h-[calc(86vh-5rem)] overflow-y-auto overflow-x-visible p-5">
          {input.startSelected ? (
            <AddNextPanel saving={input.saving} onAddElement={input.onAddElement} />
          ) : gateway ? (
            <GatewayBranchPanel
              gateway={gateway}
              modalInput={input}
              saving={input.saving}
              onAddElement={input.onAddElement}
              onAddBranch={input.onAddBranch}
              onSelectBranch={input.onSelectBranch}
              onRemoveBranch={input.onRemoveBranch}
            />
          ) : branch ? (
            <BranchPanel
              branch={branch}
              parentGateway={input.parentGateway}
              input={input}
            />
          ) : approval ? (
            <ApprovalPanel
              approval={approval}
              input={input}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ApprovalPanel(input: {
  approval: Extract<WorkflowPolicyTreeNodeDraft, { kind: "approval" }>;
  input: ModalSharedInput;
}) {
  return (
    <div className="space-y-5">
      <NodeChoiceGroup
        title="审批人"
        addLabel="添加审批人"
        items={input.approval.assignees.slice(0, 1)}
        maxItems={1}
        options={assigneeOptions(input.input, input.input.relationshipOptions)}
        saving={input.input.saving}
        onAdd={input.input.onAddAssignee}
        onRemove={input.input.onRemoveAssignee}
        onChange={input.input.onUpdateAssignee}
        valueOf={assigneeSelectionValue}
      />
      <AddNextPanel saving={input.input.saving} onAddElement={input.input.onAddElement} />
    </div>
  );
}

function BranchPanel(input: {
  branch: WorkflowPolicyGatewayBranchDraft;
  parentGateway: WorkflowPolicyGatewayNodeDraft | null;
  input: ModalSharedInput;
}) {
  const showConditions = input.parentGateway?.gatewayKind !== "parallel";
  return (
    <div className="space-y-5">
      <div className="space-y-5">
        {showConditions ? (
          <NodeChoiceGroup
            title="进入条件"
            addLabel="添加条件"
            items={input.branch.conditions}
            options={conditionOptions(input.input)}
            saving={input.input.saving}
            onAdd={input.input.onAddCondition}
            onRemove={input.input.onRemoveCondition}
            onChange={input.input.onUpdateCondition}
            valueOf={conditionSelectionValue}
          />
        ) : null}
        <NodeChoiceGroup
          title="审批人"
          addLabel="添加审批人"
          items={input.branch.assignees.slice(0, 1)}
          maxItems={1}
          options={assigneeOptions(input.input, input.input.relationshipOptions)}
          saving={input.input.saving}
          onAdd={input.input.onAddAssignee}
          onRemove={input.input.onRemoveAssignee}
          onChange={input.input.onUpdateAssignee}
          valueOf={assigneeSelectionValue}
        />
      </div>
      <AddNextPanel saving={input.input.saving} onAddElement={input.input.onAddElement} />
    </div>
  );
}

function GatewayBranchPanel(input: {
  gateway: WorkflowPolicyGatewayNodeDraft;
  modalInput: ModalSharedInput;
  saving: boolean;
  onAddElement: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddBranch: () => void;
  onSelectBranch: (branchKey: string) => void;
  onRemoveBranch: (branchKey: string) => void;
}) {
  const branches = sortedWorkflowBranches(input.gateway.branches);
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 px-3">
          <h4 className="font-semibold text-slate-900">分支</h4>
          <BpmnIconButton kind="add" label="添加分支" disabled={input.saving || branches.length >= MAX_GATEWAY_BRANCHES} onClick={input.onAddBranch} />
        </div>
        <div className="space-y-2">
          {branches.map((branch, index) => (
            <div key={branch.key} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
              <button
                type="button"
                className="min-w-0 rounded-sm text-left transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                onClick={() => input.onSelectBranch(branch.key)}
              >
                <div className="font-medium text-slate-900">{branchAssigneeSummary(branch, input.modalInput)}</div>
                <div className="text-sm text-slate-500">{`分支 ${index + 1} · ${input.gateway.gatewayKind === "parallel" ? "并行" : conditionSummary(branch.conditions)}`}</div>
              </button>
              <BpmnIconButton
                kind="delete"
                label="删除分支"
                disabled={input.saving || index === 0 || branches.length <= 1}
                onClick={() => input.onRemoveBranch(branch.key)}
                variant="danger"
              />
            </div>
          ))}
        </div>
      </section>
      <AddNextPanel saving={input.saving} onAddElement={input.onAddElement} />
    </div>
  );
}

function AddNextPanel(input: {
  saving: boolean;
  onAddElement: (kind: WorkflowPolicyGraphElementKind) => void;
}) {
  return (
    <section className="relative z-10 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="font-semibold text-slate-900">后续</h4>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
        <BpmnIconButton kind="exclusive-gateway" label="新增排他网关" disabled={input.saving} onClick={() => input.onAddElement("exclusive")} />
        <BpmnIconButton kind="inclusive-gateway" label="新增包容网关" disabled={input.saving} onClick={() => input.onAddElement("inclusive")} />
        <BpmnIconButton kind="parallel-gateway" label="新增并行网关" disabled={input.saving} onClick={() => input.onAddElement("parallel")} />
        <BpmnIconButton kind="approval-node" label="新增审批节点" disabled={input.saving} onClick={() => input.onAddElement("approval")} />
      </div>
    </section>
  );
}

type ModalSharedInput = {
  companies: readonly WorkflowCompanyOptionDto[];
  departments: readonly WorkflowDepartmentOptionDto[];
  employees: readonly WorkflowEmployeeOptionDto[];
  positions: readonly WorkflowPositionOptionDto[];
  relationshipOptions: readonly WorkflowNodeRelationshipSource[];
  saving: boolean;
  onAddElement: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddCondition: () => void;
  onRemoveCondition: (index: number) => void;
  onAddAssignee: () => void;
  onRemoveAssignee: (index: number) => void;
  onUpdateCondition: (index: number, value: unknown) => void;
  onUpdateAssignee: (index: number, value: unknown) => void;
};

function NodeChoiceGroup<TItem>(input: {
  title: string;
  addLabel: string;
  items: readonly TItem[];
  maxItems?: number;
  options: InputOptions;
  saving: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: unknown) => void;
  valueOf: (item: TItem) => string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">{input.title}</h4>
        {input.maxItems && input.items.length >= input.maxItems ? null : (
          <BpmnIconButton kind="add" label={input.addLabel} disabled={input.saving} onClick={input.onAdd} />
        )}
      </div>
      <div className="space-y-2">
        {input.items.map((item, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2">
            <InputSurface
              spec={{ valueType: "string", control: "choice", options: input.options }}
              value={input.valueOf(item)}
              onChange={(value) => input.onChange(index, value)}
              density="compact"
            />
            <BpmnIconButton kind="delete" label="删除" disabled={input.saving || input.items.length <= 1} onClick={() => input.onRemove(index)} variant="danger" />
          </div>
        ))}
      </div>
    </section>
  );
}

function canDeleteBranch(gateway: WorkflowPolicyGatewayNodeDraft, branchKey: string) {
  const branches = sortedWorkflowBranches(gateway.branches);
  return branches.length > 1 && branches[0]?.key !== branchKey;
}

function gatewayKindLabel(kind: WorkflowPolicyGatewayKind) {
  if (kind === "parallel") return "并行";
  if (kind === "inclusive") return "包容";
  return "排他";
}

function conditionSummary(conditions: readonly { value: string | null }[]) {
  return conditions.some((condition) => condition.value) ? "有条件" : "默认";
}

function branchAssigneeSummary(
  branch: WorkflowPolicyGatewayBranchDraft,
  input: Pick<ModalSharedInput, "employees" | "positions" | "relationshipOptions">,
) {
  const assignee = branch.assignees[0];
  if (!assignee) return "不指定";
  const options = assigneeOptions(input, input.relationshipOptions);
  return inputOptionLabel(options, assigneeSelectionValue(assignee)) ?? "不指定";
}

function inputOptionLabel(options: InputOptions, value: string) {
  if (options.source === "static") {
    return options.items.find((item) => item.value === value)?.label ?? null;
  }
  if (options.source === "grouped") {
    for (const group of options.groups) {
      const label = group.options.find((item) => item.value === value)?.label;
      if (label) return label;
    }
  }
  return null;
}
