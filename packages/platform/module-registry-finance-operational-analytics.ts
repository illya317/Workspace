import type { WorkspacePackageRegistration } from "@workspace/core/module-contract";

export const FINANCE_MODULE_REGISTRY_FRAGMENT = {
  moduleDef: {
    key: "finance",
    label: "财务管理",
    desc: "总账、资产会计、资金、税务、财务报表、预算、分析",
    href: "/finance",
    iconKey: "finance",
    color: "amber",
    resourceKey: "finance",
    resourceSortOrder: 3,
    children: [
      { key: "ledger", label: "总账会计", desc: "科目、凭证、期间、余额、结账、重分类", href: "/finance/ledger", iconKey: "ledger", color: "amber", resourceKey: "finance.ledger", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/ledger"] },
      { key: "assets", label: "资产会计", desc: "资产卡片、会计政策、折旧摊销、减值与处置", href: "/finance/assets", iconKey: "ledger", color: "amber", resourceKey: "finance.assets", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/assets"] },
      { key: "treasury", label: "资金管理", desc: "银行账户、银行对账、借款与利息", href: "/finance/treasury", iconKey: "treasury", color: "amber", resourceKey: "finance.treasury", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/treasury"] },
      { key: "tax", label: "税务管理", desc: "税费计提、申报缴纳、应缴实缴与税务勾稽", href: "/finance/tax", iconKey: "tax", color: "amber", resourceKey: "finance.tax", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/tax"] },
      { key: "statements", label: "财务报表", desc: "资产负债表、利润表、现金流量表、项目配置、科目映射与余额校对", href: "/finance/statements", iconKey: "statements", color: "amber", resourceKey: "finance.statements", mobileExperience: { strategy: "landscape", reason: "报表需要同时保留科目层级、期间和金额列，横屏工作台比拆成卡片更易核对。" }, apiPrefixes: ["/api/modules/finance/statements"] },
      { key: "analysis", label: "管理会计", desc: "经营分析、部门利润、产品客户维度、预算执行分析", href: "/finance/analysis", iconKey: "analysis", color: "amber", resourceKey: "finance.analysis", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/analysis"] },
      { key: "budget", label: "预算管理", desc: "预算版本、部门预算、研发预算、调整、执行", href: "/finance/budget", iconKey: "budget", color: "amber", resourceKey: "finance.budget", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/budget"] },
      { key: "cost", label: "成本管理", desc: "发货、成本结构、成本分析、销售工资", href: "/finance/cost", iconKey: "cost", color: "amber", resourceKey: "finance.cost", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/finance/cost"] },
    ],
  },
  resourceDefs: [
    { key: "finance.operationalAnalytics", name: "空间经营分析", kind: "capability", capabilityOwnerKey: "finance.cost", runtimeParentKey: "finance.cost", apiPrefixes: ["/api/modules/finance/cost/operational-analytics"], sortOrder: 0 },
  ],
  routes: [
    { path: "/finance/cost/workspace/[targetType]/[targetId]", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Finance-owned operational analysis surface entered from Work spaces; the Finance API performs target-specific natural/scoped authorization." },
  ],
  apiRoutes: [
    { method: "GET", pathPrefix: "/api/modules/finance/cost/operational-analytics", access: "protected", migrationNote: "This capability is intentionally mounted below its registered finance.cost L2 owner while retaining an independent permission resource.", notes: "The service resolves the concrete workspace scope before reading a system preset, workspace template catalog, or template runtime. Programmatic API clients start with /spaces/:targetType/:targetId/sources/discover and then follow its templates/contract link for JSON request schemas." },
    { method: "POST", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", access: "protected", migrationNote: "This capability is intentionally mounted below its registered finance.cost L2 owner while retaining an independent permission resource.", notes: "All programmatic API clients share the same Finance validators, apiUse gate, immutable snapshots, source authorization and optimistic revision CAS for draft creation, runtime execution, preview and lifecycle commands." },
    { method: "PUT", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", access: "protected", migrationNote: "This capability is intentionally mounted below its registered finance.cost L2 owner while retaining an independent permission resource.", notes: "Standard API draft revision and scoped permission maintenance are distinguished by route policy; services recheck the concrete space, source authorization, apiUse and grant authority." },
  ],
  spaceRegistrations: [
    {
      key: "finance.operationalAnalytics",
      label: "经营分析",
      entryKind: "operational-analytics",
      spaceResourceKind: "analytics",
      resourceKey: "finance.operationalAnalytics",
      app: { moduleKey: "finance", childKey: "cost", defaultLevel: "L3" },
      api: { permissionsPathTemplate: "/api/modules/finance/cost/operational-analytics/spaces/:targetType/:targetId/permissions" },
      scopeMode: "standardBusinessSpace",
      targetTypes: ["personal", "department", "project"],
      permissionTargetTypes: ["department", "project"],
      naturalManagerSources: {
        personal: ["当前用户本人"],
        department: ["Department.managerPositionId 对应岗位的在职人员"],
        project: ["项目经营分析由空间授权显式配置"],
      },
      notes: "Analysis templates are workspace-owned data, not tenant settings or application source. Personal users read and configure their own space; department members naturally read while department managers naturally configure; users who can enter an enabled Work project space naturally read its analysis, while project configuration and other analysts require explicit scoped configure grants. Export is stronger than read, while API-key use requires the orthogonal apiUse grant in addition to read.",
    },
  ],
} satisfies Pick<WorkspacePackageRegistration, "moduleDef" | "resourceDefs" | "routes" | "apiRoutes" | "spaceRegistrations">;
