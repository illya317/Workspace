import type { SurfaceNavigationTabSpec } from "@workspace/core/ui";
import type { PageStyleRouteModule, PageViewDefinition, PageViewNode } from "@workspace/core/page-style-preview";
import { effectiveModuleDefinitions } from "./effective-module-registry";
import { applyRouteRuntimeLabel, getRouteRuntimeMeta, type RouteRuntimeMeta } from "./route-runtime-labels";

export type { PageStyleRouteModule, PageViewDefinition, PageViewNode };

const basePageViewDefinitions: PageViewDefinition[] = [
  {
    route: "/hr/roster",
    moduleKey: "hr",
    label: "人事基础资料",
    recordRoutes: ["/hr/roster/employees/[id]"],
    views: [
      { key: "employee", label: "员工资料", children: [{ key: "active", label: "在职" }, { key: "inactive", label: "离职" }] },
      {
        key: "organization",
        label: "组织架构",
        children: [
          { key: "maintenance", label: "组织维护" },
          { key: "chart", label: "架构图" },
        ],
      },
      { key: "department-position", label: "部门岗位", children: [{ key: "active", label: "现用" }, { key: "archived", label: "归档" }] },
      {
        key: "bulk",
        label: "员工信息表",
        children: [
          { key: "employee", label: "员工信息" },
          { key: "employment", label: "雇佣关系" },
          { key: "contract", label: "合同" },
          { key: "edp", label: "部门岗位" },
        ],
      },
      {
        key: "generated",
        label: "花名册",
        resourceKey: "hr.roster.generated",
        children: [
          { key: "management", label: "管理版" },
          { key: "dueDiligence", label: "尽调版" },
        ],
      },
    ],
  },
  {
    route: "/hr/performance",
    moduleKey: "hr",
    label: "绩效管理",
    views: [
      { key: "attendance", label: "考勤" },
      { key: "works", label: "贡献材料", children: [{ key: "personal", label: "个人" }, { key: "department", label: "部门" }, { key: "project", label: "项目" }] },
      { key: "performance", label: "绩效", children: [{ key: "personal", label: "个人" }, { key: "department", label: "部门" }, { key: "project", label: "项目" }] },
    ],
  },
  {
    route: "/work/performance",
    moduleKey: "work",
    label: "绩效评审",
    views: [
      { key: "attendance", label: "考勤" },
      { key: "works", label: "贡献材料" },
      { key: "performance", label: "绩效" },
    ],
  },
  {
    route: "/hr/analytics",
    moduleKey: "hr",
    label: "人力分析",
    views: [
      { key: "employee", label: "员工信息" },
      { key: "department", label: "部门架构" },
      { key: "position", label: "岗位分析" },
      { key: "contract", label: "合同预警" },
      { key: "headcount", label: "人员流动" },
      { key: "turnover", label: "离职分析" },
    ],
  },
  {
    route: "/finance/ledger",
    moduleKey: "finance",
    label: "总账会计",
    views: [
      {
        key: "accounts",
        label: "科目设置",
        children: [
          { key: "company-accounts", label: "公司科目" },
          { key: "group-accounts", label: "集团科目" },
        ],
      },
      { key: "vouchers", label: "凭证明细" },
      { key: "ledger", label: "余额表" },
      {
        key: "counterparty",
        label: "应收应付",
        children: [
          { key: "ar", label: "应收" },
          { key: "ap", label: "应付" },
          { key: "otherAr", label: "其他应收" },
          { key: "otherAp", label: "其他应付" },
        ],
      },
      {
        key: "reclass",
        label: "重分类",
        children: [
          { key: "rules", label: "科目规则" },
          { key: "adjustments", label: "重分类调整" },
        ],
      },
      {
        key: "depreciation",
        label: "折旧摊销",
        children: [
          { key: "cards", label: "资产卡片" },
          { key: "period", label: "月度折旧摊销" },
          { key: "adjustments", label: "调整事项" },
          { key: "reconciliation", label: "总账勾稽" },
        ],
      },
    ],
  },
  {
    route: "/finance/cost",
    moduleKey: "finance",
    label: "成本管理",
    views: [
      {
        key: "shipments",
        label: "发货与回款",
      },
      { key: "cost-analysis", label: "成本分析" },
      { key: "cost-structure", label: "成本构成" },
    ],
  },
  {
    route: "/production/products",
    moduleKey: "production",
    label: "产品主档",
    views: [
      { key: "product", label: "产品信息" },
      { key: "skus", label: "SKU包装" },
      { key: "mappings", label: "来源映射" },
    ],
  },
  {
    route: "/inventory/operations",
    moduleKey: "inventory",
    label: "库存运营",
    views: [
      { key: "overview", label: "库存总览" },
      { key: "items", label: "产品库存" },
      { key: "movements", label: "出入库" },
      { key: "batches", label: "批次" },
      { key: "stocktakes", label: "盘点" },
      { key: "closing", label: "财务计价" },
      { key: "imports", label: "导入记录" },
    ],
  },
  {
    route: "/finance/statements",
    moduleKey: "finance",
    label: "财务报表",
    views: [],
  },
  {
    route: "/finance/analysis",
    moduleKey: "finance",
    label: "管理会计",
    views: [
      { key: "analysis", label: "经营分析" },
    ],
  },
  {
    route: "/finance/budget",
    moduleKey: "finance",
    label: "预算管理",
    views: [
      { key: "budget", label: "预算执行" },
    ],
  },
  {
    route: "/production/qc",
    moduleKey: "production",
    label: "批次检验",
    recordRoutes: [
      "/production/qc/[batchId]/[stageKey]",
      "/production/qc/[batchId]/[stageKey]/[testName]",
    ],
    views: [],
  },
  {
    route: "/work/project",
    moduleKey: "work",
    label: "项目管理",
    recordRoutes: ["/work/project/[id]"],
    views: [
      {
        key: "projects",
        label: "项目管理",
        children: [
          { key: "projects", label: "项目总览" },
        ],
      },
    ],
  },
  {
    route: "/work/me",
    moduleKey: "work",
    label: "工作空间",
    views: [
      { key: "works", label: "任务台账", children: [{ key: "works", label: "待办" }, { key: "works-done", label: "已完成" }] },
    ],
  },
  {
    route: "/administration/contracts",
    moduleKey: "administration",
    label: "合同台账",
    recordRoutes: ["/administration/contracts/[id]"],
    views: [
      {
        key: "contracts",
        label: "合同台账",
        children: [
          { key: "contracts", label: "现用" },
          { key: "contracts-expiring", label: "到期" },
          { key: "contracts-archived", label: "归档" },
        ],
      },
    ],
  },
  {
    route: "/capital-securities/investors",
    moduleKey: "capitalSecurities",
    label: "投资人关系",
    views: [
      { key: "investors", label: "投资人" },
    ],
  },
  {
    route: "/capital-securities/governance",
    moduleKey: "capitalSecurities",
    label: "治理架构",
    views: [
      { key: "governance", label: "治理组织" },
      { key: "companies", label: "公司信息" },
      { key: "relations", label: "股权关系" },
    ],
  },
  {
    route: "/external/customers",
    moduleKey: "external",
    label: "客户管理",
    views: [
      {
        key: "customers",
        label: "客户联系",
        children: [
          { key: "customers", label: "客户" },
          { key: "customers-archive", label: "归档客户" },
          { key: "contacts", label: "联系记录" },
        ],
      },
    ],
  },
  {
    route: "/external/suppliers",
    moduleKey: "external",
    label: "供应商管理",
    views: [
      { key: "suppliers", label: "供应商" },
    ],
  },
  {
    route: "/docs/company",
    moduleKey: "docs",
    label: "公司管理",
    views: [
      { key: "company", label: "文档阅读" },
    ],
  },
  {
    route: "/library/basic-info",
    moduleKey: "library",
    label: "基本资料",
    recordRoutes: ["/library/basic-info/documents/[id]"],
    views: [
      {
        key: "catalog",
        label: "资料浏览",
        children: [
          { key: "catalog", label: "目录" },
          { key: "files", label: "现用文件" },
          { key: "files-missing", label: "缺失文件" },
        ],
      },
      { key: "upload", label: "上传处理" },
    ],
  },
];

