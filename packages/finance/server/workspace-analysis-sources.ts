import "server-only";
import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  FinanceAssetAdjustmentDto,
  FinanceAssetCardDto,
  FinanceAssetPeriodRowDto,
  FinanceCounterpartyBalanceRow,
  FinanceGroupAccountCatalogRow,
  RuleCandidate,
} from "@workspace/finance/types";
import type { ReclassResultRow } from "./ledger/reclass-results/types";
import type { listFinanceAccounts } from "./ledger/accounts";
import type { listFinanceBalances } from "./ledger/balance-api";
import type { listFinancePeriods } from "./ledger/periods";
import type { StandardVoucherListRow } from "./ledger/voucher-service";
import type { listBudgetVersions } from "./budget/budget-version";
import type { DirectReportLine } from "./statements/reports/direct";
type FinanceAccountRow = Awaited<ReturnType<typeof listFinanceAccounts>>["data"][number];
type FinanceBalanceRow = NonNullable<Awaited<ReturnType<typeof listFinanceBalances>>["data"]>[number];
type FinancePeriodRow = Awaited<ReturnType<typeof listFinancePeriods>>["periods"][number];
type FinanceVoucherRow = StandardVoucherListRow;
type FinanceBudgetVersionRow = Awaited<ReturnType<typeof listBudgetVersions>>[number];
export type FinanceBudgetMonthlyRow = {
  readonly versionId: number | null;
  readonly year: number;
  readonly companyCode: string | null;
  readonly budgetKind: "department" | "research";
  readonly ownerName: string;
  readonly accountName: string;
  readonly expenseType: string | null;
  readonly accountId: number | null;
  readonly accountCode: string | null;
  readonly accountActive: boolean | null;
  readonly month: number;
  readonly amount: number;
  readonly annualTotal: number;
};

export type FinanceAssetMetricRow = {
  readonly companyCode: string;
  readonly year: number;
  readonly month: number;
  readonly periodId: number | null;
  readonly isClosed: boolean;
  readonly normalAmount: number;
  readonly adjustmentAmount: number;
  readonly periodAmount: number;
};

const PAGED = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 200,
  maxPages: 20,
} as const;

const IN_MEMORY = {
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
  personal: { mode: "workspace", description: "Finance 原读取接口不按个人收窄；沿用当前账号的原业务权限。" },
  department: { mode: "workspace", description: "Finance 原读取接口不按部门收窄；沿用当前账号的原业务权限。" },
  project: { mode: "workspace", description: "Finance 原读取接口不按项目收窄；沿用当前账号的原业务权限。" },
} as const;

const company = { key: "companyCode", queryKey: "companyCode", label: "公司编码", description: "账套或法人公司编码。", kind: "text" } as const;
const year = { key: "year", queryKey: "year", label: "年度", description: "事实所属会计年度。", kind: "integer" } as const;
const month = { key: "month", queryKey: "month", label: "月份", description: "事实所属会计月份。", kind: "integer" } as const;
const keyword = { key: "keyword", queryKey: "keyword", label: "关键词", description: "沿用原列表接口的关键词筛选。", kind: "text" } as const;

const field = (
  label: string,
  description: string,
  valueKind: "text" | "number" | "integer" | "currency" | "percent" | "date" | "boolean",
  options: { sensitivity?: "internal" | "confidential" | "restricted"; exportPolicy?: "allowed" | "masked" | "forbidden" } = {},
) => ({
  classification: "field" as const,
  label,
  description,
  valueKind,
  sensitivity: options.sensitivity ?? "internal",
  exportPolicy: options.exportPolicy ?? "allowed",
});

const omit = (description: string, reason: "binary" | "controlPlane" | "credential" | "derivedDuplicate" | "nonScalar" | "notPublic" | "unstable" = "nonScalar") => ({
  classification: "omit" as const,
  reason,
  description,
});

