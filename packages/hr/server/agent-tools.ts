/**
 * HR 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { AgentExecutionContext } from "@workspace/platform/server/agent/execution";
import { createProposal, type ProposalExecutors } from "@workspace/platform/server/agent/proposals";
import type { AgentTool } from "@workspace/platform/server/agent/tools";
import { prisma } from "@workspace/platform/server/prisma";
import { getTenantConfig } from "@workspace/platform/server/tenant-config";

import { normalizeHrSchoolValue } from "../constants/school-options";
import {
  AGENT_EMPLOYEE_MUTABLE_FIELDS,
  buildAgentEmployeeBatchDraftCommand,
  buildAgentEmployeeDraftCommand,
  parseExpectedEmployeeFieldSnapshots,
} from "./domain/agent-employee-proposal-validation";
import { searchAgentEmployeeDirectory } from "./agent-employee-search";
import { queryRawEmployees } from "./roster";
import { updateEmployeeFieldsByEmployeeIds } from "./employee-agent-updates";
import { performanceAgentProposalExecutors, performanceAgentTools } from "./performance-agent-tools";

function normalizeAgentFieldValue(field: string, value: unknown) {
  if (field === "school") {
    const result = normalizeHrSchoolValue(value, getTenantConfig().hrCatalogs);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  return String(value ?? "");
}

export const searchEmployeesTool: AgentTool = {
  key: "hr.searchEmployees",
  label: "查询员工",
  description: "按必填关键词查询员工目录。keyword 必须是姓名、工号或别名，不允许空关键词全量返回。结果最多返回 20 名可辨识候选。",
  parameters: {
    type: "object",
    properties: {
      keyword: { type: "string", minLength: 1, description: "必填：员工姓名、工号或别名，例如 测试员工甲、EMP-X001、示例别名" },
    },
    required: ["keyword"],
    additionalProperties: false,
  },
  examples: [
    { user: "查一下测试员工甲", arguments: { keyword: "测试员工甲" } },
    { user: "工号EMP-X001是谁", arguments: { keyword: "EMP-X001" } },
  ],
  requiredPermissions: [{ resourceKey: "hr.roster", action: "read" }],
  mutates: false,

  async execute(params: Record<string, unknown>) {
    const keyword = typeof params.keyword === "string" ? params.keyword.trim() : "";
    if (!keyword) {
      return { type: "error", message: "请提供姓名、工号或别名后再查询员工，不能空关键词返回全员名单。" };
    }
    const result = await searchAgentEmployeeDirectory(keyword);
    if (result.totalMatches === 0) {
      return {
        type: "empty",
        message: `未找到匹配"${keyword}"的员工`,
      };
    }
    const truncated = result.totalMatches > result.items.length;
    return {
      type: "data",
      message: `找到 ${result.totalMatches} 名匹配"${keyword}"的员工${truncated ? `，按相关度返回前 ${result.items.length} 名，请继续缩小关键词` : ""}`,
      data: { total: result.totalMatches, returned: result.items.length, items: result.items },
      modelContext: {
        query: keyword,
        totalMatches: result.totalMatches,
        returned: result.items.length,
        items: result.items,
        displayRule: "这些姓名、工号、部门和岗位已经过当前用户的 hr.roster.read 权限校验。回答时必须逐字显示 name 和 employeeId，不得替换为张**等掩码。",
      },
    };
  },
};

/** 修改员工信息（仅生成 proposal，不直接写库） */
export const updateEmployeeDraftTool: AgentTool = {
  key: "hr.updateEmployee",
  label: "修改员工信息",
  description: "修改员工信息。字段映射：大学/学校→school，电话→phone，学历→education，专业→major，别名→alias，籍贯→hometown。参数：keyword=员工姓名，field=字段英文名，newValue=新值",
  requiredPermissions: [{ resourceKey: "hr.roster", action: "update" }],
  mutates: true,

  async execute(params: Record<string, unknown>, execution: AgentExecutionContext) {
    const command = buildAgentEmployeeDraftCommand(params);
    if (!command.ok) return { type: "error", message: command.issue.message };
    const { employeeId, keyword, field, value: finalNewValue } = command.data;

    // 查当前值：优先用工号，否则按姓名搜索
    let candidateId: number | null = null;
    if (employeeId) {
      const found = await prisma.employee.findUnique({
        where: { employeeId },
        select: { id: true },
      });
      candidateId = found?.id ?? null;
    } else if (keyword) {
      const employees = await queryRawEmployees(keyword);
      if (employees.length === 1) {
        candidateId = employees[0].id;
      } else if (employees.length > 1) {
        return { type: "error", message: `找到 ${employees.length} 名匹配"${keyword}"的员工，请指定工号` };
      }
    }
    const emp = candidateId == null ? null : await prisma.employee.findUnique({
      where: { id: candidateId },
      select: { id: true, employeeId: true, name: true, version: true, [field]: true },
    }) as ({ id: number; employeeId: string; name: string; version: number } & Record<string, unknown>) | null;
    if (!emp) {
      return { type: "error", message: `未找到员工${employeeId ? ` ${employeeId}` : ` "${keyword}"`}` };
    }

    const actualId = emp.employeeId;

    const oldValue = (emp as Record<string, unknown>)[field];
    const diff = { employeeId: actualId, name: emp.name, field, oldValue, newValue: finalNewValue };

    const result = await createProposal(execution, {
      actionKey: "hr.updateEmployee",
      toolKey: "hr.updateEmployee",
      targetType: "Employee",
      targetId: actualId as string,
      payload: {
        employeeId: actualId,
        field,
        value: finalNewValue,
        expectedRows: [{ employeeId: actualId, version: emp.version, oldValue: oldValue ?? null }],
      },
      diff,
    });

    return {
      type: "proposal",
      message: `待确认：将 ${emp.name}（${actualId}）的${field}从"${oldValue ?? "无"}"改为"${finalNewValue ?? "无"}"`,
      proposal: { id: result.proposalId, actionKey: "hr.updateEmployee", targetType: "Employee", targetId: actualId as string, diff },
    };
  },
};

