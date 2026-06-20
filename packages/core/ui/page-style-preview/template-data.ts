import type { AccordionTabItem } from "../AccordionTabBar";

export type TemplateKind = "table" | "split" | "form" | "analysis" | "document" | "production" | "modal";

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
    summary: "总账、凭证、报表、预算和分析",
    nav: ["科目设置", "凭证明细", "余额表"],
    pages: [
      { key: "ledger", label: "总账", title: "科目余额", kind: "table" },
      { key: "voucher", label: "凭证", title: "凭证明细", kind: "form" },
      { key: "report", label: "报表", title: "财务报表", kind: "table" },
      { key: "budget", label: "预算", title: "预算执行", kind: "analysis" },
      { key: "analysis", label: "分析", title: "财务分析", kind: "analysis" },
      { key: "modal", label: "弹窗", title: "新建凭证", kind: "modal" },
    ],
  },
  {
    key: "production",
    label: "生产管理",
    summary: "批次检验、检验模板和填写预览",
    nav: ["批次检验", "检验模板", "填写预览"],
    pages: [
      { key: "batch", label: "批次检验", title: "批次检验记录", kind: "table" },
      { key: "template", label: "模板维护", title: "检验模板", kind: "split" },
      { key: "fill", label: "填写", title: "检验填写", kind: "production" },
      { key: "preview", label: "预览", title: "记录预览", kind: "document" },
      { key: "modal", label: "弹窗", title: "新增检验项", kind: "modal" },
    ],
  },
  {
    key: "hr",
    label: "人事管理",
    summary: "花名册、组织架构、岗位任职和人力分析",
    nav: ["员工资料", "组织架构", "部门岗位", "员工信息表"],
    pages: [
      { key: "directory", label: "员工资料", title: "员工花名册", kind: "table" },
      { key: "profile", label: "基本信息", title: "员工基本信息", kind: "form" },
      { key: "assignment", label: "岗位任职", title: "岗位任职", kind: "form" },
      { key: "department", label: "部门岗位", title: "部门岗位架构", kind: "split" },
      { key: "tree", label: "组织树", title: "组织架构", kind: "split" },
      { key: "modal", label: "弹窗", title: "新增员工", kind: "modal" },
    ],
  },
  {
    key: "work",
    label: "工作管理",
    summary: "工作计划、清单、汇报和历史记录",
    nav: ["工作计划", "工作清单", "工作汇报", "历史记录"],
    pages: [
      { key: "plans", label: "工作计划", title: "计划列表", kind: "split" },
      { key: "tasks", label: "工作清单", title: "任务清单", kind: "table" },
      { key: "reports", label: "工作汇报", title: "汇报记录", kind: "table" },
      { key: "history", label: "历史记录", title: "变更历史", kind: "table" },
      { key: "modal", label: "弹窗", title: "新建计划", kind: "modal" },
    ],
  },
  {
    key: "administration",
    label: "行政管理",
    summary: "合同台账、办公事务和证照归档",
    nav: ["合同台账", "办公事务", "证照归档"],
    pages: [
      { key: "contracts", label: "合同台账", title: "合同列表", kind: "table" },
      { key: "office", label: "办公事务", title: "办公事项", kind: "table" },
      { key: "archive", label: "归档", title: "归档资料", kind: "document" },
      { key: "modal", label: "弹窗", title: "新建合同", kind: "modal" },
    ],
  },
  {
    key: "relations",
    label: "外部关系",
    summary: "客户、投资人、供应商和联系记录",
    nav: ["客户", "投资人", "供应商", "联系记录"],
    pages: [
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
    nav: ["员工手册", "操作指南", "规章制度"],
    pages: [
      { key: "handbook", label: "员工手册", title: "员工手册", kind: "document" },
      { key: "guide", label: "操作指南", title: "操作指南", kind: "document" },
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
      { key: "catalog", label: "目录", title: "资料目录", kind: "split" },
      { key: "files", label: "文件列表", title: "资料文件", kind: "table" },
      { key: "detail", label: "文件详情", title: "文件详情", kind: "document" },
      { key: "upload", label: "上传", title: "上传资料", kind: "modal" },
      { key: "preview", label: "预览", title: "资料预览", kind: "document" },
    ],
  },
];

export const pageStyleTabs: AccordionTabItem[] = moduleTemplates.map((module) => ({
  key: module.key,
  label: module.label,
  children: module.pages.map((page) => ({ key: page.key, label: page.label })),
}));
