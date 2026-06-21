import {
  getModuleSections,
  getPageGroups,
  getPageGroupTabs,
  getPreviewPages,
  getTemplateRoutes,
  isRecordRoute,
  validateTemplateHierarchy,
  type EmbeddedKind,
  type EmbeddedTemplate,
  type ModuleTemplate,
  type PageGroup,
  type PageStyleRouteChild,
  type PageStyleRouteModule,
  type PageTemplate,
  type TemplateKind,
} from "@workspace/core/ui/page-style-preview/template-data";
import { activeModuleDefinitions } from "../../effective-module-registry";
import { applyRouteRuntimeLabel, getRouteRuntimeMeta, type RouteRuntimeMeta } from "../../route-runtime-labels";

export {
  getModuleSections,
  getPageGroups,
  getPageGroupTabs,
  getPreviewPages,
  getTemplateRoutes,
  isRecordRoute,
  validateTemplateHierarchy,
  type EmbeddedKind,
  type EmbeddedTemplate,
  type ModuleTemplate,
  type PageGroup,
  type PageStyleRouteChild,
  type PageStyleRouteModule,
  type PageTemplate,
  type TemplateKind,
};

const baseModuleTemplates: ModuleTemplate[] = [
  {
    key: "finance",
    label: "财务管理",
    summary: "总账、凭证、报表、预算、成本、导入和分析",
    overviewLabel: "财务管理",
    entryRoutes: ["/finance"],
    pages: [
      { key: "ledger", label: "科目余额", title: "科目余额与凭证明细", kind: "table", section: "总账会计", group: "账表数据", routes: ["/finance/ledger"], tableColumns: ["科目编码", "科目名称", "方向", "期初", "借方", "贷方", "期末"] },
      { key: "voucher", label: "凭证明细", title: "凭证明细", kind: "table", section: "总账会计", group: "账表数据", routes: ["/finance/ledger"], tableColumns: ["凭证号", "摘要", "科目", "借方", "贷方", "制单人", "状态"] },
      { key: "reclass-rules", label: "规则配置", title: "重分类规则", kind: "split", section: "总账会计", group: "重分类模式", routes: ["/finance/ledger"], tableColumns: ["规则", "来源科目", "目标项目", "条件", "状态"] },
      { key: "reclass-review", label: "结果审核", title: "重分类审核", kind: "table", section: "总账会计", group: "重分类模式", routes: ["/finance/ledger"], tableColumns: ["期间", "来源科目", "目标项目", "金额", "差异", "状态"] },
      { key: "statements", label: "报表数据", title: "报表数据", kind: "table", section: "财务报表", group: "报表数据", routes: ["/finance/statements"], tableColumns: ["项目", "本期", "上期", "差额", "状态"] },
      { key: "statement-config", label: "报表配置", title: "报表项目配置", kind: "split", section: "财务报表", group: "报表治理", routes: ["/finance/statement-config"], fields: ["项目编码", "项目名称", "报表类型", "取数口径", "方向", "排序"] },
      { key: "statement-review", label: "报表审核", title: "报表审核", kind: "table", section: "财务报表", group: "报表治理", routes: ["/finance/statement-review"], tableColumns: ["报表", "期间", "提交人", "差异数", "状态", "更新时间"] },
      { key: "budget", label: "预算执行", title: "预算执行", kind: "analysis", section: "预算管理", group: "预算管理", routes: ["/finance/budget"] },
      { key: "analysis", label: "经营分析", title: "财务分析", kind: "analysis", section: "管理会计", group: "经营分析", routes: ["/finance/analysis"] },
      { key: "cost", label: "成本结构", title: "成本结构", kind: "analysis", section: "成本管理", group: "成本管理", routes: ["/finance/cost"] },
      { key: "tax", label: "税务记录", title: "税务记录", kind: "table", section: "税务管理", group: "税务管理", routes: ["/finance/tax"], tableColumns: ["税种", "期间", "金额", "申报状态", "更新时间"] },
      { key: "treasury", label: "资金台账", title: "资金台账", kind: "table", section: "司库管理", group: "司库管理", routes: ["/finance/treasury"], tableColumns: ["账户", "币种", "余额", "用途", "更新时间"] },
      { key: "import", label: "导入处理", title: "财务导入", kind: "upload", section: "数据导入与治理", group: "导入处理", routes: ["/finance/import"], fields: ["导入类型", "公司", "期间", "来源", "负责人", "状态"] },
    ],
  },
  {
    key: "production",
    label: "生产管理",
    summary: "批次检验、检验模板、库存和填写",
    overviewLabel: "生产管理",
    entryRoutes: ["/production"],
    pages: [
      { key: "batches", label: "批次列表", title: "批次检验记录", kind: "table", section: "批次检验", group: "检验记录", routes: ["/production/qc-batches"], tableColumns: ["批号", "产品", "规格", "阶段", "负责人", "状态"], embedded: { title: "检验记录", kind: "production", paperMode: "record", previewAction: true, routes: ["/production/qc-batches/[batchId]", "/production/qc-batches/[batchId]/[stageKey]", "/production/qc-batches/[batchId]/[stageKey]/[testName]"] } },
      { key: "templates", label: "模板结构", title: "检验模板", kind: "production", paperMode: "template", section: "检验模板", group: "模板维护", routes: ["/production/qc-templates"], toolbar: false, footer: false },
      { key: "template-feedback", label: "反馈", title: "模板反馈", kind: "table", section: "检验模板", group: "模板反馈", routes: ["/production/qc-templates"], tableColumns: ["位置", "问题", "反馈人", "状态", "处理人", "更新时间"] },
    ],
  },
  {
    key: "hr",
    label: "人事管理",
    summary: "花名册、组织架构、岗位任职、绩效和人力分析",
    overviewLabel: "人事基础资料",
    entryRoutes: ["/hr"],
    pages: [
      { key: "employee", label: "在职", title: "在职员工", kind: "table", section: "人事基础资料", group: "员工资料", routes: ["/hr/roster"], tableColumns: ["员工编号", "姓名", "部门", "岗位", "状态", "入职日期"], embedded: { title: "员工详情", kind: "form", previewAction: true, fields: ["员工编号", "姓名", "别名", "性别", "出生年月", "农历生日", "民族", "籍贯", "政治面貌", "学历", "职称", "毕业院校", "电话", "身份证号", "参加工作时间"], routes: ["/hr/roster/employees/[id]"] } },
      { key: "employee-inactive", label: "离职", title: "离职员工", kind: "table", section: "人事基础资料", group: "员工资料", routes: ["/hr/roster"], tableColumns: ["员工编号", "姓名", "离职日期", "原部门", "原岗位", "状态"] },
      { key: "organization", label: "组织树", title: "组织架构", kind: "split", section: "人事基础资料", group: "组织架构", routes: ["/hr/roster"], listItems: ["轮执委员会", "董秘办及资本证券", "职能事业部平台", "行政人事部"], fields: ["部门编码", "部门名称", "负责人", "层级", "直属部门", "直属岗位"] },
      { key: "department-position", label: "现用", title: "部门岗位架构", kind: "split", section: "人事基础资料", group: "部门岗位", routes: ["/hr/roster"], fields: ["部门编码", "部门名称", "别名", "部门负责人", "层级", "状态", "直属岗位", "总岗位"] },
      { key: "department-archived", label: "归档", title: "归档部门岗位", kind: "split", section: "人事基础资料", group: "部门岗位", routes: ["/hr/roster"], fields: ["部门编码", "部门名称", "归档日期", "归档原因", "原负责人", "状态"] },
      { key: "bulk", label: "员工信息", title: "员工信息表", kind: "table", section: "人事基础资料", group: "员工信息表", routes: ["/hr/roster"], tableColumns: ["员工编号", "姓名", "性别", "民族", "学历", "电话", "关联账号"] },
      { key: "employment", label: "雇佣关系", title: "雇佣关系", kind: "table", section: "人事基础资料", group: "员工信息表", routes: ["/hr/roster"], tableColumns: ["员工", "在职", "人员类型", "职级", "职务", "入职日期", "办公地点"] },
      { key: "contracts", label: "合同", title: "合同", kind: "table", section: "人事基础资料", group: "员工信息表", routes: ["/hr/roster"], tableColumns: ["员工编号", "姓名", "公司", "主合同", "参保状态", "终止日期"] },
      { key: "edp", label: "部门岗位", title: "部门岗位信息表", kind: "table", section: "人事基础资料", group: "员工信息表", routes: ["/hr/roster"], tableColumns: ["员工", "部门", "岗位", "主岗", "开始日期", "结束日期", "工作占比"] },
      { key: "assignment", label: "现任", title: "岗位任职", kind: "form", section: "考勤绩效", group: "任职绩效", routes: ["/hr/performance"], fields: ["部门", "岗位", "主岗", "工作占比", "直接上级", "开始日期", "结束日期", "任职状态", "备注"] },
      { key: "assignment-history", label: "历史任职", title: "历史任职", kind: "table", section: "考勤绩效", group: "任职绩效", routes: ["/hr/performance"], tableColumns: ["部门", "岗位", "开始日期", "结束日期", "主岗", "状态"] },
      { key: "performance", label: "绩效", title: "绩效记录", kind: "table", section: "考勤绩效", group: "绩效考勤", routes: ["/hr/performance"], tableColumns: ["员工", "周期", "评分", "等级", "确认人", "状态"] },
      { key: "analytics", label: "分析总览", title: "人力分析", kind: "analysis", section: "人力分析", group: "分析视图", routes: ["/hr/analytics"] },
      { key: "employee-analytics", label: "员工结构", title: "员工结构", kind: "analysis", section: "人力分析", group: "分析视图", routes: ["/hr/analytics"] },
      { key: "department-analytics", label: "部门架构", title: "部门架构分析", kind: "analysis", section: "人力分析", group: "分析视图", routes: ["/hr/analytics"] },
      { key: "position-analytics", label: "岗位分析", title: "岗位分析", kind: "analysis", section: "人力分析", group: "分析视图", routes: ["/hr/analytics"] },
      { key: "turnover-analytics", label: "人员流动", title: "人员流动", kind: "analysis", section: "人力分析", group: "分析视图", routes: ["/hr/analytics"] },
    ],
  },
  {
    key: "work",
    label: "工作管理",
    summary: "项目、清单、汇报和历史记录",
    overviewLabel: "工作管理",
    entryRoutes: ["/work"],
    pages: [
      { key: "projects", label: "现用", title: "项目列表", kind: "split", section: "项目", group: "项目台账", routes: ["/work/projects"], fields: ["项目编码", "项目名称", "主导部门", "负责人", "预算金额", "风险等级"], embedded: { title: "项目详情", kind: "form", fields: ["项目编码", "项目名称", "主导部门", "负责人", "预算金额", "开始日期", "结束日期", "状态", "备注"], routes: ["/work/projects/[id]"] } },
      { key: "projects-archived", label: "归档", title: "归档项目", kind: "table", section: "项目", group: "项目台账", routes: ["/work/projects"], tableColumns: ["项目编码", "项目名称", "归档日期", "主导部门", "负责人", "状态"] },
      { key: "works", label: "待办", title: "待办任务", kind: "table", section: "工作清单", group: "任务台账", routes: ["/work/tasks"], tableColumns: ["任务", "负责人", "项目", "优先级", "截止日", "状态"] },
      { key: "works-done", label: "已完成", title: "已完成任务", kind: "table", section: "工作清单", group: "任务台账", routes: ["/work/tasks"], tableColumns: ["任务", "负责人", "项目", "完成日期", "确认人", "状态"] },
      { key: "reports", label: "周报", title: "周报记录", kind: "table", section: "工作汇报", group: "汇报台账", routes: ["/work/reports"], tableColumns: ["周期", "填报人", "项目", "完成率", "风险", "状态"] },
      { key: "reports-month", label: "月报", title: "月报记录", kind: "table", section: "工作汇报", group: "汇报台账", routes: ["/work/reports"], tableColumns: ["月份", "填报人", "项目", "完成率", "风险", "状态"] },
      { key: "history", label: "历史记录", title: "变更历史", kind: "table", section: "历史记录", group: "操作历史", routes: ["/work/history"], tableColumns: ["对象", "动作", "操作人", "时间", "摘要"] },
    ],
  },
  {
    key: "administration",
    label: "行政管理",
    summary: "合同台账、办公事务和证照归档",
    overviewLabel: "行政管理",
    entryRoutes: ["/administration"],
    pages: [
      { key: "contracts", label: "现用", title: "合同列表", kind: "table", section: "合同台账", group: "合同台账", routes: ["/administration/contracts"], tableColumns: ["合同编号", "合同名称", "相对方", "金额", "到期日", "状态"], embedded: { title: "合同详情", kind: "form", fields: ["合同编号", "合同名称", "相对方", "合同金额", "签署日期", "到期日期", "负责人", "状态", "备注"], routes: ["/administration/contracts/[id]"] } },
      { key: "contracts-expiring", label: "到期", title: "即将到期合同", kind: "table", section: "合同台账", group: "合同台账", routes: ["/administration/contracts"], tableColumns: ["合同编号", "合同名称", "到期日", "负责人", "续签状态", "风险"] },
      { key: "contracts-archived", label: "归档", title: "归档合同", kind: "table", section: "合同台账", group: "合同台账", routes: ["/administration/contracts"], tableColumns: ["合同编号", "合同名称", "归档日期", "相对方", "负责人", "状态"] },
      { key: "office", label: "办公事务", title: "办公事项", kind: "table", section: "办公事务", group: "办公事项", routes: ["/administration"], tableColumns: ["事项", "负责人", "类型", "截止日", "状态"] },
      { key: "archive", label: "归档", title: "归档资料", kind: "document", section: "归档资料", group: "归档资料", routes: ["/administration"] },
    ],
  },
  {
    key: "external",
    label: "外部关系",
    summary: "客户、投资人、供应商和联系记录",
    overviewLabel: "外部关系",
    entryRoutes: ["/external"],
    pages: [
      { key: "investors", label: "投资人", title: "投资人列表", kind: "table", section: "投资人关系", group: "投资人", routes: ["/external/investors"], tableColumns: ["投资人", "类型", "联系人", "轮次", "状态"] },
      { key: "customers", label: "客户", title: "客户列表", kind: "split", section: "客户管理", group: "客户联系", routes: ["/external/customers"], fields: ["客户编号", "客户名称", "行业", "联系人", "电话", "状态"] },
      { key: "customers-archive", label: "归档客户", title: "归档客户", kind: "table", section: "客户管理", group: "客户联系", routes: ["/external/customers"], tableColumns: ["客户编号", "客户名称", "归档日期", "原负责人", "原因", "状态"] },
      { key: "contacts", label: "联系记录", title: "联系记录", kind: "table", section: "客户管理", group: "客户联系", routes: ["/external/customers"], tableColumns: ["对象", "联系人", "方式", "日期", "跟进人"] },
      { key: "suppliers", label: "供应商", title: "供应商列表", kind: "table", section: "供应商管理", group: "供应商", routes: ["/external/suppliers"], tableColumns: ["供应商", "类型", "联系人", "评级", "状态"] },
    ],
  },
  {
    key: "docs",
    label: "文档中心",
    summary: "员工手册、操作指南和规章制度",
    overviewLabel: "文档中心",
    entryRoutes: ["/docs"],
    pages: [
      { key: "positions", label: "岗位文档", title: "岗位文档", kind: "table", section: "岗位说明书", group: "岗位制度", routes: ["/docs/positions"], tableColumns: ["岗位", "部门", "版本", "状态", "更新时间"] },
      { key: "gmp-list", label: "GMP 列表", title: "GMP 岗位", kind: "table", section: "岗位说明书", group: "岗位制度", routes: ["/docs/positions/GMP"], tableColumns: ["岗位编码", "岗位名称", "分类", "版本", "状态"], embedded: { title: "岗位详情", kind: "document", routes: ["/docs/positions/GMP/[code]"] } },
      { key: "company", label: "公司文档", title: "公司文档", kind: "document", section: "公司管理", group: "文档阅读", routes: ["/docs/company"] },
      { key: "handbook", label: "员工手册", title: "员工手册", kind: "document", section: "公司管理", group: "文档阅读", routes: ["/docs"] },
      { key: "guide", label: "操作指南", title: "操作指南", kind: "document", section: "公司管理", group: "文档阅读", routes: ["/docs"] },
      { key: "expense", label: "费用制度", title: "费用制度", kind: "document", section: "报销规范", group: "文档阅读", routes: ["/docs/expense"] },
      { key: "api-guide", label: "API 指南", title: "API 指南", kind: "document", section: "接入指南", group: "文档阅读", routes: ["/docs/api-guide"] },
      { key: "policy", label: "规章制度", title: "规章制度", kind: "table", section: "公司管理", group: "发布流程", routes: ["/docs/company"], tableColumns: ["制度名称", "分类", "发布人", "版本", "状态"] },
      { key: "drafts", label: "草稿", title: "文档草稿", kind: "table", section: "公司管理", group: "发布流程", routes: ["/docs/company"], tableColumns: ["文档", "分类", "编辑人", "更新时间", "状态"] },
    ],
  },
  {
    key: "library",
    label: "资料库",
    summary: "目录、文件列表、详情和上传",
    overviewLabel: "资料库",
    entryRoutes: ["/library/basic-info"],
    pages: [
      { key: "catalog", label: "目录", title: "资料目录", kind: "split", section: "资料管理", group: "资料浏览", routes: ["/library/basic-info"], listItems: ["01 公司基本情况", "02 生产资料", "03 财务资料", "04 合同资料"], fields: ["目录名称", "层级", "文件数", "负责人", "保密等级", "状态"] },
      { key: "files", label: "现用文件", title: "资料文件", kind: "table", section: "资料管理", group: "资料浏览", routes: ["/library/basic-info"], tableColumns: ["文件名", "简介", "保密等级", "标签", "更新时间", "状态"], embedded: { title: "文件详情", kind: "document", routes: ["/library/basic-info/files/[id]"] } },
      { key: "files-missing", label: "缺失文件", title: "缺失资料", kind: "table", section: "资料管理", group: "资料浏览", routes: ["/library/basic-info"], tableColumns: ["资料项", "目录", "负责人", "截止日", "状态"] },
      { key: "upload", label: "上传", title: "上传资料", kind: "upload", section: "资料管理", group: "上传处理", routes: ["/library/basic-info"], fields: ["资料类型", "目录", "保密等级", "标签", "负责人", "状态"], previewAction: true },
    ],
  },
];

