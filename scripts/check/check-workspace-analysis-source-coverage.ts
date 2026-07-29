import fs from "node:fs";
import path from "node:path";

import { ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/administration/server/workspace-analysis-sources";
import { CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/capital-securities/server/workspace-analysis-sources";
import { EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/external/server/workspace-analysis-sources";
import { FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/finance/server/cost/workspace-analysis-sources";
import { FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/finance/server/workspace-analysis-source-registrations";
import { HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/hr/server/workspace-analysis-sources";
import { INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/inventory/server/workspace-analysis-sources";
import { LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/library/server/workspace-analysis-sources";
import { PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/production/server/workspace-analysis-sources";
import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../../packages/work/server/workspace-analysis-sources";
import { findApiContract } from "../../packages/platform/api-registry";
import { createWorkspaceAnalysisSourceCatalog } from "../../packages/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceRegistration } from "../../packages/platform/server/workspace-analysis-source-registry";

type DerivedCoverage = {
  readonly disposition: "derived";
  readonly sourceKeys: readonly string[];
  readonly reason: string;
};

type ExcludedCoverage = {
  readonly disposition: "excluded";
  readonly reason:
    | "binary"
    | "controlPlane"
    | "lookupFragment"
    | "recursiveAnalysis"
    | "singleRecord"
    | "unstableComposite"
    | "workflowControl";
  readonly description: string;
};

type ExplicitCoverage = DerivedCoverage | ExcludedCoverage;

const EXPLICIT_ROUTE_COVERAGE: Readonly<Record<string, ExplicitCoverage>> = {
  "/api/modules/settings/account/notification-subscriptions": {
    disposition: "excluded",
    reason: "controlPlane",
    description: "当前用户的通知目录、权限资格和订阅覆盖属于个人控制面，不是经营分析数据集。",
  },
  "/api/modules/administration/contracts/[id]/lifecycle": {
    disposition: "excluded",
    reason: "singleRecord",
    description: "单份合同的修订与状态事件时间线只服务详情和业务回溯，不是有界分页分析数据集。",
  },
  "/api/modules/administration/contracts/[id]/package": {
    disposition: "excluded",
    reason: "singleRecord",
    description: "单份合同的审批引用、附件与归档记录聚合只服务合同详情，不是稳定分页分析数据集。",
  },
  "/api/modules/capitalSecurities/governance/ownership-parties": {
    disposition: "excluded",
    reason: "lookupFragment",
    description: "该接口只返回股权主体候选项；完整主体和持股事实由治理及股权数据源提供。",
  },
  "/api/modules/external/related-parties/candidates": {
    disposition: "excluded",
    reason: "lookupFragment",
    description: "该接口只返回当前用户可登记的客户或供应商 Party 候选；完整关联方名录由已登记的数据源提供。",
  },
  "/api/modules/finance/analysis/budget": {
    disposition: "derived",
    sourceKeys: ["finance.budget.versions", "finance.budget.department-monthly", "finance.budget.research-monthly"],
    reason: "预算分析页是已登记预算月度事实的展示聚合。",
  },
  "/api/modules/finance/cost/imports/[id]": {
    disposition: "derived",
    sourceKeys: [
      "finance.cost.imports",
      "finance.cost.shipments",
      "finance.cost.sales-salary",
      "finance.cost.workshop-reports",
      "finance.cost.structure",
      "finance.cost.analysis",
    ],
    reason: "详情页的批次头与五类 take:5 预览，均可由按 importId 精确筛选的完整分页事实源重建；样本数组本身不作为数据源。",
  },
  "/api/modules/finance/cost/operational-analytics/shipments/analytics": {
    disposition: "derived",
    sourceKeys: ["finance.shipments"],
    reason: "个人发货分析由同口径个人发货事实聚合。",
  },
  "/api/modules/finance/cost/shipments/analytics": {
    disposition: "derived",
    sourceKeys: ["finance.cost.shipments"],
    reason: "全公司发货分析由发货事实聚合。",
  },
  "/api/modules/finance/cost/summary": {
    disposition: "derived",
    sourceKeys: ["finance.cost.shipments", "finance.cost.structure", "finance.cost.sales-salary"],
    reason: "成本总览是已登记成本明细事实的展示汇总。",
  },
  "/api/modules/finance/assets/code-preview": {
    disposition: "excluded",
    reason: "lookupFragment",
    description: "资产编号预览只返回当前规则下的不占号候选，不是已经形成的资产事实。",
  },
  "/api/modules/finance/ledger/closing": {
    disposition: "excluded",
    reason: "workflowControl",
    description: "关账运行、任务状态和阻断项是期间关账编排控制面；稳定财务事实由各 contributor 的已登记来源承载。",
  },
  "/api/modules/finance/ledger/closing/workpapers": {
    disposition: "excluded",
    reason: "workflowControl",
    description: "关账底稿的编制、复核和版本状态用于关账工作流控制；其引用的凭证及业务事实由原 owner 数据源承载。",
  },
  "/api/modules/finance/tax": {
    disposition: "excluded",
    reason: "unstableComposite",
    description: "当前税务工作区一次返回登记、计税底稿、申报、缴款、勾稽快照及嵌套明细，尚无各事实独立的有界分页读模型，不能把当前页面复合数组登记为完整数据源。",
  },
  "/api/modules/finance/treasury": {
    disposition: "excluded",
    reason: "unstableComposite",
    description: "当前资金工作区一次返回银行账户、对账、借款、利息底稿及多层嵌套明细，尚无各事实独立的有界分页读模型，不能把当前页面复合数组登记为完整数据源。",
  },
  "/api/modules/hr/roster": {
    disposition: "derived",
    sourceKeys: ["hr.employees", "hr.employments", "hr.contracts", "hr.edps", "hr.departments", "hr.companies"],
    reason: "旧花名册矩阵是员工、雇佣、合同和岗位关系的兼容展示。",
  },
  "/api/modules/hr/roster/generated/preview": {
    disposition: "derived",
    sourceKeys: ["hr.employees", "hr.employments", "hr.contracts", "hr.edps", "hr.departments", "hr.positions", "hr.companies"],
    reason: "花名册生成预览返回分页 JSON 行，是已登记 HR 主数据的管理版或尽调版列投影，不是文件预览流。",
  },
  "/api/modules/hr/roster/employee-profiles/[id]": {
    disposition: "derived",
    sourceKeys: ["hr.employees", "hr.employments", "hr.contracts", "hr.edps"],
    reason: "单员工档案是已登记 HR 主数据的详情组合，不作为批量源。",
  },
  "/api/modules/hr/roster/employee-profiles/[id]/history": {
    disposition: "derived",
    sourceKeys: ["hr.audit-entries", "hr.audit-changes"],
    reason: "单员工历史是已登记 HR 审计事实按员工关系过滤后的详情视图。",
  },
  "/api/modules/hr/roster/employee-profiles/[id]/agreements": {
    disposition: "excluded",
    reason: "singleRecord",
    description: "单员工协议、期限和修订时间线只服务档案详情；批量分析继续使用已登记的 HR 合同读模型。",
  },
  "/api/modules/hr/roster/employee-profiles/[id]/social-insurance": {
    disposition: "excluded",
    reason: "singleRecord",
    description: "单员工社会保险参保时间线只服务档案详情；需要批量分析时应另建受治理的分页读模型。",
  },
  "/api/modules/hr/roster/position-description-templates": {
    disposition: "excluded",
    reason: "controlPlane",
    description: "岗位说明书模板定义内容结构，不是经营事实。",
  },
  "/api/modules/hr/roster/position-descriptions": {
    disposition: "derived",
    sourceKeys: ["hr.positions", "hr.position-descriptions"],
    reason: "岗位说明书列表、树和详情是岗位标量及说明书字段的多模式兼容视图。",
  },
  "/api/modules/hr/performance/reviews/[id]": {
    disposition: "derived",
    sourceKeys: [
      "hr.performance-reviews",
      "hr.performance-review-details",
      "hr.performance-review-evidence-values",
    ],
    reason: "单条正式绩效详情可由原 dashboard 可见评审、完整详情和证据快照路径值来源按 reviewId 过滤得到。",
  },
  "/api/modules/hr/performance/contributions/[audienceType]/[audienceId]": {
    disposition: "derived",
    sourceKeys: [
      "hr.performance-cycles",
      "hr.employees",
      "hr.edps",
      "hr.departments",
      "hr.positions",
      "hr.companies",
      "work.projects",
      "work.plans",
      "work.items",
      "work.reports",
      "work.report-items",
    ],
    reason: "绩效贡献详情是已登记人员、组织、项目、周期、计划、事项和已保存汇报事实按目标与周期生成的 dossier 投影。",
  },
  "/api/modules/library/basic-info/[...path]": {
    disposition: "excluded",
    reason: "binary",
    description: "按管理路径返回资料文件内容，不是稳定行数据集。",
  },
  "/api/modules/library/basic-info/documents/[id]": {
    disposition: "derived",
    sourceKeys: ["library.documents", "library.document-current-versions", "library.document-tags"],
    reason: "单资料详情由资料、当前版本和标签源组合；处理运行态属于控制面。",
  },
  "/api/modules/library/basic-info/documents/[id]/versions": {
    disposition: "derived",
    sourceKeys: ["library.documents", "library.document-versions"],
    reason: "单资料版本历史可由原对象可见资料主表与完整历史版本批量源按 documentId 过滤得到。",
  },
  "/api/modules/work/tasks/reports": {
    disposition: "derived",
    sourceKeys: ["work.reports", "work.report-items", "work.plans", "work.items"],
    reason: "单空间汇报草稿中的已保存汇报、事项及候选工作事实可由已登记来源组合；可编辑状态、治理策略和 actionRuntime 属于控制面。",
  },
};

/**
 * Exact protected business GETs whose exclusion has been reviewed.
 *
 * `automaticExclusion` intentionally keeps the path-pattern policy in one
 * place, but a pattern match alone is not approval: every accepted route must
 * also appear here with the category that was reviewed. This makes a new route
 * caught by a broad pattern fail the coverage gate until it is inspected.
 */
const REVIEWED_AUTOMATIC_EXCLUSIONS: Readonly<Record<string, ExcludedCoverage["reason"]>> = {
  "/api/agent/capabilities": "controlPlane",
  "/api/agent/profiles": "controlPlane",
  "/api/agent/proposals/[id]": "controlPlane",
  "/api/modules/administration/contracts/[id]/attachments/[attachmentUid]/download": "binary",
  "/api/modules/administration/contracts/export": "binary",
  "/api/modules/administration/contracts/reference-options": "lookupFragment",
  "/api/modules/administration/erp-diligence/attachments/[attachmentUid]": "binary",
  "/api/modules/capitalSecurities/investors/export": "binary",
  "/api/modules/docs/company/documents/[key]/office-viewer": "binary",
  "/api/modules/docs/company/permission-actions": "controlPlane",
  "/api/modules/docs/editor": "controlPlane",
  "/api/modules/docs/editor/reference-options": "lookupFragment",
  "/api/modules/docs/editor/spaces/[spaceId]/permissions": "controlPlane",
  "/api/modules/docs/editor/submissions": "workflowControl",
  "/api/modules/docs/editor/templates/[templateId]": "controlPlane",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/permissions": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/sources": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/sources/discover": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/templates": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/templates/[templateId]": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/templates/[templateId]/lifecycle": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/templates/[templateId]/runtime": "recursiveAnalysis",
  "/api/modules/finance/cost/operational-analytics/spaces/[targetType]/[targetId]/templates/contract": "recursiveAnalysis",
  "/api/modules/finance/assets/export": "binary",
  "/api/modules/finance/assets/reference-options": "lookupFragment",
  "/api/modules/finance/tax/reference-options": "lookupFragment",
  "/api/modules/finance/treasury/reference-options": "lookupFragment",
  "/api/modules/finance/ledger/export": "binary",
  "/api/modules/finance/ledger/group-account-options": "lookupFragment",
  "/api/modules/finance/ledger/consolidation-rules": "controlPlane",
  "/api/modules/finance/ledger/reclass-results/lookup-period": "lookupFragment",
  "/api/modules/finance/statements/consolidation/batches/[batchId]/entry-source-options": "lookupFragment",
  "/api/modules/finance/statements/consolidation/batches/[batchId]/report/export": "binary",
  "/api/modules/finance/statements/reports/export": "binary",
  "/api/modules/hr/performance/submissions": "workflowControl",
  "/api/modules/hr/roster/autocomplete": "lookupFragment",
  "/api/modules/hr/roster/department-codes": "lookupFragment",
  "/api/modules/hr/roster/employee-profiles/[id]/agreements/[agreementUid]/attachments/[attachmentUid]/download": "binary",
  "/api/modules/hr/roster/employees/search": "lookupFragment",
  "/api/modules/hr/roster/generated/export": "binary",
  "/api/modules/hr/roster/position-codes": "lookupFragment",
  "/api/modules/hr/roster/reference-options": "lookupFragment",
  "/api/modules/hr/roster/submissions": "workflowControl",
  "/api/modules/library/basic-info/documents/[id]/download": "binary",
  "/api/modules/library/basic-info/documents/[id]/preview": "binary",
  "/api/modules/library/basic-info/documents/[id]/versions/[versionId]/download": "binary",
  "/api/modules/library/basic-info/documents/[id]/versions/[versionId]/office-viewer": "binary",
  "/api/modules/library/basic-info/documents/[id]/versions/[versionId]/preview": "binary",
  "/api/modules/library/basic-info/exports/[exportUid]/download": "binary",
  "/api/modules/library/basic-info/generated-sources": "controlPlane",
  "/api/modules/library/basic-info/search": "lookupFragment",
  "/api/modules/work/projects/reference-options": "lookupFragment",
  "/api/modules/work/projects/spaces": "controlPlane",
  "/api/modules/work/projects/spaces/[targetType]/[targetId]/permissions": "controlPlane",
  "/api/modules/work/projects/submissions/[id]": "workflowControl",
  "/api/modules/work/tasks/okr-control": "controlPlane",
  "/api/modules/work/tasks/reference-options": "lookupFragment",
  "/api/modules/work/tasks/spaces": "controlPlane",
  "/api/modules/work/tasks/spaces/[targetType]/[targetId]/permissions": "controlPlane",
  "/api/modules/work/tasks/submissions": "workflowControl",
  "/api/modules/work/tasks/submissions/[id]": "workflowControl",
  "/api/settings/account/api-key": "controlPlane",
  "/api/settings/account/api-catalog": "controlPlane",
  "/api/settings/account/avatar-library": "controlPlane",
  "/api/settings/account/company-options": "controlPlane",
  "/api/settings/account/notifications": "controlPlane",
  "/api/settings/account/portal-slots": "controlPlane",
  "/api/settings/account/preferred-departments": "controlPlane",
  "/api/settings/account/preferred-projects": "controlPlane",
  "/api/settings/account/profile": "controlPlane",
  "/api/settings/account/routine": "controlPlane",
  "/api/settings/account/spaces": "controlPlane",
  "/api/settings/account/spaces/[targetType]/[targetId]/permissions": "controlPlane",
  "/api/settings/admin/modules": "controlPlane",
  "/api/settings/admin/permission-grant-ledger": "controlPlane",
  "/api/settings/admin/permission-grants": "controlPlane",
  "/api/settings/admin/permissions": "controlPlane",
  "/api/settings/admin/projects": "controlPlane",
  "/api/settings/admin/system-config": "controlPlane",
  "/api/settings/admin/users": "controlPlane",
  "/api/settings/admin/workflow-ledger": "controlPlane",
  "/api/settings/admin/workflow-policies": "controlPlane",
  "/api/settings/api/open/clients": "controlPlane",
  "/api/settings/api/open/overview": "controlPlane",
};

const ROOT = process.cwd();
const API_ROOT = path.join(ROOT, "app/api");
const SOURCE_GROUPS: readonly (readonly WorkspaceAnalysisSourceRegistration[])[] = [
  ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  [...FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS, ...FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS],
  HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
];

const registrations = SOURCE_GROUPS.flat();
const sourceKeys = new Set(registrations.map(({ definition }) => definition.sourceKey));
const sourcesByRoute = new Map<string, string[]>();
const errors: string[] = [];

for (const group of SOURCE_GROUPS) {
  try {
    const catalog = createWorkspaceAnalysisSourceCatalog(group);
    catalog.validateReferences();
  } catch (error) {
    errors.push(`invalid source owner catalog: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const registration of registrations) {
  if (!registration.fieldCoverage) {
    errors.push(`registered source has no exhaustive public DTO field coverage: ${registration.definition.sourceKey}`);
  }
  const keys = sourcesByRoute.get(registration.adapter.path) ?? [];
  keys.push(registration.definition.sourceKey);
  sourcesByRoute.set(registration.adapter.path, keys);
}

const protectedBusinessGetRoutes = walkRouteFiles(API_ROOT)
  .filter((file) => exportsGet(fs.readFileSync(file, "utf8")))
  .map(routePattern)
  .filter((apiPath) => {
    const contract = findApiContract("GET", materializeRoute(apiPath));
    return contract?.access === "protected" && contract.apiKind === "business";
  })
  .sort();
const protectedRouteSet = new Set(protectedBusinessGetRoutes);

for (const [route, coverage] of Object.entries(EXPLICIT_ROUTE_COVERAGE)) {
  if (!protectedRouteSet.has(route)) errors.push(`stale explicit coverage: ${route}`);
  if (sourcesByRoute.has(route)) errors.push(`source-backed route must not be manually classified: ${route}`);
  if (coverage.disposition === "derived") {
    if (!coverage.sourceKeys.length) errors.push(`derived route has no sourceKeys: ${route}`);
    for (const sourceKey of coverage.sourceKeys) {
      if (!sourceKeys.has(sourceKey)) errors.push(`derived route references unknown source ${sourceKey}: ${route}`);
    }
  }
}

for (const [route, reviewedReason] of Object.entries(REVIEWED_AUTOMATIC_EXCLUSIONS)) {
  if (!protectedRouteSet.has(route)) {
    errors.push(`stale reviewed automatic exclusion: ${route}`);
    continue;
  }
  if (sourcesByRoute.has(route)) {
    errors.push(`source-backed route must be removed from reviewed automatic exclusions: ${route}`);
    continue;
  }
  if (EXPLICIT_ROUTE_COVERAGE[route]) {
    errors.push(`explicitly classified route must be removed from reviewed automatic exclusions: ${route}`);
    continue;
  }
  const automatic = automaticExclusion(route);
  if (!automatic) {
    errors.push(`reviewed automatic exclusion no longer matches an automatic category: ${route}`);
  } else if (automatic.reason !== reviewedReason) {
    errors.push(
      `reviewed automatic exclusion category changed: ${route} (${reviewedReason} -> ${automatic.reason})`,
    );
  }
}

for (const route of protectedBusinessGetRoutes) {
  if (sourcesByRoute.has(route) || EXPLICIT_ROUTE_COVERAGE[route]) continue;
  const automatic = automaticExclusion(route);
  if (automatic) {
    const reviewedReason = REVIEWED_AUTOMATIC_EXCLUSIONS[route];
    if (!reviewedReason) {
      errors.push(`unreviewed automatic exclusion: ${route} (${automatic.reason})`);
    }
    continue;
  }
  errors.push(`unclassified protected business GET: ${route}`);
}

for (const [adapterPath, keys] of sourcesByRoute) {
  if (!protectedRouteSet.has(adapterPath)) {
    errors.push(`registered source adapter has no protected business GET route: ${keys.join(", ")} -> ${adapterPath}`);
  }
}

if (errors.length) {
  console.error(["Workspace analysis source coverage failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exitCode = 1;
} else {
  const automaticExcludedCount = protectedBusinessGetRoutes.filter((route) => {
    if (sourcesByRoute.has(route) || EXPLICIT_ROUTE_COVERAGE[route]) return false;
    const automatic = automaticExclusion(route);
    return Boolean(automatic && REVIEWED_AUTOMATIC_EXCLUSIONS[route] === automatic.reason);
  }).length;
  const excludedCount = automaticExcludedCount
    + Object.values(EXPLICIT_ROUTE_COVERAGE).filter(({ disposition }) => disposition === "excluded").length;
  const derivedCount = Object.values(EXPLICIT_ROUTE_COVERAGE).filter(({ disposition }) => disposition === "derived").length;
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: {
        sourceKeyCount: sourceKeys.size,
        sourceBackedRouteCount: sourcesByRoute.size,
        derivedRouteCount: derivedCount,
        excludedRouteCount: excludedCount,
      },
      sources: registrations
        .map((registration) => {
          const { definition, adapter } = registration;
          const fieldCoverage = registration.fieldCoverage ?? [];
          return {
            sourceKey: definition.sourceKey,
            version: definition.version,
            label: definition.label,
            ownerModuleKey: definition.ownerModuleKey,
            apiPath: adapter.path,
            resourceKey: definition.authorization.resourceKey,
            requiredActions: definition.authorization.requiredActions,
            scopes: definition.scopeBindings,
            fieldCount: definition.fields.length,
            fieldCoverageSummary: {
              analytical: fieldCoverage.filter(({ disposition }) => disposition === "analytical").length,
              childSource: fieldCoverage.filter(({ disposition }) => disposition === "childSource").length,
              omitted: fieldCoverage.filter(({ disposition }) => disposition === "omit").length,
            },
            fieldCoverage,
          };
        })
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey) || left.version - right.version),
      routes: protectedBusinessGetRoutes.map((route) => {
        const registeredSources = sourcesByRoute.get(route);
        if (registeredSources) return { route, disposition: "source" as const, sourceKeys: registeredSources.sort() };
        const explicitCoverage = EXPLICIT_ROUTE_COVERAGE[route];
        if (explicitCoverage) return { route, ...explicitCoverage };
        return { route, ...automaticExclusion(route)! };
      }),
    }, null, 2));
  } else {
    console.log(
      `Workspace analysis source coverage passed: ${sourceKeys.size} sourceKeys, ${sourcesByRoute.size} source-backed routes, ${derivedCount} derived routes, ${excludedCount} exclusions.`,
    );
  }
}

function walkRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkRouteFiles(absolute);
    return entry.isFile() && entry.name === "route.ts" ? [absolute] : [];
  });
}

function exportsGet(source: string) {
  return /\bexport\s+(?:const|async\s+function|function)\s+GET\b/.test(source)
    || /\bexport\s*\{[^}]*\bGET\b[^}]*\}/s.test(source);
}

function routePattern(file: string) {
  const relative = path.relative(API_ROOT, file).split(path.sep).join("/");
  return `/api/${relative.replace(/\/route\.ts$/, "")}`;
}

function materializeRoute(route: string) {
  return route
    .replace(/\[\.\.\.[^\]]+\]/g, "sample")
    .replace(/\[(?:targetType|audienceType)\]/g, "department")
    .replace(/\[[^\]]+\]/g, "1");
}

function automaticExclusion(route: string): ExcludedCoverage | null {
  if (/\/(?:export|download|office-viewer|attachments)(?:\/|$)/.test(route)
      || /^\/api\/modules\/library\/basic-info\/documents\/.*\/preview$/.test(route)) {
    return { disposition: "excluded", reason: "binary", description: "文件、预览和导出响应不是稳定行数据集。" };
  }
  if (/\/(?:reference-options|autocomplete|search|group-account-options|entry-source-options|lookup-period)(?:\/|$)/.test(route)
      || /\/(?:department-codes|position-codes)(?:\/|$)/.test(route)) {
    return { disposition: "excluded", reason: "lookupFragment", description: "联想、搜索、编码候选和下拉选项不是完整数据集。" };
  }
  if (route.startsWith("/api/modules/finance/cost/operational-analytics/spaces/")) {
    return { disposition: "excluded", reason: "recursiveAnalysis", description: "模板、数据源目录、权限和运行结果不能递归成为自己的业务数据。" };
  }
  if (route.startsWith("/api/settings/") || route.startsWith("/api/agent/")) {
    return { disposition: "excluded", reason: "controlPlane", description: "账号、权限、配置、凭证和 Agent 运行态属于控制面。" };
  }
  if (/\/spaces(?:\/[^/]+\/[^/]+)?(?:\/permissions)?$/.test(route)
      || route.endsWith("/consolidation-rules")
      || route.endsWith("/permission-actions")
      || route.endsWith("/okr-control")
      || route.endsWith("/generated-sources")) {
    return { disposition: "excluded", reason: "controlPlane", description: "空间导航、权限矩阵、治理策略和生成任务属于控制面。" };
  }
  if (/\/submissions(?:\/\[id\])?$/.test(route)) {
    return { disposition: "excluded", reason: "workflowControl", description: "通用审批请求是工作流控制记录；业务事实应由获批后的业务读模型承载。" };
  }
  if (route.startsWith("/api/modules/docs/editor")) {
    return { disposition: "excluded", reason: "controlPlane", description: "文档模板、编辑会话和文档权限属于内容配置面，不是经营事实数据集。" };
  }
  return null;
}
