/**
 * HR 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { SessionUser } from "@/lib/types";
import type { AgentTool } from "./registry";
import { normalizeHrSchoolValue } from "@/lib/hr-school-options";
import { queryRawEmployees } from "@workspace/hr/server/roster";

export const searchEmployeesTool: AgentTool = {
  key: "hr.searchEmployees",
  label: "查询员工",
  description: "根据姓名、工号等关键词查询员工信息",
  mutates: false,

  canUse(user: SessionUser): boolean {
    return (user.visibleResourceKeys || []).includes("people");
  },

  async execute(params: Record<string, unknown>, _user: SessionUser) {
    const keyword = typeof params.keyword === "string" ? params.keyword : "";

    const employees = await queryRawEmployees(keyword);

    if (employees.length === 0) {
      return {
        type: "empty",
        message: keyword ? `未找到匹配"${keyword}"的员工` : "暂无员工数据",
      };
    }

    const summary = employees.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      name: e.name,
      alias: e.alias,
      gender: e.gender ? "男" : e.gender === false ? "女" : null,
      education: e.education,
      title: e.title,
      phone: e.phone,
      school: e.school,
      major: e.major,
      hometown: e.hometown,
    }));

    return {
      type: "data",
      message: `找到 ${employees.length} 名员工${keyword ? `匹配"${keyword}"` : ""}`,
      data: { total: employees.length, items: summary },
    };
  },
};

/** 修改员工信息（仅生成 proposal，不直接写库） */
export const updateEmployeeDraftTool: AgentTool = {
  key: "hr.updateEmployee",
  label: "修改员工信息",
  description: "修改员工信息。字段映射：大学/学校→school，电话→phone，学历→education，专业→major，别名→alias，籍贯→hometown。参数：keyword=员工姓名，field=字段英文名，newValue=新值",
  mutates: true,

  canUse(user: SessionUser): boolean {
    return (user.visibleWriteResourceKeys || []).includes("people.roster");
  },

  async execute(params: Record<string, unknown>, user: SessionUser) {
    const employeeId = typeof params.employeeId === "string" ? params.employeeId : "";
    const keyword = typeof params.keyword === "string" ? params.keyword : "";
    const field = typeof params.field === "string" ? params.field : "";
    const newValue = params.newValue != null ? String(params.newValue) : "";

    if ((!employeeId && !keyword) || !field) {
      return { type: "error", message: "缺少必填参数：employeeId/keyword 或 field" };
    }

    // 允许修改的白名单字段
    const allowedFields = ["education", "title", "phone", "school", "major", "alias", "hometown", "politics"];
    if (!allowedFields.includes(field)) {
      return { type: "error", message: `字段"${field}"不支持修改。支持：${allowedFields.join("、")}` };
    }
    const normalizedNewValue = field === "school" ? normalizeHrSchoolValue(newValue) : null;
    if (normalizedNewValue && !normalizedNewValue.ok) {
      return { type: "error", message: normalizedNewValue.error };
    }

    // 查当前值：优先用工号，否则按姓名搜索
    const { prisma } = await import("@/lib/prisma");
    let emp: { id: number; name: string } & Record<string, unknown> | null = null;
    if (employeeId) {
      const found = await prisma.employee.findUnique({
        where: { employeeId },
        select: { id: true, employeeId: true, name: true, [field]: true },
      });
      if (found) emp = found as unknown as { id: number; name: string } & Record<string, unknown>;
    } else if (keyword) {
      const employees = await queryRawEmployees(keyword);
      if (employees.length === 1) {
        emp = employees[0] as unknown as { id: number; name: string } & Record<string, unknown>;
      } else if (employees.length > 1) {
        return { type: "error", message: `找到 ${employees.length} 名匹配"${keyword}"的员工，请指定工号` };
      }
    }
    if (!emp) {
      return { type: "error", message: `未找到员工${employeeId ? ` ${employeeId}` : ` "${keyword}"`}` };
    }

    const actualId = (emp as Record<string, unknown>).employeeId || employeeId;

    const oldValue = (emp as Record<string, unknown>)[field];
    const finalNewValue = normalizedNewValue?.ok ? normalizedNewValue.value : newValue;
    const diff = { employeeId: actualId, name: emp.name, field, oldValue, newValue: finalNewValue };

    // 创建 proposal（不写库）
    const { createProposal } = await import("@/server/services/agent/proposals");
    const result = await createProposal(user, {
      actionKey: "hr.updateEmployee",
      targetType: "Employee",
      targetId: actualId as string,
      payload: { employeeId: actualId, field, value: finalNewValue },
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
  mutates: true,

  canUse(user: SessionUser): boolean {
    return (user.visibleWriteResourceKeys || []).includes("people.roster");
  },

  async execute(params: Record<string, unknown>, user: SessionUser) {
    const filterField = typeof params.filterField === "string" ? params.filterField : "";
    const filterOp = typeof params.filterOp === "string" ? params.filterOp : "notContains";
    const filterValue = typeof params.filterValue === "string" ? params.filterValue : "";
    const updateField = typeof params.updateField === "string" ? params.updateField : "";
    const updateValue = typeof params.updateValue === "string" ? params.updateValue : "";

    if (!filterField || !updateField) {
      return { type: "error", message: "缺少必填参数：filterField 或 updateField" };
    }

    const allowedFields = ["education", "title", "phone", "school", "major", "alias", "hometown", "politics"];
    if (!allowedFields.includes(filterField) || !allowedFields.includes(updateField)) {
      return { type: "error", message: `字段不支持。允许：${allowedFields.join("、")}` };
    }
    const normalizedUpdateValue = updateField === "school" ? normalizeHrSchoolValue(updateValue) : null;
    if (normalizedUpdateValue && !normalizedUpdateValue.ok) {
      return { type: "error", message: normalizedUpdateValue.error };
    }
    const finalUpdateValue = normalizedUpdateValue?.ok ? normalizedUpdateValue.value : updateValue;

    const { prisma } = await import("@/lib/prisma");
    // SQLite adapter 对 not: { contains } 支持不佳，走 JS 过滤
    const allRows = await prisma.employee.findMany({
      select: { id: true, employeeId: true, name: true, [filterField]: true, [updateField]: true },
      orderBy: { employeeId: "asc" },
    });

    // JS 过滤
    const all = allRows.filter((r) => {
      const val = String((r as Record<string, unknown>)[filterField] ?? "");
      if (filterOp === "notContains") return !val.includes(filterValue);
      if (filterOp === "contains") return val.includes(filterValue);
      return val === filterValue;
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

    // 创建 proposal
    const { createProposal } = await import("@/server/services/agent/proposals");
    const result = await createProposal(user, {
      actionKey: "hr.batchUpdateEmployee",
      targetType: "Employee",
      targetId: employeeIds.join(","),
      payload: { employeeIds, field: updateField, value: finalUpdateValue },
      diff,
    });

    return {
      type: "proposal",
      message: `待确认：将 ${all.length} 名员工的${updateField}批量改为"${finalUpdateValue ?? "无"}"（条件：${filterField} 不包含 "${filterValue}"）`,
      proposal: { id: result.proposalId, actionKey: "hr.batchUpdateEmployee", targetType: "Employee", targetId: `${all.length}名员工`, diff },
    };
  },
};
