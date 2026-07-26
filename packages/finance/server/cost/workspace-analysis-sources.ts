import "server-only";

import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";

import type { CostAnalysisDTO } from "./cost-analysis";
import type { CostStructureDTO } from "./cost-structure";
import type { SalesSalaryDTO } from "./sales-salary";
import type { ShipmentDTO } from "./shipments";
import type { WorkshopReportDTO } from "./workshop-reports";
import {
  FINANCE_COST_ANALYSIS_FIELDS,
  FINANCE_COST_STRUCTURE_FIELDS,
  FINANCE_SALES_SALARY_FIELDS,
  FINANCE_SHIPMENT_ANALYSIS_FIELDS,
  FINANCE_WORKSHOP_REPORT_FIELDS,
} from "./workspace-analysis-source-fields";

const PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 200,
  maxPages: 20,
} as const;

const LIMITS = {
  maxRows: 4_000,
  maxGroups: 500,
  maxPageSize: 200,
  maxPages: 20,
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

const WORKSPACE_SCOPES = {
  personal: {
    mode: "workspace",
    description: "本源不按个人收窄，明确展示当前账号凭 finance.cost.read 可见的全公司数据。",
  },
  department: {
    mode: "workspace",
    description: "本源不按部门收窄，明确展示当前账号凭 finance.cost.read 可见的全公司数据。",
  },
  project: {
    mode: "workspace",
    description: "本源不按项目收窄，明确展示当前账号凭 finance.cost.read 可见的全公司数据。",
  },
} as const;

const DATE_PARAMETERS = [
  {
    key: "dateFrom",
    queryKey: "dateFrom",
    label: "开始日期",
    description: "事实日期范围开始；必须与结束日期同时提供。",
    kind: "date",
    requiredWith: ["dateTo"],
  },
  {
    key: "dateTo",
    queryKey: "dateTo",
    label: "结束日期",
    description: "事实日期范围结束；必须与开始日期同时提供。",
    kind: "date",
    requiredWith: ["dateFrom"],
  },
] as const;

const DATE_CONSTRAINTS = [{
  kind: "orderedDates",
  from: "dateFrom",
  to: "dateTo",
  description: "结束日期不能早于开始日期",
}] as const;

const SHIPMENT_PARAMETERS = [
  { key: "importId", queryKey: "importId", label: "导入批次 ID", description: "按成本导入批次精确筛选。", kind: "integer" },
  ...DATE_PARAMETERS,
  { key: "productName", queryKey: "productName", label: "产品", description: "按来源产品名称筛选。", kind: "text" },
  { key: "customerName", queryKey: "customerName", label: "客户", description: "按来源客户名称筛选。", kind: "text" },
] as const;

const PERIOD_PARAMETERS = [
  { key: "importId", queryKey: "importId", label: "导入批次 ID", description: "按成本导入批次精确筛选。", kind: "integer" },
  { key: "year", queryKey: "year", label: "年份", description: "按事实所属年份筛选。", kind: "integer" },
  { key: "month", queryKey: "month", label: "月份", description: "按事实所属月份筛选。", kind: "integer" },
  { key: "sourceFile", queryKey: "sourceFile", label: "来源文件", description: "按来源文件名筛选。", kind: "text" },
] as const;

export const FINANCE_SHIPMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ShipmentDTO>()({
  sourceKey: "finance.shipments",
  version: 1,
  label: "本人发货与回款",
  description: "以一条发货事实为粒度，按目标用户的员工销售归属强制收窄。",
  apiPath: "/api/modules/finance/cost/operational-analytics/shipments",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: {
    personal: {
      mode: "target",
      description: "系统强制使用目标用户 ID 解析在职员工销售归属。",
      query: { scopeType: "scopeType", scopeId: "scopeId" },
    },
  },
  parameters: SHIPMENT_PARAMETERS,
  parameterConstraints: DATE_CONSTRAINTS,
  fields: FINANCE_SHIPMENT_ANALYSIS_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_COST_SHIPMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ShipmentDTO>()({
  sourceKey: "finance.cost.shipments",
  version: 1,
  label: "发货与回款（全公司）",
  description: "以一条发货事实为粒度，沿用成本管理 finance.cost.read 的全公司可见范围。",
  apiPath: "/api/modules/finance/cost/shipments",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: SHIPMENT_PARAMETERS,
  parameterConstraints: DATE_CONSTRAINTS,
  fields: FINANCE_SHIPMENT_ANALYSIS_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_COST_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CostAnalysisDTO>()({
  sourceKey: "finance.cost.analysis",
  version: 1,
  label: "成本分析明细（全公司）",
  description: "以一条成本分析导入行为粒度，沿用成本管理 finance.cost.read 的全公司可见范围。",
  apiPath: "/api/modules/finance/cost/cost-analysis",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: PERIOD_PARAMETERS,
  fields: FINANCE_COST_ANALYSIS_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_COST_STRUCTURE_SOURCE = defineWorkspaceAnalysisReadModel<CostStructureDTO>()({
  sourceKey: "finance.cost.structure",
  version: 1,
  label: "成本构成明细（全公司）",
  description: "以一条产品月度成本构成事实为粒度，沿用成本管理 finance.cost.read 的全公司可见范围。",
  apiPath: "/api/modules/finance/cost/cost-structure",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: [
    ...PERIOD_PARAMETERS,
    { key: "productName", queryKey: "productName", label: "产品", description: "按来源产品名称筛选。", kind: "text" },
  ],
  fields: FINANCE_COST_STRUCTURE_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_COST_SALES_SALARY_SOURCE = defineWorkspaceAnalysisReadModel<SalesSalaryDTO>()({
  sourceKey: "finance.cost.sales-salary",
  version: 1,
  label: "销售工资明细（全公司）",
  description: "以一条销售工资事实为粒度，沿用成本管理 finance.cost.read；受限标签不阻断已授权查询。",
  apiPath: "/api/modules/finance/cost/sales-salary",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: PERIOD_PARAMETERS,
  fields: FINANCE_SALES_SALARY_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_COST_WORKSHOP_REPORTS_SOURCE = defineWorkspaceAnalysisReadModel<WorkshopReportDTO>()({
  sourceKey: "finance.cost.workshop-reports",
  version: 1,
  label: "历史车间报表明细（全公司）",
  description: "以一条历史车间报表归档事实为粒度，沿用成本管理 finance.cost.read；人员和工分敏感级不形成第二套读取权限。",
  apiPath: "/api/modules/finance/cost/workshop-reports",
  rowsPath: "data",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: [
    ...PERIOD_PARAMETERS,
    { key: "productName", queryKey: "productName", label: "产品", description: "按来源产品名称筛选。", kind: "text" },
  ],
  fields: FINANCE_WORKSHOP_REPORT_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  FINANCE_SHIPMENTS_ANALYSIS_SOURCE,
  FINANCE_COST_SHIPMENTS_ANALYSIS_SOURCE,
  FINANCE_COST_ANALYSIS_SOURCE,
  FINANCE_COST_STRUCTURE_SOURCE,
  FINANCE_COST_SALES_SALARY_SOURCE,
  FINANCE_COST_WORKSHOP_REPORTS_SOURCE,
] as const;