export const FINANCE_LEDGER_ACCOUNTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAccountRow>()({
  sourceKey: "finance.ledger.accounts",
  version: 1,
  label: "公司会计科目",
  description: "公司本地科目及集团科目映射状态；沿用 finance.ledger 原读取权限。",
  apiPath: "/api/modules/finance/ledger/accounts",
  rowsPath: "data",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: [company, year, keyword,
    { key: "subjectLevel", queryKey: "subjectLevel", label: "科目层级", description: "按科目层级筛选。", kind: "integer" },
    { key: "scope", queryKey: "scope", label: "映射范围", description: "原接口的 mapped、unmapped、inactive 或 all。", kind: "text" },
    { key: "reviewStatus", queryKey: "reviewStatus", label: "复核状态", description: "集团映射复核状态。", kind: "text" },
  ],
  fields: {
    id: field("科目 ID", "公司科目稳定标识。", "integer"),
    code: field("科目编码", "公司会计科目编码。", "text"),
    name: field("科目名称", "公司会计科目名称。", "text"),
    category: field("科目类别", "资产、负债、共同、权益、成本、收入或费用。", "text"),
    parentId: field("上级科目 ID", "科目层级关系的上级标识。", "integer"),
    balanceDirection: field("余额方向", "科目借贷余额方向。", "text"),
    isActive: field("是否启用", "公司科目当前是否启用。", "boolean"),
    companyId: field("公司 ID", "科目所属公司主数据内部标识。", "integer", { sensitivity: "confidential" }),
    companyCode: field("公司编码", "科目所属公司编码。", "text"),
    mnemonicCode: field("助记码", "来源科目助记码。", "text"),
    currency: field("币种", "科目币种。", "text"),
    sourceSystem: field("来源系统", "科目来源系统。", "text"),
    sourceLedger: field("来源账套", "来源账套稳定标识。", "text"),
    sourceDatabase: field("来源数据库", "来源数据库稳定标识。", "text", { sensitivity: "confidential" }),
    sourceKey: field("来源键", "来源系统内科目的稳定键。", "text", { sensitivity: "confidential" }),
    groupSubjectCode: field("集团科目编码", "历史集团科目编码字段。", "text"),
    subjectLevel: field("科目层级", "公司科目层级。", "integer"),
    year: field("年度", "科目适用年度。", "integer"),
    sortOrder: field("排序", "来源科目排序值。", "integer"),
    editedBy: field("编辑人 ID", "最近编辑账号标识。", "integer", { sensitivity: "confidential" }),
    editedAt: field("编辑时间", "最近编辑时间。", "date"),
    version: field("版本", "乐观锁版本。", "integer"),
    createdAt: field("创建时间", "记录创建时间。", "date"),
    updatedAt: field("更新时间", "记录更新时间。", "date"),
    parent: omit("上级科目可由 parentId 与本源自关联重建。", "derivedDuplicate"),
    groupAccount: { classification: "childSource", sourceKey: "finance.ledger.account-mappings", description: "当前实际集团科目标识、编码和名称随映射事实一起规范化。" },
    mapping: { classification: "childSource", sourceKey: "finance.ledger.account-mappings", description: "从完整有界科目列表规范化的一科目一映射事实。" },
    reviewStatus: field("映射复核状态", "当前政策版本下的科目映射复核状态。", "text"),
  },
  pagination: PAGED,
  limits: LIMITS,
});

export const FINANCE_LEDGER_BALANCES_SOURCE = defineWorkspaceAnalysisReadModel<FinanceBalanceRow>()({
  sourceKey: "finance.ledger.balances",
  version: 1,
  label: "科目余额",
  description: "会计期间内逐科目的期初、本期和期末借贷余额。",
  apiPath: "/api/modules/finance/ledger/balances",
  rowsPath: "data",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: [company, year, month, keyword, { key: "periodId", queryKey: "periodId", label: "期间 ID", description: "也可直接指定会计期间。", kind: "integer" }],
  fields: {
    id: field("余额 ID", "余额事实稳定标识。", "integer"),
    accountId: field("科目 ID", "关联公司科目。", "integer"),
    periodId: field("期间 ID", "关联会计期间。", "integer"),
    openingDebit: field("期初借方", "期初借方余额。", "currency"),
    openingCredit: field("期初贷方", "期初贷方余额。", "currency"),
    currentDebit: field("本期借方", "本期借方发生额。", "currency"),
    currentCredit: field("本期贷方", "本期贷方发生额。", "currency"),
    closingDebit: field("期末借方", "期末借方余额。", "currency"),
    closingCredit: field("期末贷方", "期末贷方余额。", "currency"),
    companyId: field("公司 ID", "余额所属公司主数据内部标识。", "integer", { sensitivity: "confidential" }),
    companyCode: field("公司编码", "余额所属公司编码。", "text"),
    createdAt: field("创建时间", "余额记录创建时间。", "date"),
    updatedAt: field("更新时间", "余额最近更新时间。", "date"),
    account: omit("科目对象是嵌套展示对象；通过 accountId 关联公司科目源。"),
  },
  pagination: PAGED,
  limits: LIMITS,
});
export const FINANCE_LEDGER_COUNTERPARTY_BALANCES_SOURCE = defineWorkspaceAnalysisReadModel<FinanceCounterpartyBalanceRow>()({
  sourceKey: "finance.ledger.counterparty-balances", version: 2,
  label: "往来余额",
  description: "客户、供应商及其他往来的月度、季度或年度期间余额。",
  apiPath: "/api/modules/finance/ledger/counterparty-balances",
  rowsPath: "data",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: [
    { ...company, required: true }, { ...year, required: true }, { ...month, required: true },
    { key: "periodKind", queryKey: "periodKind", label: "期间粒度", description: "year、quarter 或 month，默认 month。", kind: "text" }, keyword,
    { key: "category", queryKey: "category", label: "往来类别", description: "ar、ap、otherAr 或 otherAp。", kind: "text", required: true }, { key: "relationScope", queryKey: "relationScope", label: "关联范围", description: "全部、关联方或其他往来。", kind: "text" }, { key: "objectType", queryKey: "objectType", label: "对象类型", description: "集团公司、客户、供应商、员工、部门或其他对象。", kind: "text" },
  ],
  fields: {
    id: field("余额键", "往来余额聚合稳定键。", "text"),
    counterpartyCode: field("往来编码", "往来对象编码。", "text"),
    counterpartyName: field("往来名称", "往来对象名称。", "text", { sensitivity: "confidential" }),
    counterpartyShortName: field("往来简称", "往来对象简称。", "text", { sensitivity: "confidential" }),
    counterpartyType: field("往来类型", "规范化往来对象类型。", "text"),
    counterpartyObjectKind: field("对象类型", "按稳定身份与来源维度归一的往来对象类型。", "text"), identityMatched: field("身份已匹配", "辅助核算对象是否已关联公司、员工或 Party。", "boolean"), relatedPartyType: field("关系性质", "已确认关联方的关系性质；非关联方或未匹配时为空。", "text"),
    accountCode: field("科目编码", "往来余额对应科目编码。", "text"),
    accountName: field("科目名称", "往来余额对应科目名称。", "text"),
    openingDebit: field("期初借方", "期初借方余额。", "currency"),
    openingCredit: field("期初贷方", "期初贷方余额。", "currency"),
    currentDebit: field("本期借方", "本期借方发生额。", "currency"),
    currentCredit: field("本期贷方", "本期贷方发生额。", "currency"),
    closingDebit: field("期末借方", "期末借方余额。", "currency"),
    closingCredit: field("期末贷方", "期末贷方余额。", "currency"),
    sourceBasis: field("来源口径", "ERP 月度余额或历史滚动口径。", "text"),
  },
  pagination: PAGED,
  limits: LIMITS,
});

