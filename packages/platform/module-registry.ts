import type { WorkspacePackageRegistration } from "@workspace/core";
import type { FkRegistration } from "./server/fk-targets";
import { apiResourceGuards, systemApiRoutes, validateModuleRegistry } from "./module-registry-utils";
import { listWorkflowManagementResourceRegistrations } from "./workflow-management-resources";

const WORK_FK_REGISTRATIONS = [
  { key: "work.projects.leadingDepartment", scope: "work", source: { entity: "Project", field: "leadingDepartmentId" }, target: "department", targetLabel: "归口部门", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.enablingDepartment", scope: "work", source: { entity: "ProjectEnablingDepartment", field: "departmentId" }, target: "department", targetLabel: "赋能部门", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.parent", scope: "work", source: { entity: "Project", field: "parentProjectId" }, target: "project", targetLabel: "上级项目", nullable: true, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.employee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.enablingDepartmentEmployee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", targetLabel: "赋能部门成员", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.project", scope: "work", source: { entity: "EmployeeProject", field: "projectId" }, target: "project", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.tasks.owner.employee", scope: "work", source: { entity: "WorkItem", field: "ownerEmployeeId" }, target: "employee", targetLabel: "负责人", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.collaboration", scope: "work", source: { entity: "Any", field: "collaborationId" }, target: "departmentCollaboration", targetLabel: "部门协作", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.owner.position", scope: "work", source: { entity: "WorkResponsibilityReference", field: "lockedPositionId" }, target: "position", targetLabel: "关联岗位", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.responsibility-group", scope: "work", source: { entity: "WorkItem", field: "responsibilityNodeId" }, target: "positionResponsibilityNode", targetLabel: "职责大类", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.responsibility", scope: "work", source: { entity: "WorkItem", field: "responsibilityNodeId" }, target: "positionResponsibilityNode", targetLabel: "关联职责", nullable: false, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.linked.project", scope: "work", source: { entity: "WorkItem", field: "linkedProjectId" }, target: "project", targetLabel: "关联项目", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.meeting", scope: "work", source: { entity: "WorkItem", field: "sourceMeetingId" }, target: "meeting", targetLabel: "来源会议", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.department", scope: "work", source: { entity: "Any", field: "sourceDepartmentId" }, target: "department", targetLabel: "来源部门", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.okr.cycle", scope: "work", source: { entity: "WorkPlan", field: "okrCycleId" }, target: "workOkrCycle", targetLabel: "OKR 周期", nullable: false, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.plan", scope: "work", source: { entity: "WorkPlan", field: "sourcePlanId" }, target: "workPlan", targetLabel: "来源 OKR 计划", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.parent.plan", scope: "work", source: { entity: "WorkPlan", field: "parentPeriodPlanId" }, target: "workPlan", targetLabel: "上级计划", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.plan.alignment", scope: "work", source: { entity: "WorkPlanAlignment", field: "sourcePlanId" }, target: "workPlan", targetLabel: "承接来源", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.plan.upper-alignment", scope: "work", source: { entity: "WorkPlanAlignment", field: "sourcePlanId" }, target: "workPlan", targetLabel: "上级", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.assigned.alignment.item", scope: "work", source: { entity: "WorkItem", field: "parentPeriodWorkItemId" }, target: "workItem", targetLabel: "承接内容", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.previous.plan", scope: "work", source: { entity: "WorkPlan", field: "previousPeriodPlanId" }, target: "workPlan", targetLabel: "前序计划", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.parent.item", scope: "work", source: { entity: "WorkItem", field: "parentPeriodWorkItemId" }, target: "workItem", targetLabel: "上级节点", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.parent", scope: "work", source: { entity: "WorkItem", field: "parentWorkItemId" }, target: "workItem", targetLabel: "所属目标/常设职责", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.previous.item", scope: "work", source: { entity: "WorkItem", field: "previousPeriodWorkItemId" }, target: "workItem", targetLabel: "前序节点", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.meetings.participant.user", scope: "work", source: { entity: "MeetingParticipant", field: "userId" }, target: "user", targetLabel: "参会账号", nullable: false, permission: { resourceKey: "work.meetings", action: "read" } },
] satisfies FkRegistration[];

const HR_FK_REGISTRATIONS = [
  { key: "hr.department", scope: "hr", source: { entity: "Any", field: "departmentId" }, target: "department", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.parent", scope: "hr", source: { entity: "Department", field: "parentId" }, target: "department", targetLabel: "上级部门", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.manager.position", scope: "hr", source: { entity: "Department", field: "managerPositionId" }, target: "position", targetLabel: "负责人岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.manager.employee", scope: "hr", source: { entity: "DepartmentManagerEmployee", field: "employeeId" }, target: "employee", targetLabel: "部门负责人", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position", scope: "hr", source: { entity: "Any", field: "positionId" }, target: "position", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.inDepartment", scope: "hr", source: { entity: "PositionReportOverride", field: "reportToPositionId" }, target: "position", targetLabel: "上级岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.description", scope: "hr", source: { entity: "Position", field: "positionDescriptionId" }, target: "positionDescription", targetLabel: "岗位说明书", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.employee", scope: "hr", source: { entity: "Any", field: "employeeId" }, target: "employee", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.company", scope: "hr", source: { entity: "Contract", field: "company" }, target: "company", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.companyRelation.parent", scope: "hr", source: { entity: "CompanyRelation", field: "parentId" }, target: "company", targetLabel: "上级公司", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.companyRelation.child", scope: "hr", source: { entity: "CompanyRelation", field: "childId" }, target: "company", targetLabel: "下级公司", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "platform.user", scope: "hr", source: { entity: "Any", field: "userId" }, target: "user", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.edp.position", scope: "hr", source: { entity: "EDP", field: "positionId" }, target: "position", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.edp.reportTo", scope: "hr", source: { entity: "EDP", field: "reportTo", valueKind: "semantic" }, target: "employee", targetLabel: "直接上级", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.department", scope: "hr", source: { entity: "Position", field: "departmentId" }, target: "department", targetLabel: "所属部门", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
] satisfies FkRegistration[];

const FINANCE_FK_REGISTRATIONS = [
  { key: "finance.accounts.parent", scope: "finance", source: { entity: "FinanceAccount", field: "parentId" }, target: "financeAccount", targetLabel: "上级科目", nullable: true, permission: { resourceKey: "finance.ledger", action: "read" } },
] satisfies FkRegistration[];

const DOCS_FK_REGISTRATIONS = [] satisfies FkRegistration[];

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
        { key: "tasks", label: "工作空间", desc: "个人、部门和项目空间里的计划与执行", href: "/work/me", iconKey: "tasks", color: "emerald", resourceKey: "work.tasks", apiPrefixes: ["/api/modules/work/tasks"] },
        { key: "projects", label: "项目管理", desc: "组织项目、角色分工、预算和风险", href: "/work/project", iconKey: "projects", color: "emerald", resourceKey: "work.projects", apiPrefixes: ["/api/modules/work/projects"] },
        { key: "meetings", label: "会议管理", desc: "会议、纪要、表决和决议依据", href: "/work/meeting", iconKey: "meetings", color: "emerald", resourceKey: "work.meetings", apiPrefixes: ["/api/modules/work/meetings"] },
      ],
    },
    routes: [
      { path: "/work/performance", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Performance review uses the Work task execution resource." },
      { path: "/work/department", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department entry shows the organization overview shell." },
      { path: "/work/department/[departmentId]", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department home view with department overview and placeholder gantt." },
      { path: "/work/department/[departmentId]/space", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department workspace execution view." },
      { path: "/work/project/[projectId]", gatePath: "/work/project", resourceKey: "work.projects", notes: "Project management deep link for the selected project." },
      { path: "/work/project/[projectId]/space", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Project workspace execution view." },
      { path: "/work/meetings", gatePath: "/work/meeting", resourceKey: "work.meetings", notes: "Legacy meeting-management URL redirects to /work/meeting." },
    ],
    fkRegistrations: WORK_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/work/meetings", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/projects", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks/spaces", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/tasks/reports", ["GET", "PUT"]),
    ],
    spaceRegistrations: [
      {
        key: "work.tasks",
        label: "任务",
        entryKind: "work-task",
        spaceResourceKind: "tasks",
        resourceKey: "work.tasks",
        app: { moduleKey: "work", childKey: "tasks", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/tasks/spaces/:targetType/:targetId/permissions" },
        scopeMode: "standardBusinessSpace",
        targetTypes: ["personal", "department", "committee", "company", "project"],
        permissionTargetTypes: ["department", "committee", "company", "project"],
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁"],
          company: ["IT 负责人岗位的在职人员（仅授权管理）"],
        },
        notes: "Personal space is natural-only; organization and project spaces use scoped action grants, with project membership remaining an additional access source.",
      },
      {
        key: "work.projects",
        label: "项目",
        entryKind: "work-project",
        spaceResourceKind: "projects",
        resourceKey: "work.projects",
        app: { moduleKey: "work", childKey: "projects", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/projects/spaces/:targetType/:targetId/permissions" },
        scopeMode: "standardBusinessSpace",
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁"],
          company: ["IT 负责人岗位的在职人员（仅授权管理）"],
        },
        notes: "Personal space is natural-only; organization spaces use scoped action grants; object services still enforce project-specific ownership rules.",
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
        { key: "performance", label: "绩效管理", desc: "按个人、部门和项目查看绩效材料与流程", href: "/hr/performance", iconKey: "performance", color: "blue", resourceKey: "hr.performance", apiPrefixes: ["/api/modules/hr/performance"] },
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
        apiPrefixes: ["/api/modules/hr/roster/generated"],
        sortOrder: 0,
      },
    ],
    routes: ["/hr/roster/employees/[id]"],
    fkRegistrations: HR_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/hr/performance", ["GET"]),
      ...apiResourceGuards("/api/modules/hr/roster/generated", ["GET"]),
      ...apiResourceGuards("/api/modules/hr/roster"),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", access: "protected", notes: "Performance workflow draft/action routes are action-mapped by permission-api-action-policy and enforced by hrPerformanceApprovalAdapter." },
      { method: "PUT", pathPrefix: "/api/modules/hr/performance/submissions", access: "protected", notes: "Performance workflow stage revisions are action-mapped by permission-api-action-policy and enforced by hrPerformanceApprovalAdapter." },
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
    apiGuards: [
      ...apiResourceGuards("/api/modules/administration/contracts", ["GET", "POST", "PATCH", "DELETE"]),
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
        { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、项目配置、科目映射与余额校对", href: "/finance/statements", iconKey: "statements", color: "amber", resourceKey: "finance.statements", apiPrefixes: ["/api/modules/finance/statements"] },
        { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", iconKey: "analysis", color: "amber", resourceKey: "finance.analysis", apiPrefixes: ["/api/modules/finance/analysis"] },
        { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", iconKey: "budget", color: "amber", resourceKey: "finance.budget", apiPrefixes: ["/api/modules/finance/budget"] },
        { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、车间工分、销售工资", href: "/finance/cost", iconKey: "cost", color: "amber", resourceKey: "finance.cost", apiPrefixes: ["/api/modules/finance/cost"] },
        { key: "tax", label: "税务管理", desc: "销项/进项、税负分析、发票（规划中）", href: "/finance/tax", iconKey: "tax", color: "amber", resourceKey: "finance.tax", noApiReason: "规划中页面，暂无业务 API" },
        { key: "treasury", label: "司库管理", desc: "银行账户、资金日报、收付款、现金流（规划中）", href: "/finance/treasury", iconKey: "treasury", color: "amber", resourceKey: "finance.treasury", noApiReason: "规划中页面，暂无业务 API" },
        { key: "import", label: "数据导入与治理", desc: "科目/凭证/余额/预算/成本导入，校验与异常", href: "/finance/import", iconKey: "import", color: "amber", resourceKey: "finance.import", apiPrefixes: ["/api/modules/finance/import"] },
      ],
    },
    fkRegistrations: FINANCE_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/finance/ledger"),
      ...apiResourceGuards("/api/modules/finance/statements"),
      ...apiResourceGuards("/api/modules/finance/budget", ["GET", "POST"]),
      ...apiResourceGuards("/api/modules/finance/analysis", ["GET"]),
      ...apiResourceGuards("/api/modules/finance/cost", ["GET", "DELETE"]),
      ...apiResourceGuards("/api/modules/finance/import", ["POST"]),
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
    routes: [
      "/production/qc/[batchId]/[stageKey]",
      "/production/qc/[batchId]/[stageKey]/[testName]",
    ],
    apiGuards: [
      ...apiResourceGuards("/api/modules/production/qc", ["GET", "POST", "PATCH", "DELETE"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/production/qc/cache", access: "internal", notes: "Server-side QC template cache rebuild; not callable as a user-facing business API." },
    ],
  },
  {
    packageName: "@workspace/inventory",
    layer: "domain",
    moduleDef: {
      key: "inventory",
      label: "存货管理",
      desc: "物料、批次、出入库、盘点和财务计价",
      href: "/inventory",
      iconKey: "production",
      color: "cyan",
      resourceKey: "inventory",
      resourceSortOrder: 5,
      children: [
        { key: "operations", label: "库存运营", desc: "物料卡片、批次流水、盘点、导入与成本结转", href: "/inventory/operations", iconKey: "ledger", color: "cyan", resourceKey: "inventory.operations", apiPrefixes: ["/api/modules/inventory/operations"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/inventory/operations", ["GET", "POST"]),
    ],
  },
  {
    packageName: "@workspace/external",
    layer: "domain",
    moduleDef: {
      key: "external",
      label: "外部关系",
      desc: "客户与供应商往来主数据",
      href: "/external",
      iconKey: "customers",
      color: "orange",
      resourceKey: "external",
      resourceSortOrder: 5,
      lifecycleStatus: "workspace-owned",
      children: [
        { key: "customers", label: "客户管理", desc: "单位与个人客户的主体、联系和结算信息", href: "/external/customers", iconKey: "users", color: "orange", resourceKey: "external.customers", lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/external/customers"] },
        { key: "suppliers", label: "供应商管理", desc: "单位与个人供应商的主体、联系和结算信息", href: "/external/suppliers", iconKey: "suppliers", color: "orange", resourceKey: "external.suppliers", lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/external/suppliers"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/external/customers", ["GET", "POST", "PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/external/suppliers", ["GET", "POST", "PATCH", "DELETE"]),
    ],
  },
  {
    packageName: "@workspace/capital-securities",
    layer: "domain",
    moduleDef: {
      key: "capitalSecurities",
      label: "资本证券",
      desc: "投资人关系、治理架构与资本事务",
      href: "/capital-securities",
      iconKey: "investors",
      color: "amber",
      resourceKey: "capitalSecurities",
      resourceSortOrder: 6,
      lifecycleStatus: "workspace-owned",
      children: [
        { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/capital-securities/investors", iconKey: "investors", color: "amber", resourceKey: "capitalSecurities.investors", lifecycleStatus: "workspace-owned", noApiReason: "当前仅提供页面入口，暂无独立 API" },
        { key: "governance", label: "治理架构", desc: "G 线组织架构与负责人维护", href: "/capital-securities/governance", iconKey: "company", color: "amber", resourceKey: "capitalSecurities.governance", apiPrefixes: ["/api/modules/capitalSecurities/governance"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/capitalSecurities/governance", ["GET", "POST", "PUT"], {
        migrationNote: "Legacy camelCase module URL; migrate to /api/modules/capital-securities/governance.",
      }),
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
      resourceSortOrder: 7,
      apiPrefixes: ["/api/modules/docs"],
      children: [
        { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", iconKey: "company", color: "purple", resourceKey: "docs.company", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", iconKey: "expense", color: "purple", resourceKey: "docs.expense", noApiReason: "静态文档页面，无独立业务 API" },
        { key: "editor", label: "模板编辑器", desc: "模板空间、纸面编辑、字段公式和 DOCX 导出", href: "/docs/editor", iconKey: "docs", color: "purple", resourceKey: "docs.editor", apiPrefixes: ["/api/modules/docs/editor"] },
      ],
    },
    routes: ["/docs/editor/templates/[templateId]"],
    fkRegistrations: DOCS_FK_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/docs", ["GET"]),
      { method: "GET", pathPrefix: "/api/modules/docs/editor" },
      { method: "POST", pathPrefix: "/api/modules/docs/editor", notes: "Template create uses docs-editor service delegation to resolve the concrete target template space." },
      { method: "PUT", pathPrefix: "/api/modules/docs/editor" },
      { method: "PATCH", pathPrefix: "/api/modules/docs/editor" },
      { method: "DELETE", pathPrefix: "/api/modules/docs/editor" },
    ],
    spaceRegistrations: [
      {
        key: "docs.editor",
        label: "模板",
        entryKind: "docs-editor",
        spaceResourceKind: "templates",
        resourceKey: "docs.editor",
        app: { moduleKey: "docs", childKey: "editor", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/docs/editor/spaces/:docsSpaceId/permissions" },
        scopeMode: "standardBusinessSpace",
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["执行总裁"],
          company: ["IT 负责人岗位的在职人员（仅授权管理）"],
        },
        notes: "Personal space is natural-only; organization spaces resolve the concrete docs space id before calling the permission API.",
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
      resourceSortOrder: 8,
      children: [
        { key: "basicInfo", label: "基本资料", desc: "资料目录、文件、生成文档和保密等级", href: "/library/basic-info", iconKey: "basicInfo", color: "orange", resourceKey: "library.basicInfo", apiPrefixes: ["/api/modules/library/basic-info"] },
      ],
    },
    routes: ["/library/basic-info/documents/[id]"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/library/basic-info", ["GET"]),
      ...apiResourceGuards("/api/modules/library/basic-info/documents", ["PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/library/basic-info/scan", ["POST"]),
      ...apiResourceGuards("/api/modules/library/basic-info/generated-sources", ["POST"]),
      ...apiResourceGuards("/api/modules/library/basic-info/exports", ["POST"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories", access: "protected", notes: "Folder creation requires library.basicInfo configure permission." },
      { method: "PATCH", pathPrefix: "/api/modules/library/basic-info/directories", access: "protected", notes: "Folder rename cascades logical placement paths and requires configure permission." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories/delete", access: "protected", notes: "Only an empty leaf folder can be deleted; configure permission is required." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents", access: "protected", notes: "File upload creates immutable V1 and starts the Library processing pipeline." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents/:id/review", access: "protected", notes: "Importer confirms the pending upload after metadata review." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents/:id/delete", access: "protected", notes: "Configure-only permanent deletion is distinct from archive and cleans managed runtime storage." },
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
      resourceSortOrder: 100,
      children: [
        { key: "account", label: "账号与接入", desc: "账号资料、头像和个人 API 接入", href: "/settings/account", iconKey: "account", color: "blue", resourceKey: "settings.account", apiPrefixes: ["/api/settings/account"] },
        { key: "admin", label: "系统管理", desc: "用户、权限、资源和管理员配置", href: "/settings/admin", iconKey: "shieldCheck", color: "indigo", resourceKey: "settings.admin", pageAccess: "adminManage", apiPrefixes: ["/api/settings/admin"] },
        { key: "api", label: "API 接入", desc: "Open API Client、Scope 授权和调用日志", href: "/settings/api", iconKey: "api", color: "purple", resourceKey: "settings.api", apiPrefixes: ["/api/settings/api"] },
        { key: "ui", label: "UI 组件库", desc: "查看核心 UI 组件注册表", href: "/settings/ui", iconKey: "ui", color: "emerald", resourceKey: "settings.ui", noApiReason: "纯客户端组件浏览页面，无服务端 API" },
      ],
    },
    resourceDefs: [
      { key: "settings.account.apiAccess", name: "个人 API 使用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "settings.account", apiPrefixes: ["/api/settings/account/api-key"], sortOrder: 0 },
      { key: "settings.api.manage", name: "Open API Client 管理", kind: "capability", capabilityOwnerKey: "settings.api", runtimeParentKey: "settings.api", apiPrefixes: ["/api/settings/api/open/clients"], sortOrder: 0 },
      ...listWorkflowManagementResourceRegistrations(),
    ],
    routes: ["/settings/api/hr-generated"],
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/settings/version", access: "public", notes: "Public build/version metadata; returns no user or business-resource data." },
      { method: "GET", pathPrefix: "/api/settings/account/api-key", access: "protected", migrationNote: "Legacy settings account API key URL; migrate to /api/modules/settings/account/api-access/key." },
      { method: "POST", pathPrefix: "/api/settings/account/api-key", access: "protected", migrationNote: "Legacy settings account API key URL; migrate to /api/modules/settings/account/api-access/key." },
      { method: "GET", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "POST", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "PUT", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "PATCH", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "DELETE", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
    ],
    apiGuards: [
      ...apiResourceGuards("/api/settings/admin", ["GET", "POST", "PUT", "PATCH", "DELETE"], {
        migrationNote: "Legacy settings URL; migrate to /api/modules/settings/admin.",
      }),
      ...apiResourceGuards("/api/settings/api", ["GET"], {
        migrationNote: "Legacy settings URL; migrate to /api/modules/settings/api.",
      }),
      ...apiResourceGuards("/api/settings/api/open/clients", ["POST", "PUT"], {
        migrationNote: "Legacy settings Open API client URL; migrate to /api/modules/settings/api/manage/clients.",
      }),
    ],
  },
  {
    packageName: "@workspace/platform:agent",
    layer: "platform",
    moduleDef: {
      key: "agent",
      label: "智能体",
      desc: "虚拟员工配置、员工使用分析和任务汇报",
      href: "/agent",
      iconKey: "assistant",
      color: "purple",
      presentation: "page",
      noPageReason: undefined,
      resourceKey: "agent",
      resourceSortOrder: 90,
      children: [
        {
          key: "config",
          label: "Agent 配置",
          desc: "Agent 档案、运行时、能力与权限边界",
          href: "/agent/config",
          iconKey: "settings",
          color: "purple",
          resourceKey: "agent.config",
          apiPrefixes: ["/api/modules/agent/config"],
        },
        {
          key: "usage",
          label: "使用分析",
          desc: "员工使用、运行量和 Token 消耗",
          href: "/agent/usage",
          iconKey: "analytics",
          color: "purple",
          resourceKey: "agent.usage",
          noApiReason: "分析视图由受保护的 Server Component 聚合 AgentRun 与 AgentSession。",
        },
        {
          key: "reports",
          label: "任务汇报",
          desc: "按 Agent 查看运行结果、待确认事项和异常",
          href: "/agent/reports",
          iconKey: "reports",
          color: "purple",
          resourceKey: "agent.reports",
          noApiReason: "汇报视图由受保护的 Server Component 投影现有运行审计事实。",
        },
      ],
    },
    resourceDefs: [
      { key: "agent.assistant", name: "Agent 助手调用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "agent", apiPrefixes: ["/api/agent"], sortOrder: 0 },
      { key: "agent.source", name: "Workspace 源码与 PR", kind: "capability", capabilityOwnerKey: "agent.assistant", runtimeParentKey: "agent", sortOrder: 1 },
    ],
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/agent", access: "protected", migrationNote: "Legacy headless assistant URL retained under agent.assistant; management writes use the canonical /api/modules/agent/config route." },
      { method: "POST", pathPrefix: "/api/agent", access: "protected", migrationNote: "Legacy headless assistant URL retained under agent.assistant; management writes use the canonical /api/modules/agent/config route." },
    ],
    apiGuards: [
      { method: "GET", pathPrefix: "/api/modules/agent/config/permission-grants", notes: "Gateway requires agent.config.read; the service repeats read and selected-resource grant checks." },
      { method: "PUT", pathPrefix: "/api/modules/agent/config/permission-grants", notes: "Gateway requires agent.config.read; the service repeats read and preauthorizes every selected resource grant." },
      ...apiResourceGuards("/api/modules/agent/config", ["GET", "PUT"], { notes: "Agent reads require agent.config.read; profile/runtime and action-ceiling writes require configure; organization RBAC grants stay separately grant-authorized." }),
    ],
  },
  {
    packageName: "@workspace/platform:system",
    layer: "platform",
    routes: [
      { path: "/", access: "public", notes: "Root redirects to the current default page or login." },
      { path: "/login", access: "public", notes: "Login page must be reachable without a session." },
      { path: "/portal", access: "authenticated", notes: "Authenticated application landing page; resource navigation is filtered inside the shell." },
      { path: "/module-disabled", access: "authenticated", notes: "Disabled-module explanation page reached after a resource gate redirects." },
    ],
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
