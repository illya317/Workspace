import type { AccordionTabItem } from "../AccordionTabBar";

export type TemplateKind = "home" | "table" | "split" | "form" | "analysis" | "document" | "production" | "modal" | "upload";

export interface PageTemplate {
  key: string;
  label: string;
  title: string;
  kind: TemplateKind;
}

export interface ModuleTemplate {
  key: string;
  label: string;
  summary: string;
  nav: string[];
  pages: PageTemplate[];
}

export const moduleTemplates: ModuleTemplate[] = [
  {
    key: "finance",
    label: "财务管理",
    summary: "总账、凭证、报表、预算、成本、导入和分析",
    nav: ["总账", "报表", "预算", "成本", "分析"],
    pages: [
      { key: "home", label: "首页", title: "财务入口", kind: "home" },
      { key: "ledger", label: "总账/凭证", title: "科目余额与凭证明细", kind: "table" },
      { key: "statements", label: "财务报表", title: "报表数据", kind: "table" },
      { key: "statement-config", label: "报表配置", title: "报表项目配置", kind: "split" },
      { key: "statement-review", label: "报表审核", title: "报表审核", kind: "table" },
      { key: "budget", label: "预算", title: "预算执行", kind: "analysis" },
      { key: "cost", label: "成本", title: "成本结构", kind: "analysis" },
      { key: "import", label: "导入", title: "财务导入", kind: "upload" },
      { key: "tax", label: "税务", title: "税务记录", kind: "table" },
      { key: "treasury", label: "资金", title: "资金台账", kind: "table" },
      { key: "analysis", label: "分析", title: "财务分析", kind: "analysis" },
      { key: "modal", label: "弹窗", title: "新建凭证", kind: "modal" },
    ],
  },
  {
    key: "production",
    label: "生产管理",
    summary: "批次检验、检验模板、库存和填写预览",
    nav: ["批次", "阶段", "检验项", "模板", "库存"],
    pages: [
      { key: "home", label: "首页", title: "生产入口", kind: "home" },
      { key: "qc", label: "QC 首页", title: "QC 工作台", kind: "table" },
      { key: "batches", label: "批次列表", title: "批次检验记录", kind: "table" },
      { key: "batch-detail", label: "批次详情", title: "批次详情", kind: "split" },
      { key: "stage", label: "阶段详情", title: "阶段检验", kind: "split" },
      { key: "test", label: "检验填写", title: "检验填写", kind: "production" },
      { key: "templates", label: "模板列表", title: "检验模板", kind: "table" },
      { key: "template-detail", label: "模板详情", title: "模板维护", kind: "split" },
      { key: "inventory", label: "库存", title: "库存台账", kind: "table" },
      { key: "preview", label: "预览", title: "记录预览", kind: "document" },
      { key: "modal", label: "弹窗", title: "新增检验项", kind: "modal" },
    ],
  },
  {
    key: "hr",
    label: "人事管理",
    summary: "花名册、组织架构、岗位任职、绩效和人力分析",
    nav: ["员工", "组织", "岗位", "绩效", "分析"],
    pages: [
      { key: "home", label: "首页", title: "人事入口", kind: "home" },
      { key: "roster", label: "花名册", title: "员工花名册", kind: "table" },
      { key: "employee-detail", label: "员工详情", title: "员工详情", kind: "form" },
      { key: "profile", label: "基本信息", title: "员工基本信息", kind: "form" },
      { key: "assignment", label: "岗位任职", title: "岗位任职", kind: "form" },
      { key: "department", label: "部门岗位", title: "部门岗位架构", kind: "split" },
      { key: "tree", label: "组织树", title: "组织架构", kind: "split" },
      { key: "analytics", label: "人力分析", title: "人力分析", kind: "analysis" },
      { key: "performance", label: "绩效", title: "绩效记录", kind: "table" },
      { key: "modal", label: "弹窗", title: "新增员工", kind: "modal" },
    ],
  },
  {
    key: "work",
    label: "工作管理",
    summary: "工作计划、清单、汇报和历史记录",
    nav: ["计划", "清单", "汇报", "历史"],
    pages: [
      { key: "home", label: "首页", title: "工作入口", kind: "home" },
      { key: "plans", label: "工作计划", title: "计划列表", kind: "split" },
      { key: "works", label: "工作清单", title: "任务清单", kind: "table" },
      { key: "reports", label: "工作汇报", title: "汇报记录", kind: "table" },
      { key: "history", label: "历史记录", title: "变更历史", kind: "table" },
      { key: "plan-detail", label: "计划详情", title: "计划详情", kind: "form" },
      { key: "modal", label: "弹窗", title: "新建计划", kind: "modal" },
    ],
  },
  {
    key: "administration",
    label: "行政管理",
    summary: "合同台账、办公事务和证照归档",
    nav: ["行政", "合同", "归档"],
    pages: [
      { key: "home", label: "首页", title: "行政入口", kind: "home" },
      { key: "contracts", label: "合同台账", title: "合同列表", kind: "table" },
      { key: "contract-detail", label: "合同详情", title: "合同详情", kind: "form" },
      { key: "office", label: "办公事务", title: "办公事项", kind: "table" },
      { key: "archive", label: "归档", title: "归档资料", kind: "document" },
      { key: "modal", label: "弹窗", title: "新建合同", kind: "modal" },
    ],
  },
  {
    key: "relations",
    label: "外部关系",
    summary: "客户、投资人、供应商和联系记录",
    nav: ["客户", "投资人", "供应商", "联系"],
    pages: [
      { key: "home", label: "首页", title: "外部关系入口", kind: "home" },
      { key: "customers", label: "客户", title: "客户列表", kind: "split" },
      { key: "investors", label: "投资人", title: "投资人列表", kind: "table" },
      { key: "suppliers", label: "供应商", title: "供应商列表", kind: "table" },
      { key: "contacts", label: "联系记录", title: "联系记录", kind: "table" },
      { key: "modal", label: "弹窗", title: "新增关系", kind: "modal" },
    ],
  },
  {
    key: "docs",
    label: "文档中心",
    summary: "员工手册、操作指南和规章制度",
    nav: ["手册", "指南", "制度", "岗位"],
    pages: [
      { key: "home", label: "首页", title: "文档入口", kind: "home" },
      { key: "handbook", label: "员工手册", title: "员工手册", kind: "document" },
      { key: "guide", label: "操作指南", title: "操作指南", kind: "document" },
      { key: "api-guide", label: "API 指南", title: "API 指南", kind: "document" },
      { key: "company", label: "公司文档", title: "公司文档", kind: "document" },
      { key: "expense", label: "费用制度", title: "费用制度", kind: "document" },
      { key: "positions", label: "岗位文档", title: "岗位文档", kind: "table" },
      { key: "gmp-list", label: "GMP 列表", title: "GMP 岗位", kind: "table" },
      { key: "gmp-detail", label: "GMP 详情", title: "岗位详情", kind: "document" },
      { key: "policy", label: "规章制度", title: "规章制度", kind: "table" },
      { key: "preview", label: "预览", title: "文档预览", kind: "document" },
      { key: "modal", label: "弹窗", title: "发布文档", kind: "modal" },
    ],
  },
  {
    key: "library",
    label: "资料库",
    summary: "目录、文件列表、详情、上传和预览",
    nav: ["目录", "文件", "详情", "上传"],
    pages: [
      { key: "home", label: "首页", title: "资料库入口", kind: "split" },
      { key: "catalog", label: "目录", title: "资料目录", kind: "split" },
      { key: "files", label: "文件列表", title: "资料文件", kind: "table" },
      { key: "detail", label: "文件详情", title: "文件详情", kind: "document" },
      { key: "upload", label: "上传", title: "上传资料", kind: "upload" },
      { key: "preview", label: "预览", title: "资料预览", kind: "document" },
    ],
  },
];

export const pageStyleTabs: AccordionTabItem[] = moduleTemplates.map((module) => ({
  key: module.key,
  label: module.label,
  children: module.pages.map((page) => ({ key: page.key, label: page.label })),
}));