export const FINANCE_LEDGER_PERIODS_SOURCE = defineWorkspaceAnalysisReadModel<FinancePeriodRow>()({
  sourceKey: "finance.ledger.periods",
  version: 1,
  label: "会计期间",
  description: "公司会计期间及来源结账状态。",
  apiPath: "/api/modules/finance/ledger/periods",
  rowsPath: "periods",
  totalPath: "periods.length",
  scopes: WORKSPACE_SCOPES,
  parameters: [year],
  fields: {
    id: field("期间 ID", "会计期间稳定标识。", "integer"),
    year: field("年度", "会计年度。", "integer"),
    month: field("月份", "会计月份。", "integer"),
    startDate: field("开始日期", "期间开始日期。", "date"),
    endDate: field("结束日期", "期间结束日期。", "date"),
    isClosed: field("是否结账", "Workspace 会计期间是否关闭。", "boolean"),
    sourceSystem: field("来源系统", "期间来源系统。", "text"),
    sourceDatabase: field("来源数据库", "期间来源数据库。", "text", { sensitivity: "confidential" }),
    sourceKey: field("来源键", "来源期间稳定键。", "text", { sensitivity: "confidential" }),
    sourceClosed: field("来源已结账", "来源系统原始结账状态。", "boolean"),
    companyId: field("公司 ID", "期间所属公司主数据内部标识。", "integer", { sensitivity: "confidential" }),
    companyCode: field("公司编码", "期间所属公司。", "text"),
    createdAt: field("创建时间", "记录创建时间。", "date"),
    updatedAt: field("更新时间", "记录更新时间。", "date"),
  },
  pagination: IN_MEMORY,
  limits: LIMITS,
});

