/**
 * 全站模块注册表 — 导航、权限、入口卡片的唯一真相来源。
 * 新增模块必须在此注册，Portal / ModuleHome / AppShell 均从此读取。
 */
import { SessionUser } from "@/lib/types";
import type { ReactNode } from "react";
import type { ModuleLifecycleStatus } from "./module-lifecycle";

// ─── 类型 ────────────────────────────────────────────────

export interface SubModuleDef {
  key: string;
  label: string;
  desc: string;
  href: string;
  /** RBAC resource key — checked via visibleResourceKeys */
  resourceKey: string;
  lifecycleStatus?: ModuleLifecycleStatus;
}

export interface ModuleDef {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: ReactNode;
  color: "emerald" | "blue" | "indigo" | "purple" | "amber" | "cyan" | "orange";
  resourceKey?: string;
  lifecycleStatus?: ModuleLifecycleStatus;
  children?: SubModuleDef[];
}

/** 检查单个资源可见性 */
function canAccess(user: SessionUser, resourceKey?: string): boolean {
  if (resourceKey) {
    return (user.visibleResourceKeys || []).includes(resourceKey);
  }
  return true;
}

// ─── SVG icons ────────────────────────────────────────────

const icons = {
  reports: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  hr: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  admin: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  docs: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  finance: (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none">¥</text>
    </svg>
  ),
  production: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  customers: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  tax: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-4 0h4v4m-5 3h.01M4 4h16v16H4V4z" />
      <circle cx="12" cy="12" r="8" strokeWidth={1.5} className="opacity-30" />
    </svg>
  ),
  treasury: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M4 21V10l4-4h5l4 4v11M8 21v-4a1 1 0 011-1h2.5M14 21v-7M10 7h4M17 21v-7" />
      <circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
};

// ─── 注册表 ───────────────────────────────────────────────

export const MODULES: ModuleDef[] = [
  { key: "reports", label: "工作汇报", desc: "填写周报、月报、季报、年报", href: "/reports", icon: icons.reports, color: "emerald", resourceKey: "work" },
  { key: "hr", label: "人事管理", desc: "花名册、考勤、绩效、人力分析", href: "/hr", icon: icons.hr, color: "blue", resourceKey: "people",
    children: [
      { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP、项目", href: "/hr/roster", resourceKey: "people.roster" },
      { key: "performance", label: "考勤绩效", desc: "考勤记录、工作查看、绩效评估", href: "/hr/performance", resourceKey: "people.performance" },
      { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", resourceKey: "people.analytics" },
    ],
  },
  { key: "administration", label: "行政管理", desc: "合同台账、办公事务", href: "/administration", icon: icons.admin, color: "indigo", resourceKey: "administration",
    children: [
      { key: "contracts", label: "合同台账", desc: "合同录入、查询、到期预警", href: "/contracts", resourceKey: "administration.contract" },
    ],
  },
  { key: "finance", label: "财务管理", desc: "总账、凭证、财务报表、预算、分析", href: "/finance", icon: icons.finance, color: "amber", resourceKey: "finance",
    children: [
      { key: "ledger", label: "总账会计", desc: "科目、凭证、期间、余额、结账、重分类", href: "/finance/ledger", resourceKey: "finance.ledger" },
      { key: "statementConfig", label: "报表配置", desc: "报表项目配置、科目映射、余额校对", href: "/finance/statement-config", resourceKey: "finance.statement" },
      { key: "statementReview", label: "报表校对", desc: "利润表、现金流量表底稿校对与签核", href: "/finance/statement-review", resourceKey: "finance.statement" },
      { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、取数明细", href: "/finance/statements", resourceKey: "finance.statement" },
      { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", resourceKey: "finance.analysis" },
      { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", resourceKey: "finance.budget" },
      { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、车间工分、销售工资", href: "/finance/cost", resourceKey: "finance.cost" },
      { key: "tax", label: "税务管理", desc: "销项/进项、税负分析、发票（规划中）", href: "/finance/tax", resourceKey: "finance.tax" },
      { key: "treasury", label: "司库管理", desc: "银行账户、资金日报、收付款、现金流（规划中）", href: "/finance/treasury", resourceKey: "finance.treasury" },
      { key: "import", label: "数据导入与治理", desc: "科目/凭证/余额/预算/成本导入，校验与异常", href: "/finance/import", resourceKey: "finance.import" },
    ],
  },
  { key: "production", label: "生产管理", desc: "原辅料、包装、成品库存", href: "/production", icon: icons.production, color: "cyan", resourceKey: "production",
    children: [
      { key: "inventory", label: "库存管理", desc: "原辅料、包装材料、成品库存", href: "/inventory", resourceKey: "production.inventory" },
    ],
  },
  { key: "external", label: "外部关系", desc: "客户、投资人、供应商", href: "/external", icon: icons.customers, color: "orange", resourceKey: "external",
    children: [
      { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/external/investors", resourceKey: "external.investor" },
      { key: "customers", label: "客户管理", desc: "客户信息、跟进记录", href: "/external/customers", resourceKey: "external.customer" },
      { key: "suppliers", label: "供应商管理", desc: "供应商信息、采购记录", href: "/external/suppliers", resourceKey: "external.supplier" },
    ],
  },
  { key: "docs", label: "文档中心", desc: "员工手册、操作指南、规章制度", href: "/docs", icon: icons.docs, color: "purple", resourceKey: "docs",
    children: [
      { key: "positions", label: "岗位说明书", desc: "GMP 岗位说明书", href: "/docs/positions/GMP", resourceKey: "docs.positions" },
      { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", resourceKey: "docs.company" },
      { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", resourceKey: "docs.expense" },
      { key: "api-guide", label: "接入指南", desc: "API 接入文档与示例", href: "/docs/api-guide", resourceKey: "system.api" },
    ],
  },
  { key: "library", label: "资料库", desc: "内部资料存档", href: "/library", resourceKey: "library", icon: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ), color: "orange" },
  { key: "settings", label: "设置", desc: "个人设置、系统配置", href: "/settings", icon: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ), color: "orange" },
];

// ─── 辅助函数 ─────────────────────────────────────────────

/** Portal 用：过滤用户有权限的一级模块。有子模块的 L1，至少要有一个可见子模块才显示。 */
export function getAccessibleModules(user: SessionUser): ModuleDef[] {
  return MODULES.filter((m) => {
    if (canAccess(user, m.resourceKey)) return true;
    if (m.children?.length) {
      return m.children.some((c) => canAccess(user, c.resourceKey));
    }
    return false;
  });
}

export function getSubModules(user: SessionUser, moduleKey: string): SubModuleDef[] {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod?.children) return [];
  return mod.children.filter((c) => canAccess(user, c.resourceKey));
}

/** 无子模块时 ModuleHome 的提示文案 */
export function getEmptyMessage(_moduleKey: string): string {
  return "暂无可用模块，请联系管理员开通权限";
}

// Dev-time validation: catch missing access gates
if (typeof window === "undefined") {
  for (const m of MODULES) {
    if (!m.resourceKey && m.key !== "settings") {
      console.error(`[module-nav] ${m.key}: 缺少 resourceKey，将全员可见`);
    }
    for (const c of m.children || []) {
      if (!c.resourceKey) console.error(`[module-nav] ${m.key}.${c.key}: 缺少 resourceKey，将全员可见`);
    }
  }
}
