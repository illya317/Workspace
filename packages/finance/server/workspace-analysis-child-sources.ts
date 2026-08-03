import "server-only";

import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";

import type { StandardVoucherListRow } from "./ledger/voucher-service";
import type { listImports } from "./cost/import";
import type { ReclassEntry } from "@workspace/finance/types";
import type {
  ConsolidatedOutputEntityAmount,
  ConsolidatedOutputLine,
  ConsolidationEntityCoverage,
  FinanceGroupAccountMappedLocalAccountRow,
  StatementReportType,
} from "@workspace/finance/types";
import type { ReclassResultRow } from "./ledger/reclass-results/types";
import type { AccountDetail, ReclassAdjustment } from "./statements/report-detail";

type VoucherRow = StandardVoucherListRow;
type VoucherItemRow = VoucherRow["items"][number];
type CostImportRow = Awaited<ReturnType<typeof listImports>>["data"][number];

export type FinanceAccountMappingRow = {
  accountId: number;
  companyCode: string;
  accountCode: string;
  mappingId: number;
  mappingMethod: string;
  mappingUpdatedAt: string;
  groupAccountId: number | null;
  groupAccountCode: string | null;
  groupAccountName: string | null;
};

export type FinanceVoucherCashFlowAllocationRow = {
  voucherId: number;
  voucherNo: string;
  allocationId: number;
  ownerVoucherItemId: number | null;
  counterpartItemId: number | null;
  direction: string;
  amount: number;
  cashFlowItemSourceCode: string;
  cashFlowItemSourceName: string;
};

export type FinanceJsonLeafRow = {
  entityKind: "voucher" | "voucherItem";
  voucherId: number;
  entityId: number;
  jsonPointer: string;
  valueKind: "null" | "string" | "number" | "boolean";
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};

export type FinanceGroupAccountYearRow = { groupAccountId: number; accountCode: string; year: number };
export type FinanceGroupAccountParentRow = {
  groupAccountId: number;
  accountCode: string;
  accountName: string;
  parentGroupAccountId: number;
  parentGroupAccountCode: string;
  parentGroupAccountName: string;
};
export type FinanceGroupAccountParentRecommendationRow = {
  groupAccountId: number;
  accountCode: string;
  kind: "mapped" | "top_level" | "unresolved";
  localParentCode: string | null;
  localParentName: string | null;
  suggestedParentGroupAccountId: number | null;
  suggestedParentCode: string | null;
  suggestedParentName: string | null;
};

export type FinanceConsolidatedLineRow = Omit<ConsolidatedOutputLine, "entityAmounts"> & {
  reportType: StatementReportType;
  reportLabel: string;
};
export type FinanceConsolidatedEntityAmountRow = ConsolidatedOutputEntityAmount & {
  reportType: StatementReportType;
  lineCode: string;
};
export type FinanceConsolidationEntityRow = Pick<ConsolidationEntityCoverage,
  "entitySnapshotId" | "companyId" | "relationId" | "code" | "name" | "fullName" | "role" | "parentCode" | "parentName" | "shareRatio" | "status"
> & {
  balanceSheetKind: string;
  balanceSheetStatus: string;
  balanceSheetLineCount: number;
  incomeStatementKind: string;
  incomeStatementStatus: string;
  incomeStatementLineCount: number;
  cashFlowKind: string;
  cashFlowStatus: string;
  cashFlowLineCount: number;
};

const PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const LIMITS = { maxRows: 4_000, maxGroups: 500, maxPageSize: 200, maxPages: 20, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 } as const;
const SCOPES = {
  personal: { mode: "workspace", description: "沿用 Finance 原业务 GET 权限；数据本身不按个人收窄。" },
  department: { mode: "workspace", description: "沿用 Finance 原业务 GET 权限；数据本身不按部门收窄。" },
  project: { mode: "workspace", description: "沿用 Finance 原业务 GET 权限；数据本身不按项目收窄。" },
} as const;
const company = { key: "companyCode", queryKey: "companyCode", label: "公司编码", description: "公司或账套编码。", kind: "text" } as const;
const year = { key: "year", queryKey: "year", label: "年度", description: "会计年度。", kind: "integer" } as const;
const month = { key: "month", queryKey: "month", label: "月份", description: "会计月份。", kind: "integer" } as const;
const keyword = { key: "keyword", queryKey: "keyword", label: "关键词", description: "沿用父列表关键词。", kind: "text" } as const;
const f = (label: string, description: string, valueKind: "text" | "number" | "integer" | "currency" | "date" | "boolean", sensitivity: "internal" | "confidential" = "internal") => ({
  classification: "field" as const, label, description, valueKind, sensitivity, exportPolicy: "allowed" as const,
});
const derived = (description: string) => ({ classification: "omit" as const, reason: "derivedDuplicate" as const, description });