export const FINANCE_LEDGER_VOUCHERS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceVoucherRow>()({
  sourceKey: "finance.ledger.vouchers",
  version: 1,
  label: "会计凭证",
  description: "会计凭证头事实；分录和现金流分配暂不伪装成可分页子源。",
  apiPath: "/api/modules/finance/ledger/vouchers",
  rowsPath: "data",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: [company, year, month, keyword,
    { key: "periodId", queryKey: "periodId", label: "期间 ID", description: "按会计期间筛选。", kind: "integer" },
    { key: "status", queryKey: "status", label: "状态", description: "按凭证状态筛选。", kind: "text" },
  ],
  fields: {
    id: field("凭证 ID", "凭证稳定标识。", "integer"),
    voucherNo: field("凭证号", "公司期间内凭证号。", "text"),
    date: field("凭证日期", "凭证业务日期。", "date"),
    periodId: field("期间 ID", "关联会计期间。", "integer"),
    description: field("摘要", "凭证摘要。", "text", { sensitivity: "confidential" }),
    matchingLabel: field("匹配标识", "Workspace 凭证对应的业务匹配说明。", "text", { sensitivity: "confidential" }),
    totalDebit: field("借方合计", "凭证借方金额合计。", "currency"),
    totalCredit: field("贷方合计", "凭证贷方金额合计。", "currency"),
    status: field("状态", "凭证状态。", "text"),
    companyId: field("公司 ID", "凭证所属公司主数据内部标识。", "integer", { sensitivity: "confidential" }),
    companyCode: field("公司编码", "凭证所属公司。", "text"),
    importId: field("导入批次 ID", "来源导入批次标识。", "integer"),
    sourceSystem: field("来源系统", "凭证来源系统。", "text"),
    sourceDatabase: field("来源数据库", "凭证来源数据库。", "text", { sensitivity: "confidential" }),
    sourceKey: field("来源键", "来源凭证稳定键。", "text", { sensitivity: "confidential" }),
    voucherTypeCode: field("凭证类型编码", "来源凭证类型编码。", "text"),
    voucherTypeName: field("凭证类型", "来源凭证类型名称。", "text"),
    isAdjustment: field("是否调整凭证", "来源是否标记为调整凭证。", "boolean"),
    preparerName: field("制单人", "来源制单人名称。", "text", { sensitivity: "confidential" }),
    reviewerName: field("审核人", "来源审核人名称。", "text", { sensitivity: "confidential" }),
    posterName: field("记账人", "来源记账人名称。", "text", { sensitivity: "confidential" }),
    cashierName: field("出纳", "来源出纳名称。", "text", { sensitivity: "confidential" }),
    attachmentCount: field("附件数", "来源凭证附件数量；不包含附件内容。", "integer"),
    sourcePosted: field("来源已记账", "来源系统记账状态。", "boolean"),
    sourceAudited: field("来源已审核", "来源系统审核状态。", "boolean"),
    sourceInvalid: field("来源作废", "来源系统作废状态。", "boolean"),
    externalSourceSystem: field("外部单据系统", "关联外部业务单据系统。", "text"),
    externalSourceDocumentNo: field("外部单据号", "关联外部业务单据号。", "text", { sensitivity: "confidential" }),
    externalSourceDocumentId: field("外部单据 ID", "关联外部业务单据标识。", "text", { sensitivity: "confidential" }),
    externalSourceAccountSet: field("外部账套", "关联外部账套。", "text", { sensitivity: "confidential" }),
    externalSourceDate: field("外部单据日期", "关联外部业务单据日期。", "date"),
    sourceMetadata: { classification: "childSource", sourceKey: "finance.ledger.voucher-metadata", description: "动态 JSON 以 JSON Pointer 叶子事实完整展开。" },
    editedBy: field("编辑人 ID", "最近编辑账号标识。", "integer", { sensitivity: "confidential" }),
    editedAt: field("编辑时间", "最近编辑时间。", "date"),
    version: field("版本", "乐观锁版本。", "integer"),
    createdAt: field("创建时间", "记录创建时间。", "date"),
    updatedAt: field("更新时间", "记录更新时间。", "date"),
    items: { classification: "childSource", sourceKey: "finance.ledger.voucher-items", description: "先有界加载完整凭证父集，再规范化全部凭证明细。" },
    period: omit("期间可由 periodId 与会计期间源重建。", "derivedDuplicate"),
    cashFlowAllocations: { classification: "childSource", sourceKey: "finance.ledger.voucher-cash-flow-allocations", description: "先有界加载完整凭证父集，再规范化全部现金流分配。" },
  },
  pagination: PAGED,
  limits: LIMITS,
});

export const FINANCE_LEDGER_RECLASS_RESULTS_SOURCE = defineWorkspaceAnalysisReadModel<ReclassResultRow>()({
  sourceKey: "finance.ledger.reclass-results",
  version: 1,
  label: "重分类结果",
  description: "逐凭证明细的期末重分类结果及复核状态。",
  apiPath: "/api/modules/finance/ledger/reclass-results",
  rowsPath: "items",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: [
    { key: "periodId", queryKey: "periodId", label: "期间 ID", description: "会计期间稳定标识。", kind: "integer", required: true }, keyword,
    { key: "status", queryKey: "status", label: "状态", description: "pending、approved、adjusted、rejected 或 all。", kind: "text" },
  ],
  fields: {
    id: field("结果 ID", "重分类结果稳定标识。", "integer"),
    periodId: field("期间 ID", "会计期间。", "integer"),
    voucherItemId: field("凭证明细 ID", "来源凭证明细标识。", "integer"),
    sourceMissing: field("来源已删除", "来源凭证明细是否已删除。", "boolean"),
    voucherNo: field("凭证号", "来源凭证号。", "text"),
    voucherDate: field("凭证日期", "来源凭证日期。", "date"),
    relatedEntity: field("关联对象", "凭证摘要识别的关联对象。", "text", { sensitivity: "confidential" }),
    description: field("摘要", "来源凭证明细摘要。", "text", { sensitivity: "confidential" }),
    sourceAccount: field("来源科目", "重分类来源科目编码。", "text"),
    sourceAccountName: field("来源科目名称", "重分类来源科目名称。", "text"),
    abnormalSide: field("异常方向", "触发重分类的异常余额方向。", "text"),
    itemDebit: field("分录借方", "来源分录借方金额。", "currency"),
    itemCredit: field("分录贷方", "来源分录贷方金额。", "currency"),
    targetAccount: field("目标科目", "重分类目标科目编码。", "text"),
    amount: field("金额", "重分类金额。", "currency"),
    status: field("状态", "结果复核状态。", "text"),
    kind: field("结果类型", "派生结果类型。", "text"),
    suggestedTarget: field("建议目标", "系统建议目标科目。", "text"),
    note: field("备注", "复核或调整备注。", "text", { sensitivity: "confidential" }),
    adjustedBy: field("调整人 ID", "调整账号标识。", "integer", { sensitivity: "confidential" }),
    adjustedByName: field("调整人", "调整人名称。", "text", { sensitivity: "confidential" }),
    adjustedAt: field("调整时间", "最近调整时间。", "date"),
  },
  pagination: PAGED,
  limits: LIMITS,
});

