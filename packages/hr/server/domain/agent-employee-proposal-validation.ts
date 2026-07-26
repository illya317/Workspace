import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { buildEmployeeFieldUpdateCommand } from "./employee-validation";

export const AGENT_EMPLOYEE_MUTABLE_FIELDS: readonly string[] = [
  "education",
  "title",
  "phone",
  "school",
  "major",
  "alias",
  "hometown",
  "politics",
];

export interface AgentEmployeeDraftCommand {
  employeeId: string;
  keyword: string;
  field: string;
  value: unknown;
}

export interface AgentEmployeeBatchDraftCommand {
  filterField: string;
  filterOp: "notContains" | "contains" | "equals";
  filterValue: string;
  updateField: string;
  updateValue: unknown;
}

function agentEmployeeFieldCommand(field: string, value: unknown) {
  if (!AGENT_EMPLOYEE_MUTABLE_FIELDS.includes(field)) {
    return failCommand(
      `字段"${field}"不支持修改。支持：${AGENT_EMPLOYEE_MUTABLE_FIELDS.join("、")}`,
    );
  }
  return buildEmployeeFieldUpdateCommand(field, value);
}

export function buildAgentEmployeeDraftCommand(
  params: Record<string, unknown>,
): DomainValidationResult<AgentEmployeeDraftCommand> {
  const employeeId = typeof params.employeeId === "string" ? params.employeeId.trim() : "";
  const keyword = typeof params.keyword === "string" ? params.keyword.trim() : "";
  const field = typeof params.field === "string" ? params.field.trim() : "";
  if ((!employeeId && !keyword) || !field) {
    return failCommand("缺少必填参数：employeeId/keyword 或 field");
  }
  const fieldCommand = agentEmployeeFieldCommand(
    field,
    params.newValue != null ? String(params.newValue) : "",
  );
  if (!fieldCommand.ok) return fieldCommand;
  return okCommand({
    employeeId,
    keyword,
    field: fieldCommand.data.field,
    value: fieldCommand.data.value,
  });
}

export function buildAgentEmployeeBatchDraftCommand(
  params: Record<string, unknown>,
): DomainValidationResult<AgentEmployeeBatchDraftCommand> {
  const filterField = typeof params.filterField === "string" ? params.filterField.trim() : "";
  const filterValue = typeof params.filterValue === "string" ? params.filterValue : "";
  const updateField = typeof params.updateField === "string" ? params.updateField.trim() : "";
  if (!filterField || !updateField) {
    return failCommand("缺少必填参数：filterField 或 updateField");
  }
  if (!AGENT_EMPLOYEE_MUTABLE_FIELDS.includes(filterField)) {
    return failCommand(`筛选字段不支持。允许：${AGENT_EMPLOYEE_MUTABLE_FIELDS.join("、")}`);
  }
  const rawFilterOp = typeof params.filterOp === "string" ? params.filterOp : "notContains";
  if (!(["notContains", "contains", "equals"] as const).includes(
    rawFilterOp as "notContains" | "contains" | "equals",
  )) {
    return failCommand("筛选操作不支持，仅允许 notContains、contains 或 equals");
  }
  const updateCommand = agentEmployeeFieldCommand(
    updateField,
    typeof params.updateValue === "string" ? params.updateValue : "",
  );
  if (!updateCommand.ok) return updateCommand;
  return okCommand({
    filterField,
    filterOp: rawFilterOp as "notContains" | "contains" | "equals",
    filterValue,
    updateField: updateCommand.data.field,
    updateValue: updateCommand.data.value,
  });
}

export type ExpectedEmployeeFieldSnapshot = {
  employeeId: string;
  version: number;
  oldValue: string | null;
};

export function parseExpectedEmployeeFieldSnapshots(
  value: unknown,
  maxRows = 500,
): ExpectedEmployeeFieldSnapshot[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxRows) {
    throw new Error("提案缺少有效的员工版本快照，请重新发起");
  }
  const rows = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("员工版本快照无效，请重新发起");
    }
    const record = item as Record<string, unknown>;
    const employeeId = typeof record.employeeId === "string" ? record.employeeId.trim() : "";
    const version = Number(record.version);
    const oldValue = record.oldValue ?? null;
    if (
      !employeeId
      || !Number.isInteger(version)
      || version < 0
      || (oldValue !== null && typeof oldValue !== "string")
    ) {
      throw new Error("员工版本快照无效，请重新发起");
    }
    return { employeeId, version, oldValue };
  });
  if (new Set(rows.map((row) => row.employeeId)).size !== rows.length) {
    throw new Error("员工版本快照包含重复工号");
  }
  return rows;
}

export function employeeFieldSnapshotMatches(
  current: { employeeId: string; version: number } & Record<string, unknown>,
  field: string,
  expected: ExpectedEmployeeFieldSnapshot,
) {
  return current.employeeId === expected.employeeId
    && current.version === expected.version
    && (current[field] ?? null) === expected.oldValue;
}
