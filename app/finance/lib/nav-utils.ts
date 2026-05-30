import { SessionUser } from "@/lib/types";

export interface FinanceNavItem {
  key: string;
  label: string;
  href: string;
  checkAccess: (user: SessionUser) => boolean;
}

export interface FinanceModuleItem extends FinanceNavItem {
  desc: string;
}

export const allFinanceNavItems: FinanceNavItem[] = [
  {
    key: "ledger",
    label: "总账基础",
    href: "/finance/ledger",
    checkAccess: (u) => !!u.canAccessFinanceLedger,
  },
  {
    key: "statements",
    label: "财务报表",
    href: "/finance/statements",
    checkAccess: (u) => !!u.canAccessFinanceReport,
  },
  {
    key: "budget",
    label: "预算管理",
    href: "/finance/budget",
    checkAccess: (u) => !!u.canAccessFinanceBudget,
  },
  {
    key: "analysis",
    label: "财务分析",
    href: "/finance/analysis",
    checkAccess: (u) => !!u.canAccessFinanceAnalysis,
  },
  {
    key: "cost",
    label: "成本管理",
    href: "/finance/cost",
    checkAccess: (u) => !!u.canAccessFinanceCost,
  },
  {
    key: "import",
    label: "数据导入",
    href: "/finance/import",
    checkAccess: (u) => !!u.canAccessFinanceImport,
  },
];

export const allFinanceModules: FinanceModuleItem[] = [
  {
    key: "ledger",
    label: "总账基础",
    desc: "科目设置、凭证明细、余额表、期间管理",
    href: "/finance/ledger",
    checkAccess: (u) => !!u.canAccessFinanceLedger,
  },
  {
    key: "statements",
    label: "财务报表",
    desc: "资产负债表、利润表、现金流量表",
    href: "/finance/statements",
    checkAccess: (u) => !!u.canAccessFinanceReport,
  },
  {
    key: "budget",
    label: "预算管理",
    desc: "部门费用预算、研发费用预算",
    href: "/finance/budget",
    checkAccess: (u) => !!u.canAccessFinanceBudget,
  },
  {
    key: "analysis",
    label: "财务分析",
    desc: "预算执行分析、差异分析、趋势看板",
    href: "/finance/analysis",
    checkAccess: (u) => !!u.canAccessFinanceAnalysis,
  },
  {
    key: "cost",
    label: "成本管理",
    desc: "生产成本、发货、成本构成、车间工分",
    href: "/finance/cost",
    checkAccess: (u) => !!u.canAccessFinanceCost,
  },
  {
    key: "import",
    label: "数据导入",
    desc: "科目表、序时账、余额表导入",
    href: "/finance/import",
    checkAccess: (u) => !!u.canAccessFinanceImport,
  },
];

export function getFinanceNavItems(user: SessionUser): FinanceNavItem[] {
  return allFinanceNavItems.filter((item) => item.checkAccess(user));
}

export function getFinanceModules(user: SessionUser): FinanceModuleItem[] {
  return allFinanceModules.filter((m) => m.checkAccess(user));
}