export const FINANCE_LEDGER_RECLASS_RULE_CANDIDATES_SOURCE = defineWorkspaceAnalysisReadModel<RuleCandidate>()({
  sourceKey: "finance.ledger.reclass-rule-candidates",
  version: 1,
  label: "重分类规则候选",
  description: "集团科目当前政策版本下的重分类规则决策及历史异常信号。",
  apiPath: "/api/modules/finance/ledger/reclass-rules",
  rowsPath: "candidates",
  totalPath: "candidates.length",
  scopes: WORKSPACE_SCOPES,
  parameters: [{ key: "policyVersionId", queryKey: "policyVersionId", label: "政策版本 ID", description: "集团会计政策版本。", kind: "integer" }],
  fields: {
    policyVersionId: field("政策版本 ID", "集团会计政策版本。", "integer"),
    groupAccountId: field("集团科目 ID", "集团科目稳定标识。", "integer"),
    accountCode: field("科目编码", "集团科目编码。", "text"),
    accountName: field("科目名称", "集团科目名称。", "text"),
    balanceDirection: field("余额方向", "集团科目余额方向。", "text"),
    abnormalSide: field("异常方向", "规则处理的异常余额方向。", "text"),
    abnormalAmount: field("异常金额", "当前候选异常金额。", "currency"),
    hasHistoricalAbnormalBalance: field("历史存在异常", "政策版本期间是否出现历史异常余额。", "boolean"),
    effectiveDecision: field("有效决策", "当前生效的重分类决策。", "text"),
    existingRuleId: field("规则 ID", "现有人工规则标识。", "integer"),
    existingRuleSourceGroupAccountId: field("规则来源科目 ID", "继承规则的来源集团科目。", "integer"),
    inheritedFromAccountCode: field("继承来源编码", "继承规则的来源科目编码。", "text"),
    existingTarget: field("目标科目编码", "现有重分类目标。", "text"),
    existingTargetGroupAccountId: field("目标科目 ID", "现有目标集团科目标识。", "integer"),
    existingDecision: field("显式决策", "当前科目显式保存的决策。", "text"),
    existingSource: field("规则来源", "现有规则来源。", "text"),
    existingEnabled: field("规则启用", "现有规则是否启用。", "boolean"),
    existingBasis: field("现有口径", "现有重分类计算口径。", "text"),
    defaultBasis: field("默认口径", "按事实推导的默认计算口径。", "text"),
    hasAuxiliaryFacts: field("有辅助事实", "集团科目是否存在辅助核算余额事实。", "boolean"),
  },
  pagination: IN_MEMORY,
  limits: LIMITS,
});

