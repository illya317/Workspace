import type { WorkspacePackageRegistration } from "@workspace/core";
import type { FkRegistration } from "./server/fk-targets";
import { apiResourceGuards, apiRoutes, systemApiRoutes, validateModuleRegistry } from "./module-registry-utils";

const WORK_FK_REGISTRATIONS = [
  { key: "work.projects.leadingDepartment", scope: "work", source: { entity: "Project", field: "leadingDepartmentId" }, target: "department", targetLabel: "主导部门", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.member.employee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.member.project", scope: "work", source: { entity: "EmployeeProject", field: "projectId" }, target: "project", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.tasks.owner.employee", scope: "work", source: { entity: "WorkItem", field: "ownerEmployeeId" }, target: "employee", targetLabel: "负责人", nullable: true, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.tasks.permission.user", scope: "work", source: { entity: "WorkScopePermission", field: "userId" }, target: "user", targetLabel: "授权用户", nullable: false, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.tasks.linked.project", scope: "work", source: { entity: "WorkItem", field: "linkedProjectId" }, target: "project", targetLabel: "关联项目", nullable: true, permission: { resourceKey: "work.tasks", action: "access" } },
] satisfies FkRegistration[];

const HR_FK_REGISTRATIONS = [
  { key: "hr.department", scope: "hr", source: { entity: "Any", field: "departmentId" }, target: "department", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.position", scope: "hr", source: { entity: "Any", field: "positionId" }, target: "position", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.employee", scope: "hr", source: { entity: "Any", field: "employeeId" }, target: "employee", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.company", scope: "hr", source: { entity: "Contract", field: "company" }, target: "company", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "platform.user", scope: "hr", source: { entity: "Any", field: "userId" }, target: "user", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.positionDescription", scope: "hr", source: { entity: "Position", field: "positionDescriptionId" }, target: "positionDescription", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.edp.position", scope: "hr", source: { entity: "EDP", field: "positionId" }, target: "position", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.edp.reportTo", scope: "hr", source: { entity: "EDP", field: "reportTo" }, target: "employee", targetLabel: "直接上级", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.position.department", scope: "hr", source: { entity: "Position", field: "departmentId" }, target: "department", targetLabel: "所属部门", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
] satisfies FkRegistration[];

export const registeredModuleDefinitions = [
  {
    packageName: "@workspace/work",
    layer: "domain",
    moduleDef: {
      key: "work",
      label: "工作管理",
      desc: "计划和项目管理",
      href: "/work",
      iconKey: "reports",
      color: "emerald",
      resourceKey: "work",
      resourceSortOrder: 0,
      children: [
        { key: "tasks", label: "工作计划", desc: "个人计划、待办任务和执行跟踪", href: "/work/tasks", resourceKey: "work.tasks", apiPrefixes: ["/api/modules/work/tasks", "/api/modules/work/task-spaces", "/api/modules/work/task-reports"] },
        { key: "projects", label: "项目管理", desc: "组织项目、角色分工、预算和风险", href: "/work/projects", resourceKey: "work.projects", apiPrefixes: ["/api/modules/work/projects"] },
      ],
    },
    resourceDefs: [
      {
        key: "work.projects.viewAll",
        name: "项目全局查看",
        kind: "capability",
        capabilityOwnerKey: "work.projects",
        runtimeParentKey: "work.projects",
        maxRoleKey: "access",
        sortOrder: 4,
      },
    ],
    routes: ["/work", "/work/projects", "/work/tasks"],
    fkRegistrations: WORK_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/work/projects", "work.projects", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks", "work.tasks", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/task-spaces", "work.tasks", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/task-reports", "work.tasks", ["GET", "PUT"]),
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
      resourceKey: "hr",
      resourceSortOrder: 1,
      children: [
        { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP", href: "/hr/roster", resourceKey: "hr.roster", apiPrefixes: ["/api/modules/hr/roster"] },
        { key: "performance", label: "考勤绩效", desc: "考勤记录、工作查看、绩效评估", href: "/hr/performance", resourceKey: "hr.performance", noApiReason: "当前仅为页面入口，数据复用 roster 服务" },
        { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", resourceKey: "hr.analytics", noApiReason: "当前分析数据由 roster DTO 派生，暂无独立 API 前缀" },
      ],
    },
    resourceDefs: [
      {
        key: "hr.roster.generated",
        name: "花名册生成资料",
        kind: "capability",
        capabilityOwnerKey: "hr.roster",
        runtimeParentKey: "hr.roster",
        maxRoleKey: "write",
        sortOrder: 0,
      },
    ],
    routes: ["/hr", "/hr/roster", "/hr/performance", "/hr/analytics"],
    fkRegistrations: HR_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/hr/roster/generated", "hr.roster.generated", ["GET"]),
      ...apiResourceGuards("/api/modules/hr/roster", "hr.roster"),
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
      resourceSortOrder: 2,
      children: [
        {
          key: "contracts",
          label: "合同台账",
          desc: "合同录入、查询、到期预警",
          href: "/administration/contracts",
          resourceKey: "administration.contracts",
          apiPrefixes: ["/api/modules/administration/contracts"],
        },
      ],
    },
    routes: ["/administration", "/administration/contracts"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/administration/contracts", "administration.contracts", ["GET", "POST", "PATCH", "DELETE"]),
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
      resourceSortOrder: 3,
      children: [
        { key: "ledger", label: "总账会计", desc: "科目、凭证、期间、余额、结账、重分类", href: "/finance/ledger", resourceKey: "finance.ledger", apiPrefixes: ["/api/modules/finance/ledger"] },
        { key: "statementConfig", label: "报表配置", desc: "报表项目配置、科目映射、余额校对", href: "/finance/statement-config", resourceKey: "finance.statementConfig", apiPrefixes: ["/api/modules/finance/statement-config"] },
        { key: "statementReview", label: "报表校对", desc: "利润表、现金流量表底稿校对与签核", href: "/finance/statement-review", resourceKey: "finance.statementReview", apiPrefixes: ["/api/modules/finance/statement-review"] },
        { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、取数明细", href: "/finance/statements", resourceKey: "finance.statements", apiPrefixes: ["/api/modules/finance/statements"] },
        { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", resourceKey: "finance.analysis", apiPrefixes: ["/api/modules/finance/analysis"] },
        { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", resourceKey: "finance.budget", apiPrefixes: ["/api/modules/finance/budget"] },
        { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、车间工分、销售工资", href: "/finance/cost", resourceKey: "finance.cost", apiPrefixes: ["/api/modules/finance/cost"] },
        { key: "tax", label: "税务管理", desc: "销项/进项、税负分析、发票（规划中）", href: "/finance/tax", resourceKey: "finance.tax", noApiReason: "规划中页面，暂无业务 API" },
        { key: "treasury", label: "司库管理", desc: "银行账户、资金日报、收付款、现金流（规划中）", href: "/finance/treasury", resourceKey: "finance.treasury", noApiReason: "规划中页面，暂无业务 API" },
        { key: "import", label: "数据导入与治理", desc: "科目/凭证/余额/预算/成本导入，校验与异常", href: "/finance/import", resourceKey: "finance.import", apiPrefixes: ["/api/modules/finance/import"] },
      ],
    },
    routes: [
      "/finance",
      "/finance/ledger",
      "/finance/statement-config",
      "/finance/statement-review",
      "/finance/statements",
      "/finance/analysis",
      "/finance/budget",
      "/finance/cost",
      "/finance/tax",
      "/finance/treasury",
      "/finance/import",
    ],
    apiGuards: [
      ...apiResourceGuards("/api/modules/finance/ledger", "finance.ledger"),
      ...apiResourceGuards("/api/modules/finance/statement-config", "finance.statementConfig"),
      ...apiResourceGuards("/api/modules/finance/statement-review", "finance.statementReview"),
      ...apiResourceGuards("/api/modules/finance/statements", "finance.statements", ["GET"]),
      ...apiResourceGuards("/api/modules/finance/budget", "finance.budget"),
      ...apiResourceGuards("/api/modules/finance/analysis", "finance.analysis", ["GET"]),
      ...apiResourceGuards("/api/modules/finance/cost", "finance.cost"),
      ...apiResourceGuards("/api/modules/finance/import", "finance.import", ["POST"]),
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
      resourceSortOrder: 4,
      children: [
        { key: "qcBatches", label: "批次检验", desc: "批次创建、检验记录填写、提交复核", href: "/production/qc-batches", resourceKey: "production.qcBatches", apiPrefixes: ["/api/modules/production/qc-batches"] },
        { key: "qcTemplates", label: "检验模板", desc: "模板结构浏览、版式预览、反馈收集", href: "/production/qc-templates", resourceKey: "production.qcTemplates", apiPrefixes: ["/api/modules/production/qc-templates"] },
      ],
    },
    routes: ["/production", "/production/qc-batches", "/production/qc-templates"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/production/qc-batches", "production.qcBatches", ["GET", "POST", "PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/production/qc-templates", "production.qcTemplates", ["GET", "POST", "PATCH"]),
    ],
    apiRoutes: [
      ...apiRoutes("/api/modules/production/qc/cache", "internal", ["POST"]),
    ],
  },
  {
    packageName: "@workspace/external",
    layer: "domain",
    moduleDef: {
      key: "external",
      label: "外部关系",
      desc: "客户、投资人、供应商",
      href: "/external",
      iconKey: "customers",
      color: "orange",
      resourceKey: "external",
      resourceMaxRoleKey: "delete",
      resourceSortOrder: 5,
      lifecycleStatus: "workspace-analysis",
      children: [
        { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/external/investors", resourceKey: "external.investors", resourceMaxRoleKey: "delete", lifecycleStatus: "workspace-owned", noApiReason: "当前仅提供页面入口，暂无独立 API" },
        { key: "customers", label: "客户管理", desc: "客户信息、跟进记录", href: "/external/customers", resourceKey: "external.customers", resourceMaxRoleKey: "delete", lifecycleStatus: "workspace-analysis", noApiReason: "规划中页面，暂无业务 API" },
        { key: "suppliers", label: "供应商管理", desc: "供应商信息、采购记录", href: "/external/suppliers", resourceKey: "external.suppliers", resourceMaxRoleKey: "delete", lifecycleStatus: "workspace-analysis", noApiReason: "规划中页面，暂无业务 API" },
      ],
    },
    routes: ["/external", "/external/investors", "/external/customers", "/external/suppliers"],
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
      resourceMaxRoleKey: "access",
      resourceSortOrder: 6,
      children: [
        { key: "positions", label: "岗位说明书", desc: "GMP 岗位说明书", href: "/docs/positions", resourceKey: "docs.positions", resourceMaxRoleKey: "access", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", resourceKey: "docs.company", resourceMaxRoleKey: "access", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", resourceKey: "docs.expense", resourceMaxRoleKey: "access", noApiReason: "静态文档页面，无独立业务 API" },
      ],
    },
    routes: ["/docs", "/docs/positions", "/docs/positions/GMP", "/docs/company", "/docs/expense"],
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
      resourceMaxRoleKey: "write",
      resourceSortOrder: 7,
      children: [
        { key: "basicInfo", label: "基本资料", desc: "资料目录、文件、生成文档和保密等级", href: "/library/basic-info", resourceKey: "library.basicInfo", resourceMaxRoleKey: "write", apiPrefixes: ["/api/modules/library/basic-info"] },
      ],
    },
    resourceDefs: [
      { key: "library.basicInfo.write", name: "资料库编辑", kind: "capability", capabilityOwnerKey: "library.basicInfo", runtimeParentKey: "library.basicInfo", maxRoleKey: "admin", sortOrder: 0 },
      { key: "library.basicInfo.secret", name: "保密资料", kind: "capability", capabilityOwnerKey: "library.basicInfo", runtimeParentKey: "library.basicInfo", maxRoleKey: "access", sortOrder: 1 },
      { key: "library.basicInfo.topSecret", name: "绝密资料", kind: "capability", capabilityOwnerKey: "library.basicInfo", runtimeParentKey: "library.basicInfo", maxRoleKey: "access", sortOrder: 2 },
    ],
    routes: ["/library", "/library/basic-info"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/library/basic-info", "library.basicInfo"),
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
      resourceKey: "settings",
      resourceMaxRoleKey: "access",
      resourceSortOrder: 100,
      children: [
        { key: "account", label: "账号与接入", desc: "", href: "/settings/account", resourceKey: "settings.account", resourceMaxRoleKey: "access", apiPrefixes: ["/api/settings/account"] },
        { key: "admin", label: "系统管理", desc: "用户、权限、资源和管理员配置", href: "/settings/admin", resourceKey: "settings.admin", apiPrefixes: ["/api/settings/admin"] },
        { key: "api", label: "API 接入", desc: "Open API Client、Scope 授权和调用日志", href: "/settings/api", resourceKey: "settings.api", resourceMaxRoleKey: "access", apiPrefixes: ["/api/settings/api"] },
      ],
    },
    resourceDefs: [
      { key: "settings.account.apiAccess", name: "个人 API 使用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "settings.account", maxRoleKey: "access", sortOrder: 0 },
      { key: "settings.api.manage", name: "Open API Client 管理", kind: "capability", capabilityOwnerKey: "settings.api", runtimeParentKey: "settings.api", maxRoleKey: "write", sortOrder: 0 },
    ],
    routes: ["/settings", "/settings/account", "/settings/admin", "/settings/api", "/settings/api/hr-generated"],
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/settings/account", access: "protected", resourceKey: "settings.account", action: "access" },
      { method: "POST", pathPrefix: "/api/settings/account", access: "protected", resourceKey: "settings.account", action: "access" },
      { method: "PUT", pathPrefix: "/api/settings/account", access: "protected", resourceKey: "settings.account", action: "access" },
      { method: "PATCH", pathPrefix: "/api/settings/account", access: "protected", resourceKey: "settings.account", action: "access" },
      { method: "DELETE", pathPrefix: "/api/settings/account", access: "protected", resourceKey: "settings.account", action: "access" },
    ],
    apiGuards: [
      ...apiResourceGuards("/api/settings/admin", "settings.admin", ["GET", "POST", "PUT", "PATCH", "DELETE"]),
      ...apiResourceGuards("/api/settings/api", "settings.api", ["GET"]),
      ...apiResourceGuards("/api/settings/api/open/clients", "settings.api.manage", ["POST", "PUT"]),
    ],
  },
  {
    packageName: "@workspace/platform:agent",
    layer: "platform",
    moduleDef: {
      key: "agent",
      label: "智能体",
      desc: "智能助手、能力清单和变更提案",
      href: "/agent",
      iconKey: "settings",
      color: "purple",
      presentation: "headless",
      noPageReason: "全局浮窗能力，没有独立页面入口",
      resourceKey: "agent",
      resourceMaxRoleKey: "access",
      resourceSortOrder: 90,
    },
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/agent", access: "protected", resourceKey: "agent", action: "access" },
      { method: "POST", pathPrefix: "/api/agent", access: "protected", resourceKey: "agent", action: "access" },
    ],
  },
  {
    packageName: "@workspace/platform:system",
    layer: "platform",
    apiRoutes: systemApiRoutes(),
  },
] satisfies WorkspacePackageRegistration[];

export const registeredModules = registeredModuleDefinitions
  .map((definition) => definition.moduleDef?.key)
  .filter((key): key is string => Boolean(key));

validateModuleRegistry(registeredModuleDefinitions, registeredModules);

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