function getRuntimeRouteMeta(route: string): RouteRuntimeMeta | null {
  return getRouteRuntimeMeta(route, effectiveModuleDefinitions);
}

function isRuntimeRouteVisible(route: string) {
  return Boolean(getRuntimeRouteMeta(route));
}

function applyRuntimeViewLabels(nodes: PageViewNode[], meta: RouteRuntimeMeta): PageViewNode[] {
  return nodes.map((node) => ({
    ...node,
    label: applyRouteRuntimeLabel(node.label, meta),
    children: node.children ? applyRuntimeViewLabels(node.children, meta) : undefined,
  }));
}

function applyRuntimeDefinition(definition: PageViewDefinition): PageViewDefinition {
  const meta = getRuntimeRouteMeta(definition.route);
  if (!meta) return definition;
  return {
    ...definition,
    label: meta.label,
    views: applyRuntimeViewLabels(definition.views, meta),
  };
}

export const pageViewDefinitions: PageViewDefinition[] = basePageViewDefinitions
  .filter((definition) => isRuntimeRouteVisible(definition.route))
  .map(applyRuntimeDefinition);

export function getPageStyleRouteModules(): PageStyleRouteModule[] {
  return effectiveModuleDefinitions.flatMap(({ moduleDef }) => {
    if (!moduleDef || moduleDef.presentation === "headless" || moduleDef.enabled === false || moduleDef.hidden) return [];
    const children = moduleDef.children?.length
      ? moduleDef.children.filter((child) => child.enabled !== false && !child.hidden).map((child) => ({
          key: child.key,
          label: child.label,
          route: child.href,
        }))
      : [{ key: moduleDef.key, label: moduleDef.label, route: moduleDef.href }];

    return {
      key: moduleDef.key,
      label: moduleDef.label,
      route: moduleDef.href,
      children,
    };
  });
}

