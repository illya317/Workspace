/**
 * Finance 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { SessionUser } from "@/lib/types";
import type { AgentTool } from "./registry";
import { getActiveVersion } from "@workspace/finance/server/budget/budget-version";
import {
  readDeptBudget, readRdBudget,
  loadDeptBudgetFromDb, loadRdBudgetFromDb,
} from "@workspace/finance/server/budget/budget-data";

export const queryBudgetTool: AgentTool = {
  key: "finance.queryBudget",
  label: "查询预算",
  description: "查询年度预算数据（部门预算或研发预算）",
  mutates: false,

  canUse(user: SessionUser): boolean {
    return (user.visibleResourceKeys || []).includes("finance.budget");
  },

  async execute(params: Record<string, unknown>, _user: SessionUser) {
    const year = typeof params.year === "number" ? params.year
      : typeof params.year === "string" ? parseInt(params.year)
      : new Date().getFullYear();
    const type = typeof params.type === "string" ? params.type : "dept";

    const active = await getActiveVersion(year);
    const label = type === "rd" ? "研发预算" : "部门预算";

    let raw;
    if (active) {
      // 优先用 DB 中已导入/激活的版本数据
      raw = type === "rd"
        ? await loadRdBudgetFromDb(active.id)
        : await loadDeptBudgetFromDb(active.id);
    } else {
      // 无激活版本时回退到 seed Excel
      raw = type === "rd" ? readRdBudget() : readDeptBudget();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = raw.slice(0, 20).map((r: any) => {
      if (type === "rd") {
        return { project: r.project, category: r.category, total: r.total, months: r.months };
      }
      return { dept: r.dept, account: r.account, total: r.total, months: r.months, expenseType: r.expenseType };
    });

    return {
      type: "data",
      message: `${year}年${label}${active ? `（版本：${active.name}）` : "（seed 数据）"}，共 ${items.length} 条记录`,
      data: { version: active ? { id: active.id, name: active.name, status: active.status, year } : null, type, items },
    };
  },
};