function getRuntimeRouteMeta(route: string): RouteRuntimeMeta | null {
  return getRouteRuntimeMeta(route, activeModuleDefinitions, {
    normalizeRecordRoute: isRecordRoute(route),
    respectVisibility: false,
  });
}

function isTemplateRouteVisible(route: string) {
  return Boolean(getRuntimeRouteMeta(route));
}

function hasVisibleRoute(routes: string[] | undefined) {
  return !routes || routes.some(isTemplateRouteVisible);
}

function applyRouteLabel(value: string | undefined, meta: RouteRuntimeMeta) {
  return value ? applyRouteRuntimeLabel(value, meta) : value;
}

function applyRuntimePageLabels(page: PageTemplate): PageTemplate {
  const meta = page.routes?.map(getRuntimeRouteMeta).find((item): item is RouteRuntimeMeta => Boolean(item));
  if (!meta) return page;

  return {
    ...page,
    title: applyRouteLabel(page.title, meta) ?? page.title,
    section: applyRouteLabel(page.section, meta),
    group: applyRouteLabel(page.group, meta),
    embedded: page.embedded
      ? {
          ...page.embedded,
          title: applyRouteLabel(page.embedded.title, meta) ?? page.embedded.title,
        }
      : page.embedded,
  };
}

function applyRuntimeModuleTemplate(module: ModuleTemplate): ModuleTemplate | null {
  const runtimeModule = activeModuleDefinitions.find((definition) => definition.moduleDef?.key === module.key)?.moduleDef;
  if (!runtimeModule) return null;

  const pages = module.pages
    .filter((page) => hasVisibleRoute(page.routes) && hasVisibleRoute(page.embedded?.routes))
    .map(applyRuntimePageLabels);

  if (pages.length === 0) return null;
  return {
    ...module,
    label: runtimeModule.label,
    summary: runtimeModule.desc,
    overviewLabel: runtimeModule.label,
    pages,
  };
}

export const moduleTemplates: ModuleTemplate[] = baseModuleTemplates
  .map(applyRuntimeModuleTemplate)
  .filter((module): module is ModuleTemplate => Boolean(module));

export const pageStyleTabs = moduleTemplates.map((module) => ({
  key: module.key,
  label: module.label,
  children: getModuleSections(module),
}));
