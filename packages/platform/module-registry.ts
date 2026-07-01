import type { WorkspacePackageRegistration } from "@workspace/core";
import type { FkRegistration } from "./server/fk-targets";
import { apiResourceGuards, apiRoutes, systemApiRoutes, validateModuleRegistry } from "./module-registry-utils";

const WORK_FK_REGISTRATIONS = [
  { key: "work.projects.leadingDepartment", scope: "work", source: { entity: "Project", field: "leadingDepartmentId" }, target: "department", targetLabel: "主导部门", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.parent", scope: "work", source: { entity: "Project", field: "parentProjectId" }, target: "project", targetLabel: "上级项目", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.parentTask", scope: "work", source: { entity: "Project", field: "parentProjectTaskId" }, target: "projectTask", targetLabel: "上级任务", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.member.employee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projects.member.project", scope: "work", source: { entity: "EmployeeProject", field: "projectId" }, target: "project", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projectTasks.project", scope: "work", source: { entity: "ProjectTask", field: "projectId" }, target: "project", nullable: false, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projectTasks.owner.employee", scope: "work", source: { entity: "ProjectTask", field: "ownerEmployeeId" }, target: "employee", targetLabel: "负责人", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projectTasks.planPhase", scope: "work", source: { entity: "ProjectTask", field: "planPhaseId" }, target: "projectPlanPhase", targetLabel: "项目阶段", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projectTasks.source.decision", scope: "work", source: { entity: "ProjectTask", field: "sourceMeetingDecisionId" }, target: "meetingDecision", targetLabel: "来源会议决议", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.projectTasks.source.actionCandidate", scope: "work", source: { entity: "ProjectTask", field: "sourceMeetingActionCandidateId" }, target: "meetingActionCandidate", targetLabel: "来源会议行动候选", nullable: true, permission: { resourceKey: "work.projects", action: "access" } },
  { key: "work.tasks.owner.employee", scope: "work", source: { entity: "WorkItem", field: "ownerEmployeeId" }, target: "employee", targetLabel: "负责人", nullable: true, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.tasks.permission.user", scope: "work", source: { entity: "WorkScopePermission", field: "userId" }, target: "user", targetLabel: "授权用户", nullable: false, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.tasks.linked.project", scope: "work", source: { entity: "WorkItem", field: "linkedProjectId" }, target: "project", targetLabel: "关联项目", nullable: true, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.tasks.source.meeting", scope: "work", source: { entity: "WorkItem", field: "sourceMeetingId" }, target: "meeting", targetLabel: "来源会议", nullable: true, permission: { resourceKey: "work.tasks", action: "access" } },
  { key: "work.meetings.participant.user", scope: "work", source: { entity: "MeetingParticipant", field: "userId" }, target: "user", targetLabel: "参会账号", nullable: false, permission: { resourceKey: "work.meetings", action: "access" } },
] satisfies FkRegistration[];

const HR_FK_REGISTRATIONS = [
  { key: "hr.department", scope: "hr", source: { entity: "Any", field: "departmentId" }, target: "department", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.department.parent", scope: "hr", source: { entity: "Department", field: "parentId" }, target: "department", targetLabel: "上级部门", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.department.manager.position", scope: "hr", source: { entity: "Department", field: "managerPositionId" }, target: "position", targetLabel: "负责人岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.position", scope: "hr", source: { entity: "Any", field: "positionId" }, target: "position", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.employee", scope: "hr", source: { entity: "Any", field: "employeeId" }, target: "employee", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.company", scope: "hr", source: { entity: "Contract", field: "company" }, target: "company", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.companyRelation.parent", scope: "hr", source: { entity: "CompanyRelation", field: "parentId" }, target: "company", targetLabel: "上级公司", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.companyRelation.child", scope: "hr", source: { entity: "CompanyRelation", field: "childId" }, target: "company", targetLabel: "下级公司", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "platform.user", scope: "hr", source: { entity: "Any", field: "userId" }, target: "user", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.positionDescription", scope: "hr", source: { entity: "Position", field: "positionDescriptionId" }, target: "positionDescription", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.edp.position", scope: "hr", source: { entity: "EDP", field: "positionId" }, target: "position", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.edp.reportTo", scope: "hr", source: { entity: "EDP", field: "reportTo", valueKind: "semantic" }, target: "employee", targetLabel: "直接上级", nullable: true, permission: { resourceKey: "hr.roster", action: "access" } },
  { key: "hr.position.department", scope: "hr", source: { entity: "Position", field: "departmentId" }, target: "department", targetLabel: "所属部门", nullable: false, permission: { resourceKey: "hr.roster", action: "access" } },
] satisfies FkRegistration[];

const FINANCE_FK_REGISTRATIONS = [
  { key: "finance.accounts.parent", scope: "finance", source: { entity: "FinanceAccount", field: "parentId" }, target: "financeAccount", targetLabel: "上级科目", nullable: true, permission: { resourceKey: "finance.ledger", action: "access" } },
] satisfies FkRegistration[];

const DOCS_FK_REGISTRATIONS = [
  { key: "docs.editor.permission.user", scope: "docs", source: { entity: "DocumentTemplateSpacePermission", field: "userId" }, target: "user", targetLabel: "授权用户", nullable: false, permission: { resourceKey: "docs.editor", action: "access" } },
] satisfies FkRegistration[];

// 模块台账：声明模块是谁、挂在哪个页面、归属哪个资源，以及暴露哪些 API contract。
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
        { key: "tasks", label: "工作计划", desc: "个人计划、待办任务和执行跟踪", href: "/work/tasks", iconKey: "tasks", color: "emerald", resourceKey: "work.tasks", apiPrefixes: ["/api/modules/work/tasks"] },
        { key: "projects", label: "项目管理", desc: "组织项目、角色分工、预算和风险", href: "/work/projects", iconKey: "projects", color: "emerald", resourceKey: "work.projects", apiPrefixes: ["/api/modules/work/projects"] },
        { key: "meetings", label: "会议管理", desc: "会议、纪要、表决和决议依据", href: "/work/meetings", iconKey: "meetings", color: "emerald", resourceKey: "work.meetings", apiPrefixes: ["/api/modules/work/meetings"] },
      ],
    },
    routes: ["/work", "/work/projects", "/work/tasks", "/work/meetings"],
    fkRegistrations: WORK_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/work/meetings", "work.meetings", ["GET", "POST", "PUT", "DELETE"]),
      { method: "GET", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", action: "access" },
      { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", action: "access" },
      { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", action: "write" },
      { method: "DELETE", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", action: "delete" },
      ...apiResourceGuards("/api/modules/work/tasks", "work.tasks", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks/spaces", "work.tasks", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/tasks/reports", "work.tasks", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/task-spaces", "work.tasks", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/task-reports", "work.tasks", ["GET", "PUT"]),
    ],
    spaceRegistrations: [
      {
        key: "work.tasks",
        label: "任务",
        entryKind: "work-task",
        resourceKey: "work.tasks",
        app: { moduleKey: "work", childKey: "tasks", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/tasks/spaces/:targetType/:targetId/permissions" },
        targetTypes: ["personal", "department", "committee", "company", "project"],
        defaultRoles: { personal: "manager", department: "viewer", committee: "viewer", company: "viewer" },
        naturalManagerSources: {
          personal: ["当前用户本人"],
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁", "董事长"],
          company: ["行政负责人", "董事长"],
        },
        notes: "Personal space defaults to full manager; organization spaces default to natural viewer and can be refined by scoped action grants.",
      },
      {
        key: "work.projects",
        label: "项目",
        entryKind: "work-project",
        resourceKey: "work.projects",
        app: { moduleKey: "work", childKey: "projects", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/projects/spaces/:targetType/:targetId/permissions" },
        targetTypes: ["personal", "department", "committee", "company"],
        defaultRoles: { personal: "manager", department: "viewer", committee: "viewer", company: "viewer" },
        naturalManagerSources: {
          personal: ["当前用户本人"],
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁", "董事长"],
          company: ["行政负责人", "董事长"],
        },
        notes: "Project space permissions use scoped action grants; object services still enforce project-specific ownership rules.",
      },
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
        { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP", href: "/hr/roster", iconKey: "roster", color: "blue", resourceKey: "hr.roster", apiPrefixes: ["/api/modules/hr/roster"] },
        { key: "performance", label: "考勤绩效", desc: "考勤记录、工作查看、绩效评估", href: "/hr/performance", iconKey: "performance", color: "blue", resourceKey: "hr.performance", noApiReason: "当前仅为页面入口，数据复用 roster 服务" },
        { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", iconKey: "analytics", color: "blue", resourceKey: "hr.analytics", noApiReason: "当前分析数据由 roster DTO 派生，暂无独立 API 前缀" },
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
          iconKey: "contracts",
          color: "indigo",
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
        { key: "ledger", label: "总账会计", desc: "科目、凭证、期间、余额、结账、重分类", href: "/finance/ledger", iconKey: "ledger", color: "amber", resourceKey: "finance.ledger", apiPrefixes: ["/api/modules/finance/ledger"] },
        { key: "statementConfig", label: "报表配置", desc: "报表项目配置、科目映射、余额校对", href: "/finance/statement-config", iconKey: "statementConfig", color: "amber", resourceKey: "finance.statementConfig", apiPrefixes: ["/api/modules/finance/statement-config"] },
        { key: "statementReview", label: "报表校对", desc: "利润表、现金流量表底稿校对与签核", href: "/finance/statement-review", iconKey: "statementReview", color: "amber", resourceKey: "finance.statementReview", apiPrefixes: ["/api/modules/finance/statement-review"] },
        { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、取数明细", href: "/finance/statements", iconKey: "statements", color: "amber", resourceKey: "finance.statements", apiPrefixes: ["/api/modules/finance/statements"] },
        { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", iconKey: "analysis", color: "amber", resourceKey: "finance.analysis", apiPrefixes: ["/api/modules/finance/analysis"] },
        { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", iconKey: "budget", color: "amber", resourceKey: "finance.budget", apiPrefixes: ["/api/modules/finance/budget"] },
        { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、车间工分、销售工资", href: "/finance/cost", iconKey: "cost", color: "amber", resourceKey: "finance.cost", apiPrefixes: ["/api/modules/finance/cost"] },
        { key: "tax", label: "税务管理", desc: "销项/进项、税负分析、发票（规划中）", href: "/finance/tax", iconKey: "tax", color: "amber", resourceKey: "finance.tax", noApiReason: "规划中页面，暂无业务 API" },
        { key: "treasury", label: "司库管理", desc: "银行账户、资金日报、收付款、现金流（规划中）", href: "/finance/treasury", iconKey: "treasury", color: "amber", resourceKey: "finance.treasury", noApiReason: "规划中页面，暂无业务 API" },
        { key: "import", label: "数据导入与治理", desc: "科目/凭证/余额/预算/成本导入，校验与异常", href: "/finance/import", iconKey: "import", color: "amber", resourceKey: "finance.import", apiPrefixes: ["/api/modules/finance/import"] },
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
    fkRegistrations: FINANCE_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/finance/ledger", "finance.ledger"),
      ...apiResourceGuards("/api/modules/finance/statement-config", "finance.statementConfig"),
      ...apiResourceGuards("/api/modules/finance/statement-review", "finance.statementReview", ["GET", "POST", "PUT", "PATCH"]),
      ...apiResourceGuards("/api/modules/finance/statements", "finance.statements", ["GET"]),
      ...apiResourceGuards("/api/modules/finance/budget", "finance.budget", ["GET", "POST"]),
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
      desc: "批次检验",
      href: "/production",
      iconKey: "production",
      color: "cyan",
      resourceKey: "production",
      resourceSortOrder: 4,
      children: [
        { key: "qc", label: "批次检验", desc: "批次创建、检验记录填写、提交复核", href: "/production/qc", iconKey: "qc", color: "cyan", resourceKey: "production.qc", apiPrefixes: ["/api/modules/production/qc"] },
      ],
    },
    routes: ["/production", "/production/qc"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/production/qc", "production.qc", ["GET", "POST", "PATCH", "DELETE"]),
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
      resourceMaxRoleKey: "access",
      resourceSortOrder: 5,
      lifecycleStatus: "workspace-analysis",
      children: [
        { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/external/investors", iconKey: "investors", color: "orange", resourceKey: "external.investors", resourceMaxRoleKey: "access", lifecycleStatus: "workspace-owned", noApiReason: "当前仅提供页面入口，暂无独立 API" },
        { key: "customers", label: "客户管理", desc: "客户信息、跟进记录", href: "/external/customers", iconKey: "users", color: "orange", resourceKey: "external.customers", resourceMaxRoleKey: "access", lifecycleStatus: "workspace-analysis", noApiReason: "规划中页面，暂无业务 API" },
        { key: "suppliers", label: "供应商管理", desc: "供应商信息、采购记录", href: "/external/suppliers", iconKey: "suppliers", color: "orange", resourceKey: "external.suppliers", resourceMaxRoleKey: "access", lifecycleStatus: "workspace-analysis", noApiReason: "规划中页面，暂无业务 API" },
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
        { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", iconKey: "company", color: "purple", resourceKey: "docs.company", resourceMaxRoleKey: "access", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", iconKey: "expense", color: "purple", resourceKey: "docs.expense", resourceMaxRoleKey: "access", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "editor", label: "模板编辑器", desc: "模板空间、纸面编辑、字段公式和 DOCX 导出", href: "/docs/editor", iconKey: "docs", color: "purple", resourceKey: "docs.editor", resourceMaxRoleKey: "access", apiPrefixes: ["/api/modules/docs/editor"] },
      ],
    },
    routes: ["/docs", "/docs/company", "/docs/expense", "/docs/editor"],
    fkRegistrations: DOCS_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/docs", "docs", ["GET"]),
      { method: "GET", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", action: "access" },
      { method: "POST", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", action: "access" },
      { method: "PUT", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", action: "access" },
      { method: "PATCH", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", action: "access" },
      { method: "DELETE", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", action: "access" },
    ],
    spaceRegistrations: [
      {
        key: "docs.editor",
        label: "模板",
        entryKind: "docs-editor",
        resourceKey: "docs.editor",
        app: { moduleKey: "docs", childKey: "editor", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/docs/editor/spaces/:docsSpaceId/permissions" },
        targetTypes: ["personal", "department", "committee", "company"],
        defaultRoles: { personal: "manager", department: "viewer", committee: "viewer", company: "viewer" },
        naturalManagerSources: {
          personal: ["当前用户本人"],
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁", "董事长"],
          company: ["行政负责人", "董事长"],
        },
        notes: "Template spaces resolve the concrete docs space id before calling the permission API.",
      },
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
      resourceMaxRoleKey: "write",
      resourceSortOrder: 7,
      children: [
        { key: "basicInfo", label: "基本资料", desc: "资料目录、文件、生成文档和保密等级", href: "/library/basic-info", iconKey: "basicInfo", color: "orange", resourceKey: "library.basicInfo", resourceMaxRoleKey: "write", apiPrefixes: ["/api/modules/library/basic-info"] },
      ],
    },
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
        { key: "account", label: "账号与接入", desc: "账号资料、密码、头像和个人 API 接入", href: "/settings/account", iconKey: "account", color: "blue", resourceKey: "settings.account", resourceMaxRoleKey: "access", apiPrefixes: ["/api/settings/account"] },
        { key: "admin", label: "系统管理", desc: "用户、权限、资源和管理员配置", href: "/settings/admin", iconKey: "shieldCheck", color: "indigo", resourceKey: "settings.admin", apiPrefixes: ["/api/settings/admin"] },
        { key: "api", label: "API 接入", desc: "Open API Client、Scope 授权和调用日志", href: "/settings/api", iconKey: "api", color: "purple", resourceKey: "settings.api", resourceMaxRoleKey: "access", apiPrefixes: ["/api/settings/api"] },
        { key: "ui", label: "UI 组件库", desc: "查看核心 UI 组件注册表", href: "/settings/ui", iconKey: "ui", color: "emerald", resourceKey: "settings.ui", resourceMaxRoleKey: "access", noApiReason: "纯客户端组件浏览页面，无服务端 API" },
      ],
    },
    resourceDefs: [
      { key: "settings.account.apiAccess", name: "个人 API 使用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "settings.account", maxRoleKey: "access", sortOrder: 0 },
      { key: "settings.api.manage", name: "Open API Client 管理", kind: "capability", capabilityOwnerKey: "settings.api", runtimeParentKey: "settings.api", maxRoleKey: "write", sortOrder: 0 },
    ],
    routes: ["/settings", "/settings/account", "/settings/admin", "/settings/api", "/settings/api/hr-generated", "/settings/ui"],
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/settings/version", access: "public" },
      { method: "GET", pathPrefix: "/api/settings/account/api-key", access: "protected", resourceKey: "settings.account.apiAccess", action: "access" },
      { method: "POST", pathPrefix: "/api/settings/account/api-key", access: "protected", resourceKey: "settings.account.apiAccess", action: "access" },
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
      desc: "智能助手 API、能力清单和变更提案",
      href: "/agent",
      iconKey: "settings",
      color: "purple",
      presentation: "headless",
      noPageReason: "页面浮窗已停用，仅保留 API / bot 接入能力",
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