const accountParameters = [company, year, keyword,
  { key: "subjectLevel", queryKey: "subjectLevel", label: "科目层级", description: "按科目层级筛选。", kind: "integer" },
  { key: "scope", queryKey: "scope", label: "映射范围", description: "mapped、unmapped、inactive 或 all。", kind: "text" },
  { key: "reviewStatus", queryKey: "reviewStatus", label: "复核状态", description: "映射复核状态。", kind: "text" },
] as const;
const voucherParameters = [company, year, month, keyword,
  { key: "periodId", queryKey: "periodId", label: "期间 ID", description: "按会计期间筛选。", kind: "integer" },
  { key: "status", queryKey: "status", label: "状态", description: "凭证状态。", kind: "text" },
] as const;
const groupParameters = [keyword,
  { key: "policyVersionId", queryKey: "policyVersionId", label: "政策版本 ID", description: "集团会计政策版本。", kind: "integer" },
  { key: "category", queryKey: "category", label: "科目类别", description: "集团科目类别。", kind: "text" },
  { key: "reviewStatus", queryKey: "reviewStatus", label: "复核状态", description: "集团科目复核状态。", kind: "text" },
] as const;

export const FINANCE_LEDGER_ACCOUNT_MAPPINGS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAccountMappingRow>()({
  sourceKey: "finance.ledger.account-mappings", version: 1, label: "公司科目集团映射", description: "从完整有界公司科目列表规范化的一科目一映射事实。",
  apiPath: "/api/modules/finance/ledger/accounts", rowsPath: "data.mapping", totalPath: "total", scopes: SCOPES, parameters: accountParameters,
  fields: {
    accountId: f("公司科目 ID", "公司科目稳定标识。", "integer"), companyCode: f("公司编码", "公司科目所属公司。", "text"),
    accountCode: f("公司科目编码", "公司科目编码。", "text"), mappingId: f("映射 ID", "版本化集团映射稳定标识。", "integer"),
    mappingMethod: f("映射方法", "映射建立或复核方法。", "text"), mappingUpdatedAt: f("映射更新时间", "映射最近更新时间。", "date"),
    groupAccountId: f("集团科目 ID", "当前公开映射解析到的集团科目标识；映射目标已不可用时为空。", "integer"),
    groupAccountCode: f("集团科目编码", "当前公开映射解析到的集团科目编码。", "text"),
    groupAccountName: f("集团科目名称", "当前公开映射解析到的集团科目名称。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_VOUCHER_ITEMS_SOURCE = defineWorkspaceAnalysisReadModel<VoucherItemRow>()({
  sourceKey: "finance.ledger.voucher-items", version: 2, label: "凭证明细", description: "从完整有界凭证父集规范化的借贷分录事实。",
  apiPath: "/api/modules/finance/ledger/vouchers", rowsPath: "data.items", totalPath: "total", scopes: SCOPES, parameters: voucherParameters,
  fields: {
    id: f("分录 ID", "凭证明细稳定标识。", "integer"), voucherId: f("凭证 ID", "所属凭证稳定标识。", "integer"), accountId: f("科目 ID", "关联公司科目。", "integer"),
    debit: f("借方金额", "分录借方金额。", "currency"), credit: f("贷方金额", "分录贷方金额。", "currency"), description: f("摘要", "分录摘要。", "text", "confidential"),
    relatedEntity: f("关联对象", "摘要识别的关联对象。", "text", "confidential"), sortOrder: f("分录序号", "凭证内分录顺序。", "integer"),
    importFingerprint: f("导入指纹", "来源导入去重指纹。", "text", "confidential"), sourceFile: f("来源文件", "导入来源文件。", "text", "confidential"),
    sourceSheet: f("来源工作表", "导入来源工作表。", "text"), sourceRow: f("来源行", "导入来源行号。", "integer"), sourceSystem: f("来源系统", "分录来源系统。", "text"),
    sourceDatabase: f("来源数据库", "分录来源数据库。", "text", "confidential"), sourceKey: f("来源键", "来源分录稳定键。", "text", "confidential"),
    currencyCode: f("原币币种", "分录原币币种。", "text"), exchangeRate: f("汇率", "分录原币汇率。", "number"), originalDebit: f("原币借方", "原币借方金额。", "currency"),
    originalCredit: f("原币贷方", "原币贷方金额。", "currency"), capitalHistoricalAmountCny: f("资本历史人民币金额", "期初或累计资本凭证经受控证据确认的历史折算人民币金额。", "currency", "confidential"),
    capitalEvidenceKind: f("资本证据类型", "区分期初凭证和累计凭证。", "text"), capitalEvidence: f("资本历史证据", "历史人民币金额的复核依据。", "text", "confidential"),
    settlementStyle: f("结算方式", "来源结算方式。", "text"), settlementNo: f("结算号", "来源结算号。", "text", "confidential"),
    settlementDate: f("结算日期", "来源结算日期。", "date"), sourceMetadata: { classification: "childSource", sourceKey: "finance.ledger.voucher-metadata", description: "分录动态 JSON 以 JSON Pointer 叶子事实展开。" },
    importId: f("导入批次 ID", "来源导入批次。", "integer"), account: derived("科目对象可由 accountId 与公司科目源重建。"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_VOUCHER_CASH_FLOW_ALLOCATIONS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceVoucherCashFlowAllocationRow>()({
  sourceKey: "finance.ledger.voucher-cash-flow-allocations", version: 1, label: "凭证现金流分配", description: "从完整有界凭证父集规范化的现金流分配事实。",
  apiPath: "/api/modules/finance/ledger/vouchers", rowsPath: "data.cashFlowAllocations", totalPath: "total", scopes: SCOPES, parameters: voucherParameters,
  fields: {
    voucherId: f("凭证 ID", "所属凭证。", "integer"), voucherNo: f("凭证号", "所属凭证号。", "text"), allocationId: f("分配 ID", "现金流分配稳定标识。", "integer"),
    ownerVoucherItemId: f("现金分录 ID", "现金类凭证明细。", "integer"), counterpartItemId: f("对手分录 ID", "非现金对手分录。", "integer"),
    direction: f("流向", "现金流入或流出方向。", "text"), amount: f("金额", "现金流分配金额。", "currency"),
    cashFlowItemSourceCode: f("现金流项目编码", "来源现金流项目编码。", "text"), cashFlowItemSourceName: f("现金流项目名称", "来源现金流项目名称。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_VOUCHER_METADATA_SOURCE = defineWorkspaceAnalysisReadModel<FinanceJsonLeafRow>()({
  sourceKey: "finance.ledger.voucher-metadata", version: 1, label: "凭证来源元数据", description: "凭证及分录动态 JSON 的 JSON Pointer 叶子事实；完整保留标量值而不固定来源字段。",
  apiPath: "/api/modules/finance/ledger/vouchers", rowsPath: "data.sourceMetadata", totalPath: "total", scopes: SCOPES, parameters: voucherParameters,
  fields: {
    entityKind: f("实体类型", "voucher 或 voucherItem。", "text"), voucherId: f("凭证 ID", "所属凭证。", "integer"), entityId: f("实体 ID", "凭证或分录标识。", "integer"),
    jsonPointer: f("JSON Pointer", "元数据叶子路径。", "text"), valueKind: f("值类型", "null、string、number 或 boolean。", "text"),
    textValue: f("文本值", "字符串值。", "text", "confidential"), numberValue: f("数值", "数值型叶子。", "number"), booleanValue: f("布尔值", "布尔型叶子。", "boolean"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_GROUP_ACCOUNT_YEARS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceGroupAccountYearRow>()({
  sourceKey: "finance.ledger.group-account-years", version: 1, label: "集团科目适用年度", description: "集团科目与已映射公司科目年度的一对多关系。",
  apiPath: "/api/modules/finance/ledger/group-account-catalog", rowsPath: "rows.years", totalPath: "pagination.total", scopes: SCOPES, parameters: groupParameters,
  fields: { groupAccountId: f("集团科目 ID", "集团科目标识。", "integer"), accountCode: f("集团科目编码", "集团科目编码。", "text"), year: f("年度", "存在映射公司科目的年度。", "integer") },
  pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_GROUP_ACCOUNT_PARENTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceGroupAccountParentRow>()({
  sourceKey: "finance.ledger.group-account-parents", version: 1, label: "集团科目实际父级", description: "将集团科目目录公开的实际父级规范化为一科目一父科目关系，与诊断建议分开。",
  apiPath: "/api/modules/finance/ledger/group-account-catalog", rowsPath: "rows.parent", totalPath: "pagination.total", scopes: SCOPES, parameters: groupParameters,
  fields: {
    groupAccountId: f("集团科目 ID", "集团科目标识。", "integer"), accountCode: f("集团科目编码", "集团科目编码。", "text"), accountName: f("集团科目名称", "集团科目名称。", "text"),
    parentGroupAccountId: f("实际父科目 ID", "当前集团科目的实际父级标识。", "integer"), parentGroupAccountCode: f("实际父科目编码", "当前集团科目的实际父级编码。", "text"),
    parentGroupAccountName: f("实际父科目名称", "当前集团科目的实际父级名称。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_GROUP_ACCOUNT_PARENT_RECOMMENDATIONS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceGroupAccountParentRecommendationRow>()({
  sourceKey: "finance.ledger.group-account-parent-recommendations", version: 1, label: "集团科目父级建议", description: "将父级诊断联合对象规范化为一科目一建议关系。",
  apiPath: "/api/modules/finance/ledger/group-account-catalog", rowsPath: "rows.parentRecommendation", totalPath: "pagination.total", scopes: SCOPES, parameters: groupParameters,
  fields: {
    groupAccountId: f("集团科目 ID", "集团科目标识。", "integer"), accountCode: f("集团科目编码", "集团科目编码。", "text"), kind: f("建议类型", "mapped、top_level 或 unresolved。", "text"),
    localParentCode: f("来源父科目编码", "来源公司父科目编码。", "text"), localParentName: f("来源父科目名称", "来源公司父科目名称。", "text"),
    suggestedParentGroupAccountId: f("建议父科目 ID", "建议集团父科目标识。", "integer"), suggestedParentCode: f("建议父科目编码", "建议集团父科目编码。", "text"),
    suggestedParentName: f("建议父科目名称", "建议集团父科目名称。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_GROUP_ACCOUNT_MAPPED_LOCAL_ACCOUNTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceGroupAccountMappedLocalAccountRow>()({
  sourceKey: "finance.ledger.group-account-mapped-local-accounts", version: 1, label: "集团科目公司映射明细", description: "指定政策版本和集团科目下的可信公司科目映射。",
  apiPath: "/api/modules/finance/ledger/group-account-catalog/[id]/mappings", rowsPath: "rows", totalPath: "rows.length", scopes: SCOPES,
  parameters: [
    { key: "groupAccountId", queryKey: "groupAccountId", label: "集团科目 ID", description: "集团科目稳定标识。", kind: "integer", required: true },
    { key: "policyVersionId", queryKey: "policyVersionId", label: "政策版本 ID", description: "集团会计政策版本。", kind: "integer", required: true },
  ],
  fields: {
    mappingId: f("映射 ID", "集团科目映射稳定标识。", "integer"), companyCode: f("公司编码", "公司科目所属公司。", "text"), companyName: f("公司名称", "公司展示名称。", "text"),
    sourceScopeKey: f("来源范围键", "来源系统、数据库与账套组合范围。", "text", "confidential"), sourceSystem: f("来源系统", "公司科目来源系统。", "text"),
    sourceDatabase: f("来源数据库", "公司科目来源数据库。", "text", "confidential"), sourceLedger: f("来源账套", "公司科目来源账套。", "text"),
    localAccountCode: f("公司科目编码", "映射到本集团科目的公司科目编码。", "text"), localAccountName: f("公司科目名称", "映射到本集团科目的公司科目名称。", "text"),
    localCategory: f("公司科目类别", "公司科目类别。", "text"), localBalanceDirection: f("余额方向", "公司科目余额方向。", "text"),
    years: derived("适用年度可由公司科目源按 sourceScopeKey 和 localAccountCode 聚合重建。"), latestYear: f("最近年度", "映射最近适用年度。", "integer"),
    mappingMethod: f("映射方法", "manual_override、hierarchy_match 或自动精确映射。", "text"), reviewClass: f("复核分类", "reviewed 或 confirmed。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

const reportDetailParameters = [
  { ...company, required: true }, { ...year, required: true }, { ...month, required: true },
  { key: "periodKind", queryKey: "periodKind", label: "期间粒度", description: "year、quarter 或 month。", kind: "text" },
  { key: "codes", queryKey: "codes", label: "科目编码", description: "一个或多个科目编码前缀，以逗号分隔。", kind: "text", required: true },
] as const;

export const FINANCE_STATEMENT_ACCOUNT_DETAILS_SOURCE = defineWorkspaceAnalysisReadModel<AccountDetail>()({
  sourceKey: "finance.statements.account-details", version: 1, label: "报表科目取数明细", description: "指定报表科目编码下的叶子科目期初、本期和期末金额。",
  apiPath: "/api/modules/finance/statements/reports/detail", rowsPath: "details", totalPath: "details.length", scopes: SCOPES, parameters: reportDetailParameters,
  fields: {
    code: f("科目编码", "叶子科目编码。", "text"), name: f("科目名称", "叶子科目名称。", "text"), category: f("科目类别", "科目类别。", "text"), balanceDirection: f("余额方向", "科目余额方向。", "text"),
    openingDebit: f("期初借方", "期初借方余额。", "currency"), openingCredit: f("期初贷方", "期初贷方余额。", "currency"), currentDebit: f("本期借方", "本期借方变动。", "currency"),
    currentCredit: f("本期贷方", "本期贷方变动。", "currency"), closing: f("期末净额", "期末净额。", "currency"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_STATEMENT_RECLASS_ADJUSTMENTS_SOURCE = defineWorkspaceAnalysisReadModel<ReclassAdjustment>()({
  sourceKey: "finance.statements.reclass-adjustments", version: 1, label: "报表重分类调整", description: "影响指定报表科目编码的已批准或已调整重分类明细。",
  apiPath: "/api/modules/finance/statements/reports/detail", rowsPath: "reclassAdjustments", totalPath: "reclassAdjustments.length", scopes: SCOPES, parameters: reportDetailParameters,
  fields: {
    sourceAccount: f("来源科目", "重分类来源科目编码。", "text"), targetAccount: f("目标科目", "重分类目标科目编码。", "text"), amount: f("调整金额", "重分类调整金额。", "currency"),
    status: f("状态", "重分类状态。", "text"), type: f("影响类型", "deduction 或 addition。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

const consolidationParameters = [
  { key: "parentCompanyId", queryKey: "parentCompanyId", label: "母公司 ID", description: "合并母公司稳定标识。", kind: "integer" },
  { ...year }, { ...month }, { key: "periodKind", queryKey: "periodKind", label: "期间粒度", description: "year、quarter 或 month。", kind: "text" },
  { key: "batchId", queryKey: "batchId", label: "合并批次 ID", description: "选择已存在的合并批次。", kind: "integer" },
] as const;

export const FINANCE_CONSOLIDATION_ENTITIES_SOURCE = defineWorkspaceAnalysisReadModel<FinanceConsolidationEntityRow>()({
  sourceKey: "finance.statements.consolidation-entities", version: 1, label: "合并范围实体", description: "合并范围内逐公司的股权比例和三表来源覆盖状态。",
  apiPath: "/api/modules/finance/statements/consolidation", rowsPath: "entities", totalPath: "entities.length", scopes: SCOPES, parameters: consolidationParameters,
  fields: {
    entitySnapshotId: f("实体快照 ID", "批次冻结实体标识。", "integer"), companyId: f("公司 ID", "公司稳定标识。", "integer"), relationId: f("股权关系 ID", "合并范围股权关系标识。", "integer"),
    code: f("公司编码", "公司编码。", "text"), name: f("公司名称", "公司展示名称。", "text"), fullName: f("公司全称", "公司全称。", "text"), role: f("合并角色", "母公司或子公司。", "text"),
    parentCode: f("直接母公司编码", "直接母公司编码。", "text"), parentName: f("直接母公司名称", "直接母公司名称。", "text"), shareRatio: f("持股比例", "直接持股比例。", "number"), status: f("就绪状态", "ready、attention 或 blocked。", "text"),
    balanceSheetKind: f("资产负债表来源", "资产负债表来源类型。", "text"), balanceSheetStatus: f("资产负债表状态", "资产负债表来源状态。", "text"), balanceSheetLineCount: f("资产负债表行数", "资产负债表来源行数。", "integer"),
    incomeStatementKind: f("利润表来源", "利润表来源类型。", "text"), incomeStatementStatus: f("利润表状态", "利润表来源状态。", "text"), incomeStatementLineCount: f("利润表行数", "利润表来源行数。", "integer"),
    cashFlowKind: f("现金流量表来源", "现金流量表来源类型。", "text"), cashFlowStatus: f("现金流量表状态", "现金流量表来源状态。", "text"), cashFlowLineCount: f("现金流量表行数", "现金流量表来源行数。", "integer"),
  }, pagination: PAGINATION, limits: LIMITS,
});

const consolidatedReportParameters = [{ key: "batchId", queryKey: "batchId", label: "合并批次 ID", description: "已存在的合并批次稳定标识。", kind: "integer", required: true }] as const;
export const FINANCE_CONSOLIDATED_LINES_SOURCE = defineWorkspaceAnalysisReadModel<FinanceConsolidatedLineRow>()({
  sourceKey: "finance.statements.consolidated-lines", version: 1, label: "合并报表行", description: "指定合并批次的资产负债表、利润表和现金流量表行。",
  apiPath: "/api/modules/finance/statements/consolidation/batches/[batchId]/report", rowsPath: "report.statements.lines", totalPath: "report.statements.lines.length", scopes: SCOPES, parameters: consolidatedReportParameters,
  fields: {
    reportType: f("报表类型", "balanceSheet、incomeStatement 或 cashFlow。", "text"), reportLabel: f("报表名称", "合并报表名称。", "text"), lineCode: f("报表行编码", "报表行稳定编码。", "text"),
    label: f("报表行名称", "报表行名称。", "text"), code: f("科目编码", "对应科目编码或编码前缀。", "text"), amount: f("本期金额", "合并调整后本期金额。", "currency"), currentMonthAmount: f("本月金额", "本月合并金额。", "currency"),
    previousAmount: f("上期金额", "比较期间金额。", "currency"), section: f("报表分区", "报表分区。", "text"), side: f("列示方向", "借方或贷方。", "text"), direction: f("现金方向", "现金流入、流出或净额。", "text"),
    subtract: f("是否减项", "报表行是否以减项列示。", "boolean"), isHeader: f("是否标题", "报表行是否为标题。", "boolean"), isTotal: f("是否小计", "报表行是否为小计。", "boolean"), isGrandTotal: f("是否总计", "报表行是否为总计。", "boolean"),
    sourceAmount: f("单体来源金额", "合并前单体来源金额。", "currency"), adjustmentAmount: f("抵销调整金额", "合并抵销调整金额。", "currency"), currentMonthSourceAmount: f("本月来源金额", "本月单体来源金额。", "currency"),
    currentMonthAdjustmentAmount: f("本月调整金额", "本月抵销调整金额。", "currency"), previousSourceAmount: f("上期来源金额", "上期单体来源金额。", "currency"), previousAdjustmentAmount: f("上期调整金额", "上期抵销调整金额。", "currency"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_CONSOLIDATED_ENTITY_AMOUNTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceConsolidatedEntityAmountRow>()({
  sourceKey: "finance.statements.consolidated-entity-amounts", version: 1, label: "合并报表公司贡献", description: "合并报表行按纳入合并范围公司的折算贡献金额。",
  apiPath: "/api/modules/finance/statements/consolidation/batches/[batchId]/report", rowsPath: "report.statements.lines.entityAmounts", totalPath: "report.statements.lines.entityAmounts.length", scopes: SCOPES, parameters: consolidatedReportParameters,
  fields: {
    reportType: f("报表类型", "所属合并报表类型。", "text"), lineCode: f("报表行编码", "所属报表行稳定编码。", "text"), entitySnapshotId: f("实体快照 ID", "批次冻结实体标识。", "integer"),
    companyCode: f("公司编码", "合并范围公司编码。", "text"), companyName: f("公司名称", "合并范围公司名称。", "text"), role: f("合并角色", "parent 或 subsidiary。", "text"),
    amount: f("本期贡献金额", "本期折算贡献金额。", "currency"), currentMonthAmount: f("本月贡献金额", "本月折算贡献金额。", "currency"), previousAmount: f("上期贡献金额", "比较期间折算贡献金额。", "currency"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_COST_IMPORTS_SOURCE = defineWorkspaceAnalysisReadModel<CostImportRow>()({
  sourceKey: "finance.cost.imports", version: 1, label: "成本导入批次", description: "成本资料导入批次、来源和质量计数元数据。",
  apiPath: "/api/modules/finance/cost/imports", rowsPath: "data", totalPath: "pagination.total", scopes: SCOPES,
  parameters: [{ key: "importId", queryKey: "importId", label: "导入批次 ID", description: "按成本导入批次精确筛选。", kind: "integer" }],
  fields: {
    id: f("批次 ID", "成本导入批次稳定标识。", "integer"), profile: f("导入类型", "成本资料 profile。", "text"), year: f("年度", "资料年度。", "integer"),
    sourceFile: f("来源文件", "导入来源文件名。", "text", "confidential"), sourcePath: f("来源路径", "导入来源内部路径。", "text", "confidential"),
    normalizedJsonPath: f("规范化路径", "规范化中间资料内部路径。", "text", "confidential"), checksum: f("校验和", "来源资料校验和。", "text"), status: f("状态", "导入状态。", "text"),
    recordCount: f("记录数", "导入记录数量。", "integer"), warningCount: f("警告数", "导入警告数量。", "integer"), errorCount: f("错误数", "导入错误数量。", "integer"),
    importedBy: f("导入人", "来源记录的导入人。", "text", "confidential"), importedAt: f("导入时间", "导入时间。", "date"), createdAt: f("创建时间", "批次创建时间。", "date"), updatedAt: f("更新时间", "批次更新时间。", "date"),
  }, pagination: PAGINATION, limits: LIMITS,
});

const reclassResultFields = {
  id: f("结果 ID", "重分类结果标识。", "integer"), periodId: f("期间 ID", "会计期间。", "integer"), voucherItemId: f("凭证明细 ID", "来源分录。", "integer"),
  sourceMissing: f("来源已删除", "来源分录是否已删除。", "boolean"), voucherNo: f("凭证号", "来源凭证号。", "text"), voucherDate: f("凭证日期", "来源凭证日期。", "date"),
  relatedEntity: f("关联对象", "来源关联对象。", "text", "confidential"), description: f("摘要", "来源摘要。", "text", "confidential"), sourceAccount: f("来源科目", "来源科目编码。", "text"),
  sourceAccountName: f("来源科目名称", "来源科目名称。", "text"), abnormalSide: f("异常方向", "异常余额方向。", "text"), itemDebit: f("分录借方", "来源借方金额。", "currency"),
  itemCredit: f("分录贷方", "来源贷方金额。", "currency"), targetAccount: f("目标科目", "目标科目编码。", "text"), amount: f("金额", "重分类金额。", "currency"),
  status: f("状态", "重分类状态。", "text"), kind: f("结果类型", "派生结果类型。", "text"), suggestedTarget: f("建议目标", "系统建议目标。", "text"),
  note: f("备注", "复核备注。", "text", "confidential"), adjustedBy: f("调整人 ID", "调整账号。", "integer", "confidential"), adjustedByName: f("调整人", "调整人名称。", "text", "confidential"),
  adjustedAt: f("调整时间", "最近调整时间。", "date"),
} as const;

export const FINANCE_LEDGER_RECLASS_ALL_ITEMS_SOURCE = defineWorkspaceAnalysisReadModel<ReclassResultRow>()({
  sourceKey: "finance.ledger.reclass-all-items", version: 1, label: "重分类全量项目", description: "指定期间的正常、待处理、已批准、已调整及已拒绝重分类项目；超过上限直接失败。",
  apiPath: "/api/modules/finance/ledger/reclass-results/all-items", rowsPath: "items", totalPath: "total", scopes: SCOPES,
  parameters: [{ key: "periodId", queryKey: "periodId", label: "期间 ID", description: "会计期间稳定标识。", kind: "integer", required: true }],
  fields: reclassResultFields, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_LEDGER_RECLASS_WORKBENCH_SOURCE = defineWorkspaceAnalysisReadModel<ReclassEntry>()({
  sourceKey: "finance.ledger.reclass-workbench", version: 1, label: "重分类工作台", description: "公司期间科目余额、规则、调整和历史合并形成的重分类工作行。",
  apiPath: "/api/modules/finance/ledger/schedules/reclassify", rowsPath: "entries", totalPath: "entries.length", scopes: SCOPES,
  parameters: [{ ...company, required: true }, { ...year, required: true }, { ...month, required: true }],
  fields: {
    id: f("工作行 ID", "重分类工作行稳定键。", "text"), periodId: f("期间 ID", "会计期间。", "integer"), accountCode: f("科目编码", "来源科目编码。", "text"),
    accountName: f("科目名称", "来源科目名称。", "text"), balanceSide: f("余额方向", "当前余额方向。", "text"), naturalSide: f("正常方向", "科目正常余额方向。", "text"),
    closingDebit: f("期末借方", "期末借方余额。", "currency"), closingCredit: f("期末贷方", "期末贷方余额。", "currency"), amount: f("处理金额", "重分类处理金额。", "currency"),
    currentAbnormalAmount: f("当前异常额", "当前辅助口径异常金额。", "currency"), stale: f("已过期", "历史调整是否已被新事实覆盖。", "boolean"), classification: f("分类", "工作行分类。", "text"),
    status: f("状态", "工作行状态。", "text"), decision: f("决策", "重分类或无需重分类。", "text"), historicalMethod: f("历史方式", "历史处理方式。", "text"),
    targetAccountCode: f("目标科目编码", "目标科目编码。", "text"), targetAccountName: f("目标科目名称", "目标科目名称。", "text"), sourceType: f("来源类型", "工作行来源。", "text"),
    detailCount: f("明细数", "支撑明细数量。", "integer"), abnormalSide: f("异常方向", "异常余额方向。", "text"), basis: f("计算口径", "科目净额或往来总额。", "text"),
    ruleId: f("规则 ID", "适用规则标识。", "integer"), adjustmentId: f("调整 ID", "适用调整标识。", "integer"), historyAt: f("历史时间", "历史处理时间。", "date"),
    archiveReason: f("归档原因", "历史调整归档原因。", "text"), reason: f("判断理由", "系统判断理由。", "text"),
  }, pagination: PAGINATION, limits: LIMITS,
});

export const FINANCE_WORKSPACE_ANALYSIS_CHILD_SOURCE_REGISTRATIONS = [
  FINANCE_LEDGER_ACCOUNT_MAPPINGS_SOURCE,
  FINANCE_LEDGER_VOUCHER_ITEMS_SOURCE,
  FINANCE_LEDGER_VOUCHER_CASH_FLOW_ALLOCATIONS_SOURCE,
  FINANCE_LEDGER_VOUCHER_METADATA_SOURCE,
  FINANCE_LEDGER_GROUP_ACCOUNT_YEARS_SOURCE,
  FINANCE_LEDGER_GROUP_ACCOUNT_PARENTS_SOURCE,
  FINANCE_LEDGER_GROUP_ACCOUNT_PARENT_RECOMMENDATIONS_SOURCE,
  FINANCE_LEDGER_GROUP_ACCOUNT_MAPPED_LOCAL_ACCOUNTS_SOURCE,
  FINANCE_STATEMENT_ACCOUNT_DETAILS_SOURCE,
  FINANCE_STATEMENT_RECLASS_ADJUSTMENTS_SOURCE,
  FINANCE_CONSOLIDATION_ENTITIES_SOURCE,
  FINANCE_CONSOLIDATED_LINES_SOURCE,
  FINANCE_CONSOLIDATED_ENTITY_AMOUNTS_SOURCE,
  FINANCE_COST_IMPORTS_SOURCE,
  FINANCE_LEDGER_RECLASS_ALL_ITEMS_SOURCE,
  FINANCE_LEDGER_RECLASS_WORKBENCH_SOURCE,
] as const;
