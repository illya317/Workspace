import type { WorkspacePackageRegistration } from "@workspace/core";

export const moduleDefinition: WorkspacePackageRegistration = {
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
};

export const financePackage = moduleDefinition;
