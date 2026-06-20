import type { AccordionTabItem } from "../AccordionTabBar";

export const OVERVIEW_TAB_KEY = "__overview";

export type TemplateKind = "overview" | "table" | "split" | "form" | "analysis" | "document" | "production" | "modal" | "upload";

export interface PageTemplate {
  key: string;
  label: string;
  title: string;
  kind: TemplateKind;
  group?: string;
  fields?: string[];
  tableColumns?: string[];
  listItems?: string[];
  routes?: string[];
  toolbar?: boolean;
}

export interface ModuleTemplate {
  key: string;
  label: string;
  summary: string;
  overviewLabel: string;
  entryRoutes?: string[];
  pages: PageTemplate[];
}

export interface PageGroup {
  key: string;
  label: string;
  pages: PageTemplate[];
}

export const moduleTemplates: ModuleTemplate[] = [
  {
    key: "finance",
    label: "财务管理",
    summary: "总账、凭证、报表、预算、成本、导入和分析",
    overviewLabel: "Finance/财务管理",
    entryRoutes: ["finance"],
    pages: [
      { key: "ledger", label: "总账/凭证", title: "科目余额与凭证明细", kind: "table", group: "账表数据", routes: ["finance/ledger"], tableColumns: ["科目编码", "科目名称", "方向", "期初", "借方", "贷方", "期末"] },
      { key: "voucher", label: "凭证明细", title: "凭证明细", kind: "table", group: "账表数据", tableColumns: ["凭证号", "摘要", "科目", "借方", "贷方", "制单人", "状态"] },
      { key: "statements", label: "财务报表", title: "报表数据", kind: "table", group: "账表数据", routes: ["finance/statements"], tableColumns: ["项目", "本期", "上期", "差额", "状态"] },
      { key: "statement-config", label: "报表配置", title: "报表项目配置", kind: "split", group: "报表治理", routes: ["finance/statement-config"], fields: ["项目编码", "项目名称", "报表类型", "取数口径", "方向", "排序"] },
      { key: "statement-review", label: "报表审核", title: "报表审核", kind: "table", group: "报表治理", routes: ["finance/statement-review"], tableColumns: ["报表", "期间", "提交人", "差异数", "状态", "更新时间"] },
      { key: "reclass-rules", label: "规则配置", title: "重分类规则", kind: "split", group: "重分类模式", tableColumns: ["规则", "来源科目", "目标项目", "条件", "状态"] },
      { key: "reclass-review", label: "结果审核", title: "重分类审核", kind: "table", group: "重分类模式", tableColumns: ["期间", "来源科目", "目标项目", "金额", "差异", "状态"] },
      { key: "budget", label: "预算", title: "预算执行", kind: "analysis", group: "分析预算", routes: ["finance/budget"] },
      { key: "cost", label: "成本", title: "成本结构", kind: "analysis", group: "分析预算", routes: ["finance/cost"] },
      { key: "import", label: "导入", title: "财务导入", kind: "upload", group: "导入弹窗", routes: ["finance/import"], fields: ["导入类型", "公司", "期间", "来源", "负责人", "状态"] },
      { key: "tax", label: "税务", title: "税务记录", kind: "table", group: "账表数据", routes: ["finance/tax"], tableColumns: ["税种", "期间", "金额", "申报状态", "更新时间"] },
      { key: "treasury", label: "资金", title: "资金台账", kind: "table", group: "账表数据", routes: ["finance/treasury"], tableColumns: ["账户", "币种", "余额", "用途", "更新时间"] },
      { key: "analysis", label: "分析", title: "财务分析", kind: "analysis", group: "分析预算", routes: ["finance/analysis"] },
      { key: "modal", label: "弹窗", title: "新建凭证", kind: "modal", group: "导入弹窗" },
    ],
  },
  {
    key: "production",
    label: "生产管理",
    summary: "批次检验、检验模板、库存和填写预览",
    overviewLabel: "Production/生产管理",
    entryRoutes: ["production"],
    pages: [
      { key: "qc", label: "批次总览", title: "QC 工作台", kind: "table", group: "批次检验", routes: ["production/qc"], tableColumns: ["批号", "产品", "阶段", "待检项", "异常", "状态"] },
      { key: "batches", label: "批次列表", title: "批次检验记录", kind: "table", group: "批次检验", routes: ["production/qc/batches"], tableColumns: ["批号", "产品", "规格", "阶段", "负责人", "状态"] },
      { key: "batch-exception", label: "异常", title: "异常检验记录", kind: "table", group: "批次检验", tableColumns: ["批号", "阶段", "检验项", "异常值", "负责人", "状态"] },
      { key: "batch-detail", label: "批次详情", title: "批次详情", kind: "split", group: "填写预览", routes: ["production/qc/batches/[batchId]"], fields: ["批号", "产品", "规格", "生产日期", "放行状态", "负责人"] },
      { key: "stage", label: "阶段详情", title: "阶段检验", kind: "split", group: "填写预览", routes: ["production/qc/batches/[batchId]/[stageKey]"], fields: ["阶段", "检验项", "方法", "结果", "判定", "复核人"] },
      { key: "test", label: "检验填写", title: "检验填写", kind: "production", group: "填写预览", routes: ["production/qc/batches/[batchId]/[stageKey]/[testName]"], fields: ["检验项", "结果", "单位", "限度", "判定", "备注"] },
      { key: "templates", label: "模板列表", title: "检验模板", kind: "table", group: "检验模板", routes: ["production/qc/templates"], tableColumns: ["模板", "产品", "版本", "阶段数", "状态", "更新时间"] },
      { key: "template-detail", label: "编辑", title: "模板维护", kind: "split", group: "检验模板", routes: ["production/qc/templates/[templateId]"], fields: ["模板名称", "产品", "版本", "阶段", "字段数", "状态"] },
      { key: "template-preview", label: "预览", title: "模板预览", kind: "production", group: "检验模板", fields: ["项目名称", "结果", "单位", "标准", "判定", "备注"] },
      { key: "template-feedback", label: "反馈", title: "模板反馈", kind: "table", group: "检验模板", tableColumns: ["位置", "问题", "反馈人", "状态", "处理人", "更新时间"] },
      { key: "inventory", label: "库存", title: "库存台账", kind: "table", group: "库存", routes: ["inventory"], tableColumns: ["物料", "批号", "库存", "单位", "库位", "状态"] },
      { key: "preview", label: "预览", title: "记录预览", kind: "document", group: "填写预览" },
      { key: "modal", label: "弹窗", title: "新增检验项", kind: "modal", group: "检验模板" },
    ],
  },
  {
    key: "hr",
    label: "人事管理",
    summary: "花名册、组织架构、岗位任职、绩效和人力分析",
    overviewLabel: "HR/人事基础资料",
    entryRoutes: ["hr"],
    pages: [
      { key: "roster", label: "在职", title: "在职员工", kind: "table", group: "员工资料", routes: ["hr/roster"], tableColumns: ["员工编号", "姓名", "部门", "岗位", "状态", "入职日期"] },
      { key: "employee-inactive", label: "离职", title: "离职员工", kind: "table", group: "员工资料", tableColumns: ["员工编号", "姓名", "离职日期", "原部门", "原岗位", "状态"] },
      { key: "employee-detail", label: "员工详情", title: "员工详情", kind: "form", group: "员工资料", routes: ["hr/roster/employees/[id]"], fields: ["员工编号", "姓名", "别名", "性别", "出生年月", "农历生日", "民族", "籍贯", "政治面貌", "学历", "职称", "毕业院校", "电话", "身份证号", "参加工作时间"] },
      { key: "profile", label: "基本信息", title: "员工基本信息", kind: "form", group: "员工资料", fields: ["员工编号", "姓名", "别名", "民族", "籍贯", "学历", "职称", "电话", "身份证号"] },
      { key: "assignment", label: "现任", title: "岗位任职", kind: "form", group: "任职绩效", fields: ["部门", "岗位", "主岗", "工作占比", "直接上级", "开始日期", "结束日期", "任职状态", "备注"] },
      { key: "assignment-history", label: "历史任职", title: "历史任职", kind: "table", group: "任职绩效", tableColumns: ["部门", "岗位", "开始日期", "结束日期", "主岗", "状态"] },
      { key: "department", label: "现用", title: "部门岗位架构", kind: "split", group: "部门岗位", fields: ["部门编码", "部门名称", "别名", "部门负责人", "层级", "状态", "直属岗位", "总岗位"] },
      { key: "department-archived", label: "归档", title: "归档部门岗位", kind: "split", group: "部门岗位", fields: ["部门编码", "部门名称", "归档日期", "归档原因", "原负责人", "状态"] },
      { key: "tree", label: "组织树", title: "组织架构", kind: "split", group: "组织架构", listItems: ["轮执委员会", "董秘办及资本证券", "职能事业部平台", "行政人事部"], fields: ["部门编码", "部门名称", "负责人", "层级", "直属部门", "直属岗位"] },
      { key: "analytics", label: "人力分析", title: "人力分析", kind: "analysis", group: "人力分析", routes: ["hr/analytics"] },
      { key: "performance", label: "绩效", title: "绩效记录", kind: "table", group: "任职绩效", routes: ["hr/performance"], tableColumns: ["员工", "周期", "评分", "等级", "确认人", "状态"] },
      { key: "modal", label: "弹窗", title: "新增员工", kind: "modal", group: "员工资料" },
    ],
  },
  {
    key: "work",
    label: "工作管理",
    summary: "工作计划、清单、汇报和历史记录",
    overviewLabel: "Work/工作管理",
    entryRoutes: ["work"],
    pages: [
      { key: "plans", label: "现用", title: "计划列表", kind: "split", group: "工作计划", routes: ["work/plans"], fields: ["计划编码", "计划名称", "主导部门", "负责人", "预算金额", "风险等级"] },
      { key: "plans-archived", label: "归档", title: "归档计划", kind: "table", group: "工作计划", tableColumns: ["计划编码", "计划名称", "归档日期", "主导部门", "负责人", "状态"] },
      { key: "works", label: "待办", title: "待办任务", kind: "table", group: "工作清单", routes: ["works"], tableColumns: ["任务", "负责人", "计划", "优先级", "截止日", "状态"] },
      { key: "works-done", label: "已完成", title: "已完成任务", kind: "table", group: "工作清单", tableColumns: ["任务", "负责人", "计划", "完成日期", "确认人", "状态"] },
      { key: "reports", label: "周报", title: "周报记录", kind: "table", group: "工作汇报", routes: ["reports"], tableColumns: ["周期", "填报人", "计划", "完成率", "风险", "状态"] },
      { key: "reports-month", label: "月报", title: "月报记录", kind: "table", group: "工作汇报", tableColumns: ["月份", "填报人", "计划", "完成率", "风险", "状态"] },
      { key: "history", label: "历史记录", title: "变更历史", kind: "table", group: "历史记录", routes: ["history"], tableColumns: ["对象", "动作", "操作人", "时间", "摘要"] },
      { key: "plan-detail", label: "计划详情", title: "计划详情", kind: "form", group: "工作计划", fields: ["计划编码", "计划名称", "主导部门", "负责人", "预算金额", "开始日期", "结束日期", "状态", "备注"] },
      { key: "modal", label: "弹窗", title: "新建计划", kind: "modal", group: "工作计划" },
    ],
  },
  {
    key: "administration",
    label: "行政管理",
    summary: "合同台账、办公事务和证照归档",
    overviewLabel: "Administration/行政管理",
    entryRoutes: ["administration"],
    pages: [
      { key: "contracts", label: "现用", title: "合同列表", kind: "table", group: "合同台账", routes: ["contracts"], tableColumns: ["合同编号", "合同名称", "相对方", "金额", "到期日", "状态"] },
      { key: "contracts-expiring", label: "到期", title: "即将到期合同", kind: "table", group: "合同台账", tableColumns: ["合同编号", "合同名称", "到期日", "负责人", "续签状态", "风险"] },
      { key: "contracts-archived", label: "归档", title: "归档合同", kind: "table", group: "合同台账", tableColumns: ["合同编号", "合同名称", "归档日期", "相对方", "负责人", "状态"] },
      { key: "contract-detail", label: "合同详情", title: "合同详情", kind: "form", group: "合同台账", fields: ["合同编号", "合同名称", "相对方", "合同金额", "签署日期", "到期日期", "负责人", "状态", "备注"] },
      { key: "office", label: "办公事务", title: "办公事项", kind: "table", group: "办公事务", tableColumns: ["事项", "负责人", "类型", "截止日", "状态"] },
      { key: "archive", label: "归档", title: "归档资料", kind: "document", group: "归档资料" },
      { key: "modal", label: "弹窗", title: "新建合同", kind: "modal", group: "合同台账" },
    ],
  },
  {
    key: "relations",
    label: "外部关系",
    summary: "客户、投资人、供应商和联系记录",
    overviewLabel: "External/外部关系",
    entryRoutes: ["external"],
    pages: [
      { key: "customers", label: "客户", title: "客户列表", kind: "split", group: "客户联系", routes: ["external/customers"], fields: ["客户编号", "客户名称", "行业", "联系人", "电话", "状态"] },
      { key: "customers-archive", label: "归档客户", title: "归档客户", kind: "table", group: "客户联系", tableColumns: ["客户编号", "客户名称", "归档日期", "原负责人", "原因", "状态"] },
      { key: "investors", label: "投资人", title: "投资人列表", kind: "table", group: "投资人", routes: ["external/investors"], tableColumns: ["投资人", "类型", "联系人", "轮次", "状态"] },
      { key: "suppliers", label: "供应商", title: "供应商列表", kind: "table", group: "供应商", routes: ["external/suppliers"], tableColumns: ["供应商", "类型", "联系人", "评级", "状态"] },
      { key: "contacts", label: "联系记录", title: "联系记录", kind: "table", group: "客户联系", tableColumns: ["对象", "联系人", "方式", "日期", "跟进人"] },
      { key: "modal", label: "弹窗", title: "新增关系", kind: "modal", group: "客户联系" },
    ],
  },
  {
    key: "docs",
    label: "文档中心",
    summary: "员工手册、操作指南和规章制度",
    overviewLabel: "Docs/文档中心",
    entryRoutes: ["docs"],
    pages: [
      { key: "handbook", label: "员工手册", title: "员工手册", kind: "document", group: "文档阅读", routes: ["docs"] },
      { key: "guide", label: "操作指南", title: "操作指南", kind: "document", group: "文档阅读", routes: ["docs"] },
      { key: "api-guide", label: "API 指南", title: "API 指南", kind: "document", group: "文档阅读", routes: ["docs/api-guide", "api-guide"] },
      { key: "company", label: "公司文档", title: "公司文档", kind: "document", group: "文档阅读", routes: ["docs/company"] },
      { key: "expense", label: "费用制度", title: "费用制度", kind: "document", group: "文档阅读", routes: ["docs/expense"] },
      { key: "positions", label: "岗位文档", title: "岗位文档", kind: "table", group: "岗位制度", routes: ["docs/positions"], tableColumns: ["岗位", "部门", "版本", "状态", "更新时间"] },
      { key: "gmp-list", label: "GMP 列表", title: "GMP 岗位", kind: "table", group: "岗位制度", routes: ["docs/positions/GMP"], tableColumns: ["岗位编码", "岗位名称", "分类", "版本", "状态"] },
      { key: "gmp-detail", label: "GMP 详情", title: "岗位详情", kind: "document", group: "岗位制度", routes: ["docs/positions/GMP/[code]"] },
      { key: "policy", label: "规章制度", title: "规章制度", kind: "table", group: "岗位制度", tableColumns: ["制度名称", "分类", "发布人", "版本", "状态"] },
      { key: "drafts", label: "草稿", title: "文档草稿", kind: "table", group: "预览发布", tableColumns: ["文档", "分类", "编辑人", "更新时间", "状态"] },
      { key: "preview", label: "预览", title: "文档预览", kind: "document", group: "预览发布" },
      { key: "modal", label: "弹窗", title: "发布文档", kind: "modal", group: "预览发布" },
    ],
  },
  {
    key: "library",
    label: "资料库",
    summary: "目录、文件列表、详情、上传和预览",
    overviewLabel: "Library/资料库",
    entryRoutes: ["library"],
    pages: [
      { key: "catalog", label: "目录", title: "资料目录", kind: "split", group: "资料浏览", routes: ["library"], listItems: ["01 公司基本情况", "02 生产资料", "03 财务资料", "04 合同资料"], fields: ["目录名称", "层级", "文件数", "负责人", "保密等级", "状态"] },
      { key: "files", label: "现用文件", title: "资料文件", kind: "table", group: "资料浏览", routes: ["library"], tableColumns: ["文件名", "简介", "保密等级", "标签", "更新时间", "状态"] },
      { key: "files-missing", label: "缺失文件", title: "缺失资料", kind: "table", group: "资料浏览", tableColumns: ["资料项", "目录", "负责人", "截止日", "状态"] },
      { key: "detail", label: "文件详情", title: "文件详情", kind: "document", group: "资料浏览" },
      { key: "upload", label: "上传", title: "上传资料", kind: "upload", group: "上传预览", fields: ["资料类型", "目录", "保密等级", "标签", "负责人", "状态"] },
      { key: "preview", label: "预览", title: "资料预览", kind: "document", group: "上传预览" },
    ],
  },
];

export function getPreviewPages(module: ModuleTemplate) {
  return module.pages;
}

export function getPageGroups(module: ModuleTemplate): PageGroup[] {
  const groups: PageGroup[] = [];
  for (const page of getPreviewPages(module)) {
    const label = page.group ?? page.label;
    const key = label;
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.pages.push(page);
    else groups.push({ key, label, pages: [page] });
  }
  return groups;
}

export function getPageGroupTabs(module: ModuleTemplate): AccordionTabItem[] {
  return [
    { key: OVERVIEW_TAB_KEY, label: module.overviewLabel },
    ...getPageGroups(module).map((group) => ({
      key: group.key,
      label: group.label,
      children: group.pages.map((page) => ({ key: page.key, label: page.label })),
    })),
  ];
}

export const pageStyleTabs: AccordionTabItem[] = moduleTemplates.map((module) => ({
  key: module.key,
  label: module.label,
}));