export function getPageViewDefinition(route: string) {
  return pageViewDefinitions.find((definition) => definition.route === route);
}

export function getPageViewTabs(route: string): SurfaceNavigationTabSpec[] {
  return toTabDefs(getPageViewDefinition(route)?.views ?? []);
}

export function getPageViewTabsForUser(route: string, visibleResourceKeys: readonly string[]): SurfaceNavigationTabSpec[] {
  const visible = new Set(visibleResourceKeys);
  return toTabDefs(filterViewNodesByResource(getPageViewDefinition(route)?.views ?? [], visible));
}

export function toTabDefs(nodes: PageViewNode[]): SurfaceNavigationTabSpec[] {
  return nodes.map((node) => ({
    key: node.key,
    label: node.label,
    children: node.children?.map((child) => ({ key: child.key, label: child.label })),
  }));
}

function filterViewNodesByResource(nodes: PageViewNode[], visibleResourceKeys: Set<string>): PageViewNode[] {
  return nodes.flatMap((node) => {
    if (node.resourceKey && !visibleResourceKeys.has(node.resourceKey)) return [];
    const children = node.children ? filterViewNodesByResource(node.children, visibleResourceKeys) : undefined;
    return [{ ...node, children }];
  });
}

export function getFirstView(definition?: PageViewDefinition) {
  const firstView = definition?.views[0];
  return {
    viewKey: firstView?.key ?? "",
    childKey: firstView?.children?.[0]?.key,
  };
}
