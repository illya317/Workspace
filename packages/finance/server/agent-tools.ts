/**
 * Finance 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { AgentTool } from "@workspace/platform/server/agent";
import type { SessionUser } from "@workspace/platform/types";

import {
  type DeptBudgetItem,
  type RdBudgetItem,
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
  readDeptBudget,
  readRdBudget,
} from "./budget/budget-data";
import { getActiveVersion } from "./budget/budget-version";

type BudgetToolItem = DeptBudgetItem | RdBudgetItem;

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

    let raw: BudgetToolItem[];
    if (active) {
      // 优先用 DB 中已导入/激活的版本数据
      raw = type === "rd"
        ? await loadRdBudgetFromDb(active.id)
        : await loadDeptBudgetFromDb(active.id);
    } else {
      // 无激活版本时回退到 seed Excel
      raw = type === "rd" ? readRdBudget() : readDeptBudget();
    }

    const items = raw.slice(0, 20).map((r) => {
      if (type === "rd") {
        const item = r as RdBudgetItem;
        return { project: item.project, category: item.category, total: item.total, months: item.months };
      }
      const item = r as DeptBudgetItem;
      return { dept: item.dept, account: item.account, total: item.total, months: item.months, expenseType: item.expenseType };
    });

    return {
      type: "data",
      message: `${year}年${label}${active ? `（版本：${active.name}）` : "（seed 数据）"}，共 ${items.length} 条记录`,
      data: { version: active ? { id: active.id, name: active.name, status: active.status, year } : null, type, items },
    };
  },
};

export const financeAgentTools: AgentTool[] = [queryBudgetTool];