/** 批量修改员工信息（按条件筛选，生成一个 proposal） */
export const batchUpdateEmployeeDraftTool: AgentTool = {
  key: "hr.batchUpdateEmployee",
  label: "批量修改员工",
  description: "按条件筛选员工并批量修改字段。参数：filterField=筛选字段，filterOp=notContains(不包含)/contains(包含)，filterValue=筛选值，updateField=修改字段，updateValue=新值。如：非党员→群众：filterField=politics, filterOp=notContains, filterValue=党员, updateField=politics, updateValue=群众",
  requiredPermissions: [{ resourceKey: "hr.roster", action: "update" }],
  mutates: true,

  async execute(params: Record<string, unknown>, execution: AgentExecutionContext) {
    const command = buildAgentEmployeeBatchDraftCommand(params);
    if (!command.ok) return { type: "error", message: command.issue.message };
    const {
      filterField,
      filterOp,
      filterValue,
      updateField,
      updateValue: finalUpdateValue,
    } = command.data;

    // SQLite adapter 对 not: { contains } 支持不佳，走 JS 过滤
    const allRows = await prisma.employee.findMany({
      select: {
        id: true,
        employeeId: true,
        name: true,
        version: true,
        [filterField]: true,
        [updateField]: true,
      },
      orderBy: { employeeId: "asc" },
    });

    // JS 过滤
    const all = allRows.filter((r) => {
      const val = String((r as Record<string, unknown>)[filterField] ?? "");
      if (filterOp === "notContains") return !val.includes(filterValue);
      if (filterOp === "contains") return val.includes(filterValue);
      return filterOp === "equals" && val === filterValue;
    });

    if (all.length === 0) {
      const opLabel = filterOp === "notContains" ? "不包含" : filterOp === "contains" ? "包含" : "等于";
      return { type: "error", message: `没有找到 ${filterField} ${opLabel} "${filterValue}" 的员工` };
    }

    // 安全上限
    if (all.length > 500) {
      return { type: "error", message: `匹配 ${all.length} 名员工，超过批量上限 500，请缩小范围` };
    }

    const employeeIds = all.map((e) => e.employeeId);
    const diff = { filterField, filterOp, filterValue, updateField, updateValue: finalUpdateValue, count: all.length, sample: all.slice(0, 5).map((e) => ({ name: e.name, employeeId: e.employeeId, oldValue: (e as Record<string, unknown>)[updateField] })) };

    const result = await createProposal(execution, {
      actionKey: "hr.batchUpdateEmployee",
      toolKey: "hr.batchUpdateEmployee",
      targetType: "Employee",
      targetId: employeeIds.join(","),
      payload: {
        employeeIds,
        field: updateField,
        value: finalUpdateValue,
        expectedRows: all.map((employee) => ({
          employeeId: employee.employeeId,
          version: employee.version,
          oldValue: (employee as Record<string, unknown>)[updateField] ?? null,
        })),
      },
      diff,
    });

    return {
      type: "proposal",
      message: `待确认：将 ${all.length} 名员工的${updateField}批量改为"${finalUpdateValue ?? "无"}"（条件：${filterField} 不包含 "${filterValue}"）`,
      proposal: { id: result.proposalId, actionKey: "hr.batchUpdateEmployee", targetType: "Employee", targetId: `${all.length}名员工`, diff },
    };
  },
};

export async function executeHrAgentProposal(
  payload: Record<string, unknown>,
  execution: AgentExecutionContext,
) {
  const { field, value, expectedRows: rawExpectedRows } = payload;
  if (!field || typeof field !== "string") throw new Error("缺少参数 field");
  if (!AGENT_EMPLOYEE_MUTABLE_FIELDS.includes(field)) throw new Error(`字段 ${field} 不允许修改`);
  const normalizedValue = normalizeAgentFieldValue(field, value);

  const expectedRows = parseExpectedEmployeeFieldSnapshots(rawExpectedRows);
  const targetIds = expectedRows.map((row) => row.employeeId);
  const result = await updateEmployeeFieldsByEmployeeIds({
    employeeIds: targetIds,
    field,
    value: normalizedValue,
    userId: execution.actor.id,
    expectedRows,
  });
  if (!result.ok) throw new Error(result.error);
  if (targetIds.length > 1) return { success: true, updatedCount: result.data.updatedCount };
  const updated = await prisma.employee.findUnique({
    where: { employeeId: targetIds[0] },
    select: { id: true, employeeId: true, name: true, [field]: true },
  });
  return {
    success: true,
    updatedCount: result.data.updatedCount,
    updated,
  };
}

export const hrAgentProposalExecutors: ProposalExecutors = {
  "hr.updateEmployee": {
    toolKey: "hr.updateEmployee",
    requiredPermissions: [{ resourceKey: "hr.roster", action: "update" }],
    failureMayHaveSideEffects: true,
    execute: executeHrAgentProposal,
  },
  "hr.batchUpdateEmployee": {
    toolKey: "hr.batchUpdateEmployee",
    requiredPermissions: [{ resourceKey: "hr.roster", action: "update" }],
    failureMayHaveSideEffects: true,
    execute: executeHrAgentProposal,
  },
  ...performanceAgentProposalExecutors,
};

export const hrAgentTools: AgentTool[] = [
  searchEmployeesTool,
  updateEmployeeDraftTool,
  batchUpdateEmployeeDraftTool,
  ...performanceAgentTools,
];
