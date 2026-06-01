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
    label: "总账会计",
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
    key: "analysis",
    label: "管理会计",
    href: "/finance/analysis",
    checkAccess: (u) => !!u.canAccessFinanceAnalysis,
  },
  {
    key: "budget",
    label: "预算管理",
    href: "/finance/budget",
    checkAccess: (u) => !!u.canAccessFinanceBudget,
  },
  {
    key: "cost",
    label: "成本管理",
    href: "/finance/cost",
    checkAccess: (u) => !!u.canAccessFinanceCost,
  },
  {
    key: "tax",
    label: "税务管理",
    href: "/finance/tax",
    checkAccess: () => true,
  },
  {
    key: "treasury",
    label: "司库管理",
    href: "/finance/treasury",
    checkAccess: () => true,
  },
  {
    key: "import",
    label: "数据导入与治理",
    href: "/finance/import",
    checkAccess: (u) => !!u.canAccessFinanceImport,
  },
];

export const allFinanceModules: FinanceModuleItem[] = [
  {
    key: "ledger",
    label: "总账会计",
    desc: "科目、凭证、期间、余额、结账、重分类",
    href: "/finance/ledger",
    checkAccess: (u) => !!u.canAccessFinanceLedger,
  },
  {
    key: "statements",
    label: "财务报表",
    desc: "资产负债表、利润表、现金流量表、取数明细",
    href: "/finance/statements",
    checkAccess: (u) => !!u.canAccessFinanceReport,
  },
  {
    key: "statementConfig",
    label: "报表配置",
    desc: "资产负债表项目、科目映射、重分类开关",
    href: "/finance/statement-config",
    checkAccess: (u) => !!u.canAccessFinanceReport,
  },
  {
    key: "analysis",
    label: "管理会计",
    desc: "经营分析、部门利润、产品客户维度、预算执行分析",
    href: "/finance/analysis",
    checkAccess: (u) => !!u.canAccessFinanceAnalysis,
  },
  {
    key: "budget",
    label: "预算管理",
    desc: "预算版本、部门预算、研发预算、调整、执行",
    href: "/finance/budget",
    checkAccess: (u) => !!u.canAccessFinanceBudget,
  },
  {
    key: "cost",
    label: "成本管理",
    desc: "发货、成本结构、成本分析、车间工分、销售工资",
    href: "/finance/cost",
    checkAccess: (u) => !!u.canAccessFinanceCost,
  },
  {
    key: "tax",
    label: "税务管理",
    desc: "销项/进项、税负分析、发票、纳税申报辅助（规划中）",
    href: "/finance/tax",
    checkAccess: () => true,
  },
  {
    key: "treasury",
    label: "司库管理",
    desc: "银行账户、资金日报、收付款计划、现金流、授信（规划中）",
    href: "/finance/treasury",
    checkAccess: () => true,
  },
  {
    key: "import",
    label: "数据导入与治理",
    desc: "科目/凭证/余额/预算/成本导入，校验与异常处理",
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
