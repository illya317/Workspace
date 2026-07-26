import type { SessionUser } from "@workspace/platform/types";

export interface FinanceNavItem {
  key: string;
  label: string;
  href: string;
  checkAccess: (user: SessionUser) => boolean;
}

export interface FinanceModuleItem extends FinanceNavItem {
  desc: string;
}

function hasResource(user: SessionUser, resourceKey: string): boolean {
  return (user.visibleResourceKeys || []).includes(resourceKey);
}

export const allFinanceNavItems: FinanceNavItem[] = [
  { key: "ledger", label: "总账会计", href: "/finance/ledger", checkAccess: (user) => hasResource(user, "finance.ledger") },
  { key: "statements", label: "财务报表", href: "/finance/statements", checkAccess: (user) => hasResource(user, "finance.statements") },
  { key: "analysis", label: "管理会计", href: "/finance/analysis", checkAccess: (user) => hasResource(user, "finance.analysis") },
  { key: "budget", label: "预算管理", href: "/finance/budget", checkAccess: (user) => hasResource(user, "finance.budget") },
  { key: "cost", label: "成本管理", href: "/finance/cost", checkAccess: (user) => hasResource(user, "finance.cost") },
];

export const allFinanceModules: FinanceModuleItem[] = [
  { key: "ledger", label: "总账会计", desc: "科目、凭证、期间、余额、结账、重分类", href: "/finance/ledger", checkAccess: (user) => hasResource(user, "finance.ledger") },
  { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、项目配置、科目映射与余额校对", href: "/finance/statements", checkAccess: (user) => hasResource(user, "finance.statements") },
  { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", checkAccess: (user) => hasResource(user, "finance.analysis") },
  { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", checkAccess: (user) => hasResource(user, "finance.budget") },
  { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、销售工资", href: "/finance/cost", checkAccess: (user) => hasResource(user, "finance.cost") },
];

export function getFinanceNavItems(user: SessionUser): FinanceNavItem[] {
  return allFinanceNavItems.filter((item) => item.checkAccess(user));
}

export function getFinanceModules(user: SessionUser): FinanceModuleItem[] {
  return allFinanceModules.filter((moduleItem) => moduleItem.checkAccess(user));
}