export const FINANCE_LEDGER_GROUP_ACCOUNTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceGroupAccountCatalogRow>()({
  sourceKey: "finance.ledger.group-accounts",
  version: 1,
  label: "集团科目目录",
  description: "版本化集团科目主表及复核状态。",
  apiPath: "/api/modules/finance/ledger/group-account-catalog",
  rowsPath: "rows",
  totalPath: "pagination.total",
  scopes: WORKSPACE_SCOPES,
  parameters: [keyword,
    { key: "policyVersionId", queryKey: "policyVersionId", label: "政策版本 ID", description: "集团会计政策版本。", kind: "integer" },
    { key: "category", queryKey: "category", label: "科目类别", description: "集团科目类别。", kind: "text" },
    { key: "reviewStatus", queryKey: "reviewStatus", label: "复核状态", description: "集团科目复核状态。", kind: "text" },
  ],
  fields: {
    id: field("集团科目 ID", "集团科目稳定标识。", "integer"),
    code: field("科目编码", "集团科目编码。", "text"),
    name: field("科目名称", "集团科目名称。", "text"),
    category: field("科目类别", "集团科目类别。", "text"),
    balanceDirection: field("余额方向", "集团科目余额方向。", "text"),
    companyCode: field("公司编码", "集团科目无单一公司，本字段固定为空。", "text"),
    subjectLevel: field("科目层级", "集团科目层级。", "integer"),
    mnemonicCode: field("助记码", "集团科目助记码。", "text"),
    currency: field("币种", "集团科目币种。", "text"),
    isActive: field("是否启用", "集团科目是否启用。", "boolean"),
    groupAccount: omit("兼容展示字段固定为空，不是独立事实。", "derivedDuplicate"),
    sourceKind: field("来源类型", "集团科目的建立来源。", "text"),
    reviewStatus: field("复核状态", "集团科目复核状态。", "text"),
    reviewedBy: field("复核人 ID", "最近复核账号标识。", "integer", { sensitivity: "confidential" }),
    reviewedAt: field("复核时间", "最近复核时间。", "date"),
    consolidationRole: field("合并角色", "集团科目的合并取数角色。", "text"), counterpartyRequirement: field("对方公司要求", "集团科目对对方公司辅助核算的要求。", "text"),
    movementType: field("取数口径", "集团科目的默认合并取数口径。", "text"), translationRateType: field("折算方法", "集团报表使用的折算方法。", "text"),
    originCompanyCode: field("来源公司", "集团科目起源公司编码。", "text"),
    mappingCount: field("映射数", "已确认或已复核公司科目映射数量。", "integer"),
    years: { classification: "childSource", sourceKey: "finance.ledger.group-account-years", description: "集团科目与适用年度的一对多关系。" },
    updatedAt: field("更新时间", "集团科目版本更新时间。", "date"),
    parent: { classification: "childSource", sourceKey: "finance.ledger.group-account-parents", description: "实际父级关系规范化为一科目一父科目关系源，与父级建议严格区分。" },
    parentRecommendation: { classification: "childSource", sourceKey: "finance.ledger.group-account-parent-recommendations", description: "将判别联合对象规范化为稳定的建议关系行。" },
  },
  pagination: PAGED,
  limits: LIMITS,
});

