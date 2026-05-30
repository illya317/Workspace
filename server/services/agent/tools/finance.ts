/**
 * Finance 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { SessionUser } from "@/lib/types";
import type { AgentTool } from "./registry";
import { getActiveVersion } from "@/server/services/finance/budget/budget-version";
import { readDeptBudget, readRdBudget } from "@/server/services/finance/budget/budget-data";

export const queryBudgetTool: AgentTool = {
  key: "finance.queryBudget",
  label: "查询预算",
  description: "查询年度预算数据（部门预算或研发预算）",

  canUse(user: SessionUser): boolean {
    return !!user.canAccessFinanceBudget;
  },

  async execute(params: Record<string, unknown>, _user: SessionUser) {
    const year = typeof params.year === "number" ? params.year
      : typeof params.year === "string" ? parseInt(params.year)
      : new Date().getFullYear();
    const type = typeof params.type === "string" ? params.type : "dept"; // dept | rd

    // 查活跃版本
    const active = await getActiveVersion(year);
    const versionInfo = active
      ? { id: active.id, name: active.name, status: active.status, year }
      : null;

    // 读预算数据
    const label = type === "rd" ? "研发预算" : "部门预算";
    let items;
    if (type === "rd") {
      const raw = readRdBudget();
      items = raw.slice(0, 20).map((r) => ({
        project: r.project,
        category: r.category,
        total: r.total,
        months: r.months,
      }));
    } else {
      const raw = readDeptBudget();
      items = raw.slice(0, 20).map((d) => ({
        dept: d.dept,
        account: d.account,
        total: d.total,
        months: d.months,
        expenseType: d.expenseType,
      }));
    }

    return {
      type: "data",
      message: `${year}年${label}${versionInfo ? `（版本：${versionInfo.name}）` : ""}，共 ${items.length} 条记录`,
      data: { version: versionInfo, type, items },
    };
  },
};
