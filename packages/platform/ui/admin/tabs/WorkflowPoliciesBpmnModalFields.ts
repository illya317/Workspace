import { createInputOption } from "@workspace/core/ui";
import { handlerSourceLabel, type WorkflowCompanyOptionDto, type WorkflowDepartmentOptionDto, type WorkflowEmployeeOptionDto, type WorkflowPositionOptionDto } from "./WorkflowPoliciesTabModel";
import type {
  WorkflowAssigneeFieldKind,
  WorkflowConditionFieldKind,
  WorkflowNodeRelationshipSource,
  WorkflowPolicyNodeAssigneeDraft,
  WorkflowPolicyNodeConditionDraft,
} from "./WorkflowPoliciesGraphModel";

const EMPTY_VALUE = "__none__";

export function conditionOptions(input: {
  companies: readonly WorkflowCompanyOptionDto[];
  departments: readonly WorkflowDepartmentOptionDto[];
}) {
  return {
    source: "grouped" as const,
    groupLabel: "字段",
    optionLabel: "具体内容",
    unsetLabel: "不指定",
    groups: [
      {
        key: "company",
        label: "公司",
        options: [
          { value: conditionOptionValue("company", null), label: "全部公司" },
          ...input.companies.map((option) => createInputOption(conditionOptionValue("company", option.code), option.name, option.description ?? option.code)),
        ],
      },
      {
        key: "department",
        label: "部门",
        options: [
          { value: conditionOptionValue("department", null), label: "全部部门" },
          ...input.departments.map((option) => createInputOption(conditionOptionValue("department", String(option.id)), option.name, option.description ?? option.code)),
        ],
      },
    ],
  };
}

export function assigneeOptions(
  input: {
    employees: readonly WorkflowEmployeeOptionDto[];
    positions: readonly WorkflowPositionOptionDto[];
  },
  relationshipOptions: readonly WorkflowNodeRelationshipSource[],
) {
  return {
    source: "grouped" as const,
    groupLabel: "字段",
    optionLabel: "具体内容",
    unsetLabel: "不指定",
    groups: [
      {
        key: "relationship",
        label: "关系",
        options: [
          { value: assigneeOptionValue("relationship", null), label: "不指定" },
          ...relationshipOptions.map((option) => ({ value: assigneeOptionValue("relationship", option), label: handlerSourceLabel(option) })),
        ],
      },
      {
        key: "position",
        label: "岗位",
        options: [
          { value: assigneeOptionValue("position", null), label: input.positions.length > 0 ? "不指定" : "暂无岗位" },
          ...input.positions.map((option) => createInputOption(assigneeOptionValue("position", String(option.id)), option.name, option.description ?? option.code)),
        ],
      },
      {
        key: "employee",
        label: "员工",
        options: [
          { value: assigneeOptionValue("employee", null), label: input.employees.length > 0 ? "不指定" : "暂无人员" },
          ...input.employees.map((option) => createInputOption(assigneeOptionValue("employee", String(option.id)), option.name, option.description ?? option.employeeId)),
        ],
      },
    ],
  };
}

export function conditionSelectionValue(condition: WorkflowPolicyNodeConditionDraft) {
  return conditionOptionValue(condition.fieldKind, condition.value);
}

export function assigneeSelectionValue(assignee: WorkflowPolicyNodeAssigneeDraft) {
  return assigneeOptionValue(assignee.fieldKind, assignee.value);
}

export function parseConditionSelection(value: unknown): WorkflowPolicyNodeConditionDraft {
  const [kind, rawValue] = typeof value === "string" ? value.split(":") : [];
  return {
    fieldKind: kind === "department" ? "department" : "company",
    value: rawValue && rawValue !== EMPTY_VALUE ? rawValue : null,
  };
}

export function parseAssigneeSelection(value: unknown): WorkflowPolicyNodeAssigneeDraft {
  const [kind, rawValue] = typeof value === "string" ? value.split(":") : [];
  const fieldKind = kind === "position" || kind === "employee" ? kind : "relationship";
  return { fieldKind, value: rawValue && rawValue !== EMPTY_VALUE ? rawValue : null };
}

function conditionOptionValue(kind: WorkflowConditionFieldKind, value: string | null) {
  return `${kind}:${value ?? EMPTY_VALUE}`;
}

function assigneeOptionValue(kind: WorkflowAssigneeFieldKind, value: string | null) {
  return `${kind}:${value ?? EMPTY_VALUE}`;
}
