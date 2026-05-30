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
