import type { TabDef } from "@workspace/core/ui";
import type { PageStyleRouteModule, PageViewDefinition, PageViewNode } from "@workspace/core/ui/page-style-preview/template-data";
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
      { key: "organization", label: "组织架构" },
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
    label: "考勤绩效",
    views: [
      { key: "attendance", label: "考勤" },
      { key: "works", label: "工作查看" },
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
      { key: "accounts", label: "科目设置" },
      { key: "vouchers", label: "凭证明细" },
      { key: "ledger", label: "余额表" },
      { key: "reclass", label: "重分类表" },
      { key: "depreciation", label: "资产折旧" },
    ],
  },
  {
    route: "/finance/statement-config",
    moduleKey: "finance",
    label: "报表配置",
    views: [
      { key: "lines", label: "报表项目配置" },
      { key: "unmapped", label: "遗漏科目" },
      { key: "balance", label: "余额校对" },
    ],
  },
  {
    route: "/finance/cost",
    moduleKey: "finance",
    label: "成本管理",
    views: [
      { key: "overview", label: "总览" },
      { key: "shipments", label: "发货与回款" },
      { key: "cost-analysis", label: "成本分析" },
      { key: "cost-structure", label: "成本构成" },
      { key: "workshop", label: "车间工分" },
      { key: "salary", label: "业务员工资" },
      { key: "imports", label: "导入记录" },
    ],
  },
  {
    route: "/finance/statement-review",
    moduleKey: "finance",
    label: "报表校对",
    views: [
      { key: "statement-review", label: "报表审核" },
    ],
  },
  {
    route: "/finance/statements",
    moduleKey: "finance",
    label: "财务报表",
    views: [
      { key: "statements", label: "报表数据" },
    ],
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
    route: "/finance/tax",
    moduleKey: "finance",
    label: "税务管理",
    views: [
      { key: "tax", label: "税务记录" },
    ],
  },
  {
    route: "/finance/treasury",
    moduleKey: "finance",
    label: "司库管理",
    views: [
      { key: "treasury", label: "资金台账" },
    ],
  },
  {
    route: "/finance/import",
    moduleKey: "finance",
    label: "数据导入与治理",
    views: [
      { key: "import", label: "导入处理" },
    ],
  },
  {
    route: "/production/qc-batches",
    moduleKey: "production",
    label: "批次检验",
    recordRoutes: [
      "/production/qc-batches/[batchId]",
      "/production/qc-batches/[batchId]/[stageKey]",
      "/production/qc-batches/[batchId]/[stageKey]/[testName]",
    ],
    views: [],
  },
  {
    route: "/work/projects",
    moduleKey: "work",
    label: "项目管理",
    recordRoutes: ["/work/projects/[id]"],
    views: [
      {
        key: "projects",
        label: "项目管理",
        children: [
          { key: "projects", label: "项目台账" },
          { key: "projects-gantt", label: "公司甘特" },
          { key: "project-plan-gantt", label: "项目甘特" },
        ],
      },
    ],
  },
  {
    route: "/work/tasks",
    moduleKey: "work",
    label: "工作计划",
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
    route: "/external/investors",
    moduleKey: "external",
    label: "投资人关系",
    views: [
      { key: "investors", label: "投资人" },
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
    route: "/docs/positions/GMP",
    moduleKey: "docs",
    label: "岗位说明书",
    recordRoutes: ["/docs/positions/GMP/[code]"],
    views: [
      { key: "gmp-list", label: "GMP 列表" },
    ],
  },
  {
    route: "/docs/company",
    moduleKey: "docs",
    label: "公司管理",
    views: [
      {
        key: "company",
        label: "文档阅读",
        children: [
          { key: "company", label: "公司文档" },
          { key: "policy", label: "规章制度" },
          { key: "drafts", label: "草稿" },
        ],
      },
    ],
  },
  {
    route: "/docs/expense",
    moduleKey: "docs",
    label: "报销规范",
    views: [
      { key: "expense", label: "费用制度" },
    ],
  },
  {
    route: "/library/basic-info",
    moduleKey: "library",
    label: "基本资料",
    recordRoutes: ["/library/basic-info/files/[id]"],
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

export function getPageViewTabs(route: string): TabDef[] {
  return toTabDefs(getPageViewDefinition(route)?.views ?? []);
}

export function getPageViewTabsForUser(route: string, visibleResourceKeys: readonly string[]): TabDef[] {
  const visible = new Set(visibleResourceKeys);
  return toTabDefs(filterViewNodesByResource(getPageViewDefinition(route)?.views ?? [], visible));
}

export function toTabDefs(nodes: PageViewNode[]): TabDef[] {
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
