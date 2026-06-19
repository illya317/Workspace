import type { WorkspacePackageRegistration } from "@workspace/core";

export const registeredModuleDefinitions = [
  {
    packageName: "@workspace/work",
    layer: "domain",
    moduleDef: {
      key: "work",
      label: "工作管理",
      desc: "工作计划、清单、汇报和历史记录",
      href: "/work",
      iconKey: "reports",
      color: "emerald",
      resourceKey: "work",
      children: [
        { key: "plans", label: "工作计划", desc: "计划信息、角色分工、预算和风险", href: "/work/plans", resourceKey: "work.plan" },
        { key: "tasks", label: "工作清单", desc: "待办任务和执行跟踪", href: "/works", resourceKey: "work.task" },
        { key: "reports", label: "工作汇报", desc: "周报、月报、季报、年报", href: "/reports", resourceKey: "work.report" },
        { key: "history", label: "历史记录", desc: "变更和操作记录", href: "/history", resourceKey: "work.history" },
      ],
    },
    resourceDefs: [
      { key: "work", name: "工作管理", sortOrder: 0 },
      { key: "work.plan", name: "工作计划", parentKey: "work", sortOrder: 0 },
      { key: "work.task", name: "工作清单", parentKey: "work", sortOrder: 1 },
      { key: "work.report", name: "工作汇报", parentKey: "work", sortOrder: 2 },
      { key: "work.history", name: "历史记录", parentKey: "work", sortOrder: 3 },
    ],
    routes: ["/work", "/work/plans", "/works", "/reports", "/history"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/work", resourceKey: "work.plan", action: "access" },
      { method: "POST", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
      { method: "PUT", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
      { method: "PATCH", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
      { method: "DELETE", pathPrefix: "/api/work", resourceKey: "work.plan", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/hr",
    layer: "domain",
    moduleDef: {
      key: "hr",
      label: "人事管理",
      desc: "花名册、考勤、绩效、人力分析",
      href: "/hr",
      iconKey: "hr",
      color: "blue",
      resourceKey: "people",
      children: [
        { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP", href: "/hr/roster", resourceKey: "people.roster" },
        { key: "performance", label: "考勤绩效", desc: "考勤记录、工作查看、绩效评估", href: "/hr/performance", resourceKey: "people.performance" },
        { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", resourceKey: "people.analytics" },
      ],
    },
    resourceDefs: [
      { key: "people", name: "人事管理", sortOrder: 1 },
      { key: "people.roster", name: "人事基础资料", parentKey: "people", sortOrder: 0 },
      { key: "people.performance", name: "考勤绩效", parentKey: "people", sortOrder: 1 },
      { key: "people.analytics", name: "人力分析", parentKey: "people", sortOrder: 2 },
    ],
    routes: ["/hr", "/hr/roster", "/hr/performance", "/hr/analytics"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "access" },
      { method: "POST", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
      { method: "PUT", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
      { method: "PATCH", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
      { method: "DELETE", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/administration",
    layer: "domain",
    moduleDef: {
      key: "administration",
      label: "行政管理",
      desc: "合同台账、办公事务",
      href: "/administration",
      iconKey: "admin",
      color: "indigo",
      resourceKey: "administration",
      children: [
        {
          key: "contracts",
          label: "合同台账",
          desc: "合同录入、查询、到期预警",
          href: "/contracts",
          resourceKey: "administration.contract",
        },
      ],
    },
    resourceDefs: [
      { key: "administration", name: "行政管理", sortOrder: 2 },
      { key: "administration.contract", name: "合同台账", parentKey: "administration", sortOrder: 0 },
    ],
    routes: ["/administration", "/contracts"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "access" },
      { method: "POST", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "write" },
      { method: "PATCH", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "write" },
      { method: "DELETE", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/finance",
    layer: "domain",
    moduleDef: {
      key: "finance",
      label: "财务管理",
      desc: "总账、凭证、财务报表、预算、分析",
      href: "/finance",
      iconKey: "finance",
      color: "amber",
      resourceKey: "finance",
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
    resourceDefs: [
      { key: "finance", name: "财务管理", sortOrder: 3 },
      { key: "finance.ledger", name: "总账基础", parentKey: "finance", sortOrder: 0 },
      { key: "finance.statement", name: "财务报表", parentKey: "finance", sortOrder: 1 },
      { key: "finance.budget", name: "预算管理", parentKey: "finance", sortOrder: 2 },
      { key: "finance.analysis", name: "财务分析", parentKey: "finance", sortOrder: 3 },
      { key: "finance.cost", name: "成本管理", parentKey: "finance", sortOrder: 4 },
      { key: "finance.tax", name: "税务管理", parentKey: "finance", sortOrder: 5 },
      { key: "finance.treasury", name: "司库管理", parentKey: "finance", sortOrder: 6 },
      { key: "finance.import", name: "数据导入", parentKey: "finance", sortOrder: 7 },
      { key: "finance.schedules", name: "附注明细", parentKey: "finance", sortOrder: 8 },
    ],
    routes: ["/finance"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/finance", resourceKey: "finance", action: "access" },
      { method: "POST", pathPrefix: "/api/finance", resourceKey: "finance", action: "write" },
      { method: "PUT", pathPrefix: "/api/finance", resourceKey: "finance", action: "write" },
      { method: "PATCH", pathPrefix: "/api/finance", resourceKey: "finance", action: "write" },
      { method: "DELETE", pathPrefix: "/api/finance", resourceKey: "finance", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/production",
    layer: "domain",
    moduleDef: {
      key: "production",
      label: "生产管理",
      desc: "批次检验、检验模板",
      href: "/production",
      iconKey: "production",
      color: "cyan",
      resourceKey: "production",
      children: [
        { key: "qcBatches", label: "批次检验", desc: "批次创建、检验记录填写、提交复核", href: "/production/qc/batches", resourceKey: "production.qc.batches" },
        { key: "qcTemplates", label: "检验模板", desc: "模板结构浏览、版式预览、反馈收集", href: "/production/qc/templates", resourceKey: "production.qc.templates" },
      ],
    },
    resourceDefs: [
      { key: "production", name: "生产管理", sortOrder: 4 },
      { key: "production.inventory", name: "生产库存", parentKey: "production", sortOrder: 99 },
      { key: "production.qc", name: "质量检验", parentKey: "production", sortOrder: 0 },
      { key: "production.qc.batches", name: "批次检验", parentKey: "production.qc", sortOrder: 0 },
      { key: "production.qc.templates", name: "检验模板", parentKey: "production.qc", sortOrder: 1 },
    ],
    routes: ["/production", "/production/qc/batches", "/production/qc/templates"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/production", resourceKey: "production", action: "access" },
      { method: "POST", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
      { method: "PUT", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
      { method: "PATCH", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
      { method: "DELETE", pathPrefix: "/api/production", resourceKey: "production", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/platform:external",
    layer: "platform",
    moduleDef: {
      key: "external",
      label: "外部关系",
      desc: "客户、投资人、供应商",
      href: "/external",
      iconKey: "customers",
      color: "orange",
      resourceKey: "external",
      lifecycleStatus: "workspace-analysis",
      children: [
        { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/external/investors", resourceKey: "external.investor", lifecycleStatus: "workspace-owned" },
        { key: "customers", label: "客户管理", desc: "客户信息、跟进记录", href: "/external/customers", resourceKey: "external.customer", lifecycleStatus: "workspace-analysis" },
        { key: "suppliers", label: "供应商管理", desc: "供应商信息、采购记录", href: "/external/suppliers", resourceKey: "external.supplier", lifecycleStatus: "workspace-analysis" },
      ],
    },
    resourceDefs: [
      { key: "external", name: "外部关系", maxRoleKey: "delete", sortOrder: 5 },
      { key: "external.investor", name: "投资人关系", parentKey: "external", maxRoleKey: "delete", sortOrder: 0 },
      { key: "external.customer", name: "客户管理", parentKey: "external", maxRoleKey: "delete", sortOrder: 1 },
      { key: "external.supplier", name: "供应商管理", parentKey: "external", maxRoleKey: "delete", sortOrder: 2 },
    ],
  },
  {
    packageName: "@workspace/platform:docs",
    layer: "platform",
    moduleDef: {
      key: "docs",
      label: "文档中心",
      desc: "员工手册、操作指南、规章制度",
      href: "/docs",
      iconKey: "docs",
      color: "purple",
      resourceKey: "docs",
      children: [
        { key: "positions", label: "岗位说明书", desc: "GMP 岗位说明书", href: "/docs/positions/GMP", resourceKey: "docs.positions" },
        { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", resourceKey: "docs.company" },
        { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", resourceKey: "docs.expense" },
        { key: "api-guide", label: "接入指南", desc: "API 接入文档与示例", href: "/docs/api-guide", resourceKey: "system.api" },
      ],
    },
    resourceDefs: [
      { key: "docs", name: "文档中心", maxRoleKey: "access", sortOrder: 6 },
      { key: "docs.positions", name: "岗位说明书", parentKey: "docs", maxRoleKey: "access", sortOrder: 0 },
      { key: "docs.company", name: "公司管理", parentKey: "docs", maxRoleKey: "access", sortOrder: 1 },
      { key: "docs.expense", name: "报销规范", parentKey: "docs", maxRoleKey: "access", sortOrder: 2 },
    ],
  },
  {
    packageName: "@workspace/library",
    layer: "domain",
    moduleDef: {
      key: "library",
      label: "资料库",
      desc: "内部资料存档",
      href: "/library",
      iconKey: "library",
      color: "orange",
      resourceKey: "library",
    },
    resourceDefs: [
      { key: "library", name: "资料库", maxRoleKey: "write", sortOrder: 7 },
      { key: "library.write", name: "资料库编辑", parentKey: "library", maxRoleKey: "admin", sortOrder: 0 },
      { key: "library.secret", name: "保密资料", parentKey: "library", maxRoleKey: "access", sortOrder: 1 },
      { key: "library.top_secret", name: "绝密资料", parentKey: "library", maxRoleKey: "access", sortOrder: 2 },
    ],
    routes: ["/library"],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/library", resourceKey: "library", action: "access" },
      { method: "POST", pathPrefix: "/api/library", resourceKey: "library.write", action: "write" },
      { method: "PATCH", pathPrefix: "/api/library", resourceKey: "library.write", action: "write" },
      { method: "DELETE", pathPrefix: "/api/library", resourceKey: "library.write", action: "delete" },
    ],
  },
  {
    packageName: "@workspace/platform:settings",
    layer: "platform",
    moduleDef: {
      key: "settings",
      label: "设置",
      desc: "个人设置、系统配置",
      href: "/settings",
      iconKey: "settings",
      color: "orange",
    },
  },
  {
    packageName: "@workspace/platform:system",
    layer: "platform",
    resourceDefs: [
      { key: "system", name: "系统管理", sortOrder: 9 },
      { key: "system.audit", name: "审计日志", parentKey: "system", sortOrder: 0 },
      { key: "system.agent", name: "智能体", parentKey: "system", maxRoleKey: "access", sortOrder: 1 },
      { key: "system.api", name: "API接入", parentKey: "system", maxRoleKey: "access", sortOrder: 2 },
    ],
  },
  {
    packageName: "@workspace/platform:legal",
    layer: "platform",
    resourceDefs: [
      { key: "legal", name: "法务", maxRoleKey: "access", sortOrder: 8 },
      { key: "legal.chat", name: "法务咨询", parentKey: "legal", maxRoleKey: "access", sortOrder: 0 },
      { key: "legal.document", name: "法律文书", parentKey: "legal", maxRoleKey: "access", sortOrder: 1 },
    ],
  },
] satisfies WorkspacePackageRegistration[];

export const registeredModules = registeredModuleDefinitions
  .map((definition) => definition.moduleDef?.key)
  .filter((key): key is string => Boolean(key));

function validateModuleRegistry() {
  const seen = new Set<string>();
  for (const moduleKey of registeredModules) {
    if (seen.has(moduleKey)) {
      throw new Error(`DUPLICATE MODULE KEY: ${moduleKey}`);
    }
    seen.add(moduleKey);
  }

  for (const definition of registeredModuleDefinitions) {
    const moduleKey = definition.moduleDef?.key;
    if (moduleKey && !registeredModules.includes(moduleKey)) {
      throw new Error(`MODULE NOT REGISTERED: ${moduleKey}`);
    }
  }
}

validateModuleRegistry();

export const registeredDomainPackageNames = registeredModuleDefinitions
  .filter((definition) => definition.layer === "domain")
  .map((definition) => definition.packageName);

export function getRegisteredModuleDefinition(packageName: string): WorkspacePackageRegistration {
  const definition = registeredModuleDefinitions.find((item) => item.packageName === packageName);
  if (!definition) {
    throw new Error(`Module package is not registered: ${packageName}`);
  }
  return definition;
}
