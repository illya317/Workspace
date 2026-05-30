/**
 * HR 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { SessionUser } from "@/lib/types";
import type { AgentTool } from "./registry";
import { queryRawEmployees } from "@/server/services/hr/roster";

export const searchEmployeesTool: AgentTool = {
  key: "hr.searchEmployees",
  label: "查询员工",
  description: "根据姓名、工号等关键词查询员工信息",
  mutates: false,

  canUse(user: SessionUser): boolean {
    return !!user.canAccessHR;
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
    return !!user.canEditHR;
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
    const allowedFields = ["education", "title", "phone", "school", "major", "alias", "hometown"];
    if (!allowedFields.includes(field)) {
      return { type: "error", message: `字段"${field}"不支持修改。支持：${allowedFields.join("、")}` };
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
    const diff = { employeeId: actualId, name: emp.name, field, oldValue, newValue };

    // 创建 proposal（不写库）
    const { createProposal } = await import("@/server/services/agent/proposals");
    const result = await createProposal(user, {
      actionKey: "hr.updateEmployee",
      targetType: "Employee",
      targetId: actualId as string,
      payload: { employeeId: actualId, field, value: newValue },
      diff,
    });

    return {
      type: "proposal",
      message: `待确认：将 ${emp.name}（${actualId}）的${field}从"${oldValue ?? "无"}"改为"${newValue}"`,
      proposal: { id: result.proposalId, actionKey: "hr.updateEmployee", targetType: "Employee", targetId: actualId as string, diff },
    };
  },
};