export const FINANCE_ASSETS_CARDS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAssetCardDto>()({
  sourceKey: "finance.assets.cards",
  version: 2,
  label: "资产卡片",
  description: "固定资产、无形资产、预付及长期待摊资产卡片。",
  apiPath: "/api/modules/finance/assets",
  rowsPath: "cards",
  totalPath: "cards.length",
  scopes: WORKSPACE_SCOPES,
  parameters: [{ ...company, required: true }, { ...year, required: true }, { ...month, required: true }],
  fields: {
    id: field("资产 ID", "资产卡片稳定标识。", "integer"), companyCode: field("公司编码", "资产所属公司。", "text"),
    assetCode: field("资产编号", "资产编号。", "text"), name: field("资产名称", "资产名称。", "text"),
    assetKind: field("资产类型", "固定资产、无形资产、预付或长期待摊。", "text"), categoryId: field("资产分类 ID", "资产分类主数据引用。", "integer"), categoryCode: field("资产分类编码", "资产分类主数据编码。", "text"), categoryName: field("资产分类", "资产分类主数据名称。", "text"),
    assetAccountId: field("资产科目 ID", "当前年度资产科目引用。", "integer"), assetAccountCode: field("资产科目", "资产原值科目编码。", "text"), assetAccountName: field("资产科目名称", "当前年度资产科目名称。", "text"), accumulatedAccountId: field("累计科目 ID", "当前年度累计折旧或摊销科目引用。", "integer"), accumulatedAccountCode: field("累计科目", "累计折旧或摊销科目编码。", "text"), accumulatedAccountName: field("累计科目名称", "当前年度累计折旧或摊销科目名称。", "text"),
    acquisitionDate: field("取得日期", "资产取得日期。", "date"), depreciationStartDate: field("折旧开始日期", "折旧或摊销开始日期。", "date"),
    originalCost: field("原值", "资产登记原值。", "currency"), residualRate: field("残值率", "资产残值率。", "percent"),
    usefulLifeMonths: field("使用月数", "预计使用寿命月数。", "integer"), method: field("折旧方法", "折旧或摊销方法。", "text"),
    initializationMode: field("初始化模式", "标准建卡或历史切点承接。", "text"),
    openingAccumulatedAmount: field("期初累计额", "接入时已累计折旧或摊销。", "currency"),
    openingImpairmentAmount: field("期初减值", "历史切点承接的累计减值。", "currency"),
    openingNetBookValue: field("切点净值", "历史切点承接的账面净值。", "currency"),
    cutoverDate: field("切点日期", "历史资产承接截止日期。", "date"),
    remainingUsefulLifeMonthsAtCutover: field("切点剩余月数", "切点后剩余折旧或摊销月数。", "integer"),
    cutoverResidualValue: field("切点剩余残值", "切点后保留的剩余残值。", "currency"),
    cutoverAllocationStatus: field("切点分配状态", "总账切点余额分配状态。", "text"),
    cutoverReconciliationFingerprint: field("切点核对指纹", "切点总账核对的不可变指纹。", "text", { sensitivity: "confidential" }),
    status: field("状态", "资产卡片状态。", "text"),
    nonAmortizationReason: field("不摊销原因", "不参与折旧或摊销的原因。", "text"), note: field("备注", "资产备注。", "text", { sensitivity: "confidential" }),
    sourceSheet: field("来源工作表", "导入来源工作表。", "text"), sourceRow: field("来源行", "导入来源行号。", "integer"),
    openingAsOfDate: field("期初截止日", "期初累计额截止日期。", "date"), version: field("版本", "乐观锁版本。", "integer"),
    grossCost: field("总成本", "含全部成本行的资产总成本。", "currency"), waivedCost: field("豁免成本", "不资本化成本金额。", "currency"),
    capitalizedCost: field("资本化成本", "实际资本化成本金额。", "currency"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_ASSETS_PERIOD_ROWS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAssetPeriodRowDto>()({
  sourceKey: "finance.assets.periods", version: 1, label: "资产期间折旧", description: "资产逐期间折旧或摊销金额。",
  apiPath: "/api/modules/finance/assets", rowsPath: "periodRows", totalPath: "periodRows.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...company, required: true }, { ...year, required: true }, { ...month, required: true }],
  fields: {
    assetId: field("资产 ID", "关联资产卡片。", "integer"), assetCode: field("资产编号", "资产编号。", "text"), name: field("资产名称", "资产名称。", "text"),
    assetKind: field("资产类型", "资产类型。", "text"), accountCode: field("累计科目", "累计折旧或摊销科目。", "text"),
    depreciationStartDate: field("折旧开始日期", "折旧或摊销开始日期。", "date"), originalCost: field("原值", "资产原值。", "currency"),
    normalAmount: field("正常金额", "系统计算的本期金额。", "currency"), adjustmentAmount: field("调整金额", "本期人工调整金额。", "currency"),
    periodAmount: field("期间金额", "正常金额加调整金额。", "currency"), status: field("状态", "期间折旧状态。", "text"),
    voucherNo: field("凭证号", "关联凭证号。", "text"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_ASSETS_ADJUSTMENTS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAssetAdjustmentDto>()({
  sourceKey: "finance.assets.adjustments", version: 1, label: "历史资产调整", description: "历史资产折旧摊销调整审计记录；新更正统一通过总账凭证处理。",
  apiPath: "/api/modules/finance/assets", rowsPath: "adjustments", totalPath: "adjustments.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...company, required: true }, { ...year, required: true }, { ...month, required: true }],
  fields: {
    id: field("调整 ID", "资产调整稳定标识。", "integer"), assetId: field("资产 ID", "关联资产卡片。", "integer"), assetName: field("资产名称", "关联资产名称。", "text"),
    accountId: field("科目 ID", "当前年度调整科目引用。", "integer"), accountCode: field("科目编码", "调整入账科目。", "text"), accountName: field("科目名称", "当前年度调整科目名称。", "text"), amount: field("金额", "调整金额。", "currency"), reason: field("原因", "调整原因。", "text", { sensitivity: "confidential" }),
    status: field("状态", "调整事项状态。", "text"), voucherNo: field("凭证号", "关联凭证号。", "text"), sourceSheet: field("来源工作表", "导入来源工作表。", "text"),
    sourceRow: field("来源行", "导入来源行号。", "integer"), createdAt: field("创建时间", "调整创建时间。", "date"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_ASSETS_METRICS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceAssetMetricRow>()({
  sourceKey: "finance.assets.metrics", version: 2, label: "资产期间汇总", description: "资产期间系统计算、历史调整及本期金额汇总。",
  apiPath: "/api/modules/finance/assets", rowsPath: "metrics", totalPath: "metrics.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...company, required: true }, { ...year, required: true }, { ...month, required: true }],
  fields: {
    companyCode: field("公司编码", "资产期间所属公司。", "text"), year: field("年度", "会计年度。", "integer"), month: field("月份", "会计月份。", "integer"),
    periodId: field("期间 ID", "会计期间稳定标识。", "integer"), isClosed: field("已结账", "会计期间是否关闭。", "boolean"),
    normalAmount: field("正常金额", "系统计算金额合计。", "currency"), adjustmentAmount: field("调整金额", "调整事项合计。", "currency"),
    periodAmount: field("期间金额", "正常金额加历史调整金额。", "currency"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_BUDGET_VERSIONS_SOURCE = defineWorkspaceAnalysisReadModel<FinanceBudgetVersionRow>()({
  sourceKey: "finance.budget.versions", version: 1, label: "预算版本", description: "年度公司预算版本及状态。",
  apiPath: "/api/modules/finance/budget/versions", rowsPath: "versions", totalPath: "versions.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...year, required: true }, company],
  fields: {
    id: field("版本 ID", "预算版本稳定标识。", "integer"), year: field("年度", "预算年度。", "integer"),
    companyId: field("公司 ID", "预算公司主数据内部标识。", "integer", { sensitivity: "confidential" }), companyCode: field("公司编码", "预算公司编码。", "text"),
    name: field("版本名称", "预算版本名称。", "text"), status: field("状态", "draft、active 或 archived。", "text"), type: field("预算类型", "department、research 或 all。", "text"),
    sourceFile: field("来源文件", "预算导入来源文件名。", "text", { sensitivity: "confidential" }), createdBy: field("创建人 ID", "创建账号标识。", "integer", { sensitivity: "confidential" }),
    createdAt: field("创建时间", "版本创建时间。", "date"), updatedAt: field("更新时间", "版本更新时间。", "date"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});

const budgetMonthlyFields = {
  versionId: field("版本 ID", "预算版本稳定标识；无数据库版本时为空。", "integer"), year: field("年度", "预算年度。", "integer"), companyCode: field("公司编码", "预算公司编码。", "text"),
  budgetKind: field("预算类型", "部门费用或研发项目预算。", "text"), ownerName: field("责任对象", "部门或研发项目名称。", "text"),
  accountName: field("预算科目", "预算科目或研发费用类别。", "text"), expenseType: field("费用类型", "部门预算费用类型；研发预算为空。", "text"),
  accountId: field("科目 ID", "匹配的公司科目标识。", "integer"), accountCode: field("科目编码", "匹配的公司科目编码。", "text"),
  accountActive: field("科目启用", "匹配科目是否启用。", "boolean"), month: field("月份", "预算月份。", "integer"),
  amount: field("月度预算", "该月预算金额。", "currency"), annualTotal: field("年度预算", "预算行年度金额。", "currency"),
} as const;

export const FINANCE_BUDGET_DEPARTMENT_MONTHLY_SOURCE = defineWorkspaceAnalysisReadModel<FinanceBudgetMonthlyRow>()({
  sourceKey: "finance.budget.department-monthly", version: 1, label: "部门月度预算", description: "部门费用预算按月份规范化后的事实。",
  apiPath: "/api/modules/finance/budget", rowsPath: "deptBudget", totalPath: "deptBudget.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...year, required: true }, company, { key: "versionId", queryKey: "versionId", label: "版本 ID", description: "指定预算版本。", kind: "integer" }],
  fields: budgetMonthlyFields, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_BUDGET_RESEARCH_MONTHLY_SOURCE = defineWorkspaceAnalysisReadModel<FinanceBudgetMonthlyRow>()({
  sourceKey: "finance.budget.research-monthly", version: 1, label: "研发月度预算", description: "研发项目费用预算按月份规范化后的事实。",
  apiPath: "/api/modules/finance/budget", rowsPath: "rdBudget", totalPath: "rdBudget.length", scopes: WORKSPACE_SCOPES,
  parameters: [{ ...year, required: true }, company, { key: "versionId", queryKey: "versionId", label: "版本 ID", description: "指定预算版本。", kind: "integer" }],
  fields: budgetMonthlyFields, pagination: IN_MEMORY, limits: LIMITS,
});

export const FINANCE_STATEMENT_LINES_SOURCE = defineWorkspaceAnalysisReadModel<DirectReportLine>()({
  sourceKey: "finance.statements.lines", version: 1, label: "利润表与现金流量表行", description: "系统账直接生成的利润表或现金流量表行。",
  apiPath: "/api/modules/finance/statements/reports", rowsPath: "lines", totalPath: "lines.length", scopes: WORKSPACE_SCOPES,
  parameters: [
    { ...company, required: true }, { ...year, required: true }, { ...month, required: true },
    { key: "type", queryKey: "type", label: "报表类型", description: "balance、income 或 cashflow。", kind: "text", required: true },
  ],
  fields: {
    lineCode: field("行编码", "报表行稳定编码。", "text"), code: field("取数科目", "报表行科目前缀表达式。", "text"), label: field("报表项目", "报表项目名称。", "text"),
    amount: field("累计金额", "所选期间累计金额。", "currency"), currentMonthAmount: field("当月金额", "所选月份当月金额。", "currency"), previousAmount: field("比较金额", "上年同期金额。", "currency"),
    section: field("报表分区", "报表项目所属分区。", "text"), side: field("借贷方向", "报表项目方向。", "text"), direction: field("流向", "现金流入、流出或净额。", "text"),
    subtract: field("是否扣减", "利润表累计时是否扣减。", "boolean"), isHeader: field("是否标题", "是否分区标题行。", "boolean"),
    isTotal: field("是否小计", "是否小计行。", "boolean"), isGrandTotal: field("是否总计", "是否总计行。", "boolean"),
  }, pagination: IN_MEMORY, limits: LIMITS,
});
