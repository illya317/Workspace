import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelChild,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelOmission,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type {
  CaptableCompany,
  CaptableRound,
  CompanyRecord,
  FinancingRound,
  GovernanceOrganization,
  GovernancePositionSummary,
  OwnershipInterestRecord,
  ShareCapitalEventRecord,
  ShareholderPosition,
} from "../types";
import { CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_CHILD_SOURCE_REGISTRATIONS } from "./workspace-analysis-child-sources";

const field = (
  input: Omit<WorkspaceAnalysisReadModelField, "classification" | "exportPolicy"> & {
    exportPolicy?: WorkspaceAnalysisReadModelField["exportPolicy"];
  },
): WorkspaceAnalysisReadModelField => ({ classification: "field", exportPolicy: "allowed", ...input });

const omit = (
  reason: WorkspaceAnalysisReadModelOmission["reason"],
  description: string,
): WorkspaceAnalysisReadModelOmission => ({ classification: "omit", reason, description });

const child = (sourceKey: string, description: string): WorkspaceAnalysisReadModelChild => ({
  classification: "childSource",
  sourceKey,
  description,
});

const workspaceScopes = {
  personal: { mode: "workspace", description: "资本治理数据没有个人空间外键；展示当前账号按业务权限可见的全公司数据。" },
  department: { mode: "workspace", description: "资本治理数据没有可信目标部门外键；展示当前账号按业务权限可见的全公司数据。" },
  project: { mode: "workspace", description: "资本治理数据没有项目空间外键；展示当前账号按业务权限可见的全公司数据。" },
} as const;

const pagination = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 10 } as const;
const limits = { maxRows: 5_000, maxGroups: 500, maxPageSize: 500, maxPages: 10, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 } as const;
const investorParameters = [
  { key: "issuerCompanyId", label: "目标公司", description: "选择投资人关系视图的目标公司 ID。", kind: "integer", queryKey: "issuerCompanyId" },
  { key: "asOf", label: "基准日", description: "按 YYYY-MM-DD 基准日读取股本与投资人关系。", kind: "date", queryKey: "asOf" },
] as const;

export const CAPITAL_SECURITIES_COMPANIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CompanyRecord>()({
  sourceKey: "capital-securities.companies",
  version: 1,
  label: "资本治理公司",
  description: "以一个内部公司为粒度，完整复用治理架构公司列表 DTO。",
  apiPath: "/api/modules/capitalSecurities/governance/companies",
  rowsPath: "companies",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "keyword", label: "关键词", description: "匹配公司编码、名称、全称或统一代码。", kind: "text", queryKey: "keyword" },
    { key: "activeOnly", label: "仅有效公司", description: "是否只读取有效公司。", kind: "boolean", queryKey: "active" },
  ],
  fields: {
    id: field({ label: "公司 ID", description: "公司稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    partyId: field({ label: "主体 ID", description: "公司关联的法定主体内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    partyVersion: field({ label: "主体版本", description: "法定主体聚合版本号。", valueKind: "integer", sensitivity: "internal" }),
    legalFactRevision: field({ label: "法定事实版本", description: "公司当前法定事实的并发修订号。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "公司编码", description: "公司业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "公司名称", description: "公司主体名称。", valueKind: "text", sensitivity: "confidential" }),
    fullName: field({ label: "公司全称", description: "公司法定全称。", valueKind: "text", sensitivity: "confidential" }),
    description: field({ label: "公司说明", description: "公司主数据说明。", valueKind: "text", sensitivity: "confidential" }),
    registeredCapital: field({ label: "注册资本文本", description: "公司主数据维护的注册资本原始文本。", valueKind: "text", sensitivity: "confidential" }),
    unifiedCode: field({ label: "统一社会信用代码", description: "正式统一代码；临时身份编码返回空。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
    bankName: field({ label: "开户行", description: "公司开户银行。", valueKind: "text", sensitivity: "restricted" }),
    registeredAddress: field({ label: "注册地址", description: "公司注册地址。", valueKind: "text", sensitivity: "confidential" }),
    registeredDate: field({ label: "注册日期", description: "公司注册日期。", valueKind: "date", sensitivity: "confidential" }),
    legalPerson: field({ label: "法定代表人", description: "公司法定代表人。", valueKind: "text", sensitivity: "restricted" }),
    managementGroup: field({ label: "管理组", description: "公司所属管理组。", valueKind: "text", sensitivity: "internal" }),
    codePoolCode: field({ label: "编码池代码", description: "公司共用的编码池代码。", valueKind: "text", sensitivity: "internal" }),
    isActive: field({ label: "有效", description: "公司是否有效。", valueKind: "boolean", sensitivity: "internal" }),
    sortOrder: field({ label: "排序", description: "公司目录排序值。", valueKind: "integer", sensitivity: "internal" }),
    version: field({ label: "公司版本", description: "公司主数据版本号。", valueKind: "integer", sensitivity: "internal" }),
    registryChanges: omit("nonScalar", "工商变更包含参与方等嵌套明细，不作为公司标量字段暴露。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_OWNERSHIP_INTERESTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<OwnershipInterestRecord>()({
  sourceKey: "capital-securities.ownership-interests",
  version: 1,
  label: "长期股权关系",
  description: "以一条持股方—被持股公司关系为粒度，复用治理架构持股关系列表。",
  apiPath: "/api/modules/capitalSecurities/governance/ownership-interests",
  rowsPath: "interests",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "keyword", label: "关键词", description: "匹配持股方或被持股公司名称。", kind: "text", queryKey: "keyword" },
  ],
  fields: {
    id: field({ label: "股权关系 ID", description: "股权关系稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    ownerPartyId: field({ label: "持股方主体 ID", description: "持股方法定主体内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    ownerName: field({ label: "持股方", description: "持股方名称。", valueKind: "text", sensitivity: "confidential" }),
    issuerCompanyId: field({ label: "被持股公司 ID", description: "被持股公司内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    issuerCode: field({ label: "被持股公司编码", description: "被持股公司业务编码。", valueKind: "text", sensitivity: "internal" }),
    issuerName: field({ label: "被持股公司", description: "被持股公司名称。", valueKind: "text", sensitivity: "confidential" }),
    shareRatio: field({ label: "持股比例", description: "0 到 1 的持股比例。", valueKind: "percent", sensitivity: "restricted" }),
    isConsolidated: field({ label: "纳入合并", description: "是否纳入合并范围。", valueKind: "boolean", sensitivity: "confidential" }),
    effectiveFrom: field({ label: "生效日期", description: "股权关系生效日期。", valueKind: "date", sensitivity: "confidential" }),
    effectiveTo: field({ label: "失效日期", description: "股权关系失效日期。", valueKind: "date", sensitivity: "confidential" }),
    recordStatus: field({ label: "记录状态", description: "已确认或待确认。", valueKind: "text", sensitivity: "internal" }),
    changeLabel: field({ label: "变更说明", description: "股权关系变更说明。", valueKind: "text", sensitivity: "confidential" }),
    sourceType: field({ label: "来源类型", description: "股权关系来源类型。", valueKind: "text", sensitivity: "confidential" }),
    sourceLabel: field({ label: "来源名称", description: "股权关系来源名称。", valueKind: "text", sensitivity: "confidential" }),
    sourceReference: field({ label: "来源引用", description: "股权关系来源引用文本。", valueKind: "text", sensitivity: "restricted" }),
    sourceEventId: field({ label: "来源事件 ID", description: "打开该有效期的股本事件。", valueKind: "integer", sensitivity: "internal" }),
    sourceEventName: field({ label: "来源事件", description: "打开该有效期的股本事件名称。", valueKind: "text", sensitivity: "confidential" }),
    sourceEventEffectiveDate: field({ label: "来源事件日期", description: "打开该有效期的股本事件生效日期。", valueKind: "date", sensitivity: "confidential" }),
    closedByEventId: field({ label: "关闭事件 ID", description: "关闭该有效期的股本事件；当前有效关系为空。", valueKind: "integer", sensitivity: "internal" }),
    closedByEventName: field({ label: "关闭事件", description: "关闭该有效期的股本事件名称。", valueKind: "text", sensitivity: "confidential" }),
    projectionRunId: field({ label: "投影批次 ID", description: "生成该读模型行的全量重建批次。", valueKind: "integer", sensitivity: "internal" }),
    projectionGeneration: field({ label: "投影代次", description: "发行主体内单调递增的投影代次。", valueKind: "integer", sensitivity: "internal" }),
    projectorKey: field({ label: "投影器", description: "生成该行的投影器标识。", valueKind: "text", sensitivity: "internal" }),
    projectorVersion: field({ label: "投影器版本", description: "生成该行的投影算法版本。", valueKind: "integer", sensitivity: "internal" }),
    ledgerHash: field({ label: "账本摘要", description: "本批投影输入账本的 SHA-256 摘要。", valueKind: "text", sensitivity: "internal" }),
    projectedAt: field({ label: "投影时间", description: "本批投影完成时间（ISO 8601）。", valueKind: "text", sensitivity: "internal" }),
    version: field({ label: "关系版本", description: "股权关系版本号。", valueKind: "integer", sensitivity: "internal" }),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_ORGANIZATIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<GovernanceOrganization>()({
  sourceKey: "capital-securities.organizations",
  version: 1,
  label: "治理组织",
  description: "以一个 G 体系治理组织为粒度，读取界定总量的治理组织目录。",
  apiPath: "/api/modules/capitalSecurities/governance/organizations",
  rowsPath: "organizations",
  totalPath: "total",
  scopes: workspaceScopes,
  fields: {
    id: field({ label: "组织 ID", description: "治理组织内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "组织编码", description: "治理组织业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "组织名称", description: "治理组织名称。", valueKind: "text", sensitivity: "internal" }),
    alias: field({ label: "组织别名", description: "治理组织别名。", valueKind: "text", sensitivity: "internal" }),
    hierarchyKind: field({ label: "组织体系", description: "固定为 G 治理体系。", valueKind: "text", sensitivity: "internal" }),
    level: field({ label: "治理层级", description: "治理组织层级 1 至 3。", valueKind: "integer", sensitivity: "internal" }),
    parentId: field({ label: "上级组织 ID", description: "直接上级治理组织 ID。", valueKind: "integer", sensitivity: "internal" }),
    parentName: field({ label: "上级组织", description: "直接上级治理组织名称。", valueKind: "text", sensitivity: "internal" }),
    managerPositionId: field({ label: "负责人岗位 ID", description: "负责人岗位内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    managerPositionName: field({ label: "负责人岗位", description: "负责人岗位名称。", valueKind: "text", sensitivity: "internal" }),
    managerEmployeeIds: child("capital-securities.organization-managers", "负责人 ID 与姓名数组规范化为一负责人一行的关系源。"),
    managerEmployeeNames: child("capital-securities.organization-managers", "负责人 ID 与姓名数组规范化为一负责人一行的关系源。"),
    managerName: field({ label: "负责人", description: "治理组织负责人合并名称。", valueKind: "text", sensitivity: "confidential" }),
    directPositions: field({ label: "直属岗位数", description: "组织直接拥有的现用岗位数。", valueKind: "integer", sensitivity: "internal" }),
    totalPositions: field({ label: "全部岗位数", description: "组织及后代组织的现用岗位数。", valueKind: "integer", sensitivity: "internal" }),
    directHeadcount: field({ label: "直属人数", description: "直属岗位当前有效员工去重人数的加总。", valueKind: "integer", sensitivity: "confidential" }),
    totalHeadcount: field({ label: "全部人数", description: "组织及后代组织当前有效员工去重人数的加总。", valueKind: "integer", sensitivity: "confidential" }),
    children: omit("derivedDuplicate", "子组织数组可由本数据源 parentId 重建。"),
    descriptions: child("capital-securities.organization-descriptions", "组织说明书包含嵌套 details，已拆为稳定的字段明细数据源。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_GOVERNANCE_POSITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<GovernancePositionSummary>()({
  sourceKey: "capital-securities.governance-positions",
  version: 1,
  label: "治理岗位",
  description: "以一个 G 体系岗位为粒度，读取治理组织接口返回的岗位摘要。",
  apiPath: "/api/modules/capitalSecurities/governance/organizations",
  rowsPath: "positions",
  totalPath: "total",
  scopes: workspaceScopes,
  fields: {
    id: field({ label: "岗位 ID", description: "治理岗位内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "岗位编码", description: "治理岗位业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "岗位名称", description: "治理岗位名称。", valueKind: "text", sensitivity: "internal" }),
    alias: field({ label: "岗位别名", description: "治理岗位别名。", valueKind: "text", sensitivity: "internal" }),
    departmentId: field({ label: "组织 ID", description: "岗位所属治理组织 ID。", valueKind: "integer", sensitivity: "internal" }),
    departmentName: field({ label: "所属组织", description: "岗位所属治理组织名称。", valueKind: "text", sensitivity: "internal" }),
    headcount: field({ label: "当前人数", description: "岗位当前有效员工去重人数。", valueKind: "integer", sensitivity: "confidential" }),
    reportTo: field({ label: "汇报岗位", description: "岗位自然汇报对象名称。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionId: field({ label: "说明书 ID", description: "岗位说明书内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    positionDescriptionName: field({ label: "说明书岗位名", description: "说明书按岗位主数据派生的名称。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionCode: field({ label: "说明书岗位编码", description: "说明书按岗位主数据派生的编码。", valueKind: "text", sensitivity: "internal" }),
    managerOfDepartmentIds: child("capital-securities.governance-position-managements", "负责组织 ID 数组规范化为一岗位一组织关系源。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_INVESTOR_COMPANIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CaptableCompany>()({
  sourceKey: "capital-securities.investor-companies",
  version: 1,
  label: "投资人视图公司",
  description: "以投资人关系页面可选择的一家公司为粒度，复用 investors.read。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "companies",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    id: field({ label: "公司 ID", description: "公司内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "公司编码", description: "公司业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "公司名称", description: "公司名称。", valueKind: "text", sensitivity: "confidential" }),
    fullName: field({ label: "公司全称", description: "公司法定全称。", valueKind: "text", sensitivity: "confidential" }),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_SHAREHOLDERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ShareholderPosition>()({
  sourceKey: "capital-securities.shareholders",
  version: 1,
  label: "股东持仓",
  description: "以目标公司在基准日的一名股东为粒度，复用投资人关系视图。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "shareholders",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    partyId: field({ label: "股东主体 ID", description: "股东法定主体内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    name: field({ label: "股东名称", description: "股东主体名称。", valueKind: "text", sensitivity: "confidential" }),
    fullName: field({ label: "股东法定全称", description: "股东主体的当前法定全称。", valueKind: "text", sensitivity: "confidential" }),
    subjectType: field({ label: "主体类型", description: "股东是机构或个人。", valueKind: "text", sensitivity: "confidential" }),
    identityNumberMasked: field({ label: "证件标识", description: "掩码后的主体证件标识，不包含完整证件号码。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
    legalRepresentative: field({ label: "法定代表人", description: "机构股东的当前法定代表人。", valueKind: "text", sensitivity: "restricted" }),
    confirmedSubscribedCapitalYuan: field({ label: "已确认认缴资本", description: "截至基准日的已确认认缴资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    pendingCapitalDeltaYuan: field({ label: "待确认资本变动", description: "截至基准日的待确认资本变动，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    projectedSubscribedCapitalYuan: field({ label: "预计认缴资本", description: "已确认资本与待确认变动之和，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    shareRatio: field({ label: "持股比例", description: "已确认口径持股比例。", valueKind: "percent", sensitivity: "restricted" }),
    firstEventDate: field({ label: "首次事件日期", description: "股东首次进入股本事件的日期。", valueKind: "date", sensitivity: "confidential" }),
    latestEventDate: field({ label: "最近事件日期", description: "股东最近一次股本事件日期。", valueKind: "date", sensitivity: "confidential" }),
    profile: omit("nonScalar", "股东关系资料包含联系人等嵌套信息，不作为股权持仓标量字段暴露。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_SHARE_CAPITAL_EVENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ShareCapitalEventRecord>()({
  sourceKey: "capital-securities.share-capital-events",
  version: 1,
  label: "股本事件",
  description: "以目标公司在基准日前的一次股本事件为粒度；交易明细保留为后续子读模型。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "events",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    id: field({ label: "事件 ID", description: "股本事件内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    sequence: field({ label: "事件序号", description: "股本事件业务排序序号。", valueKind: "integer", sensitivity: "internal" }),
    eventType: field({ label: "事件类型", description: "设立、增资、减资、转让、回购或调整。", valueKind: "text", sensitivity: "internal" }),
    eventName: field({ label: "事件名称", description: "股本事件名称。", valueKind: "text", sensitivity: "confidential" }),
    effectiveDate: field({ label: "生效日期", description: "股本事件生效日期。", valueKind: "date", sensitivity: "confidential" }),
    effectiveDatePrecision: field({ label: "日期精度", description: "股本事件日期精确到日、月、年或未知。", valueKind: "text", sensitivity: "internal" }),
    ledgerMode: field({ label: "台账模式", description: "股本事件使用交易流水或确认快照。", valueKind: "text", sensitivity: "internal" }),
    dataCompleteness: field({ label: "数据完整度", description: "股本事件的持仓数据完整度。", valueKind: "text", sensitivity: "internal" }),
    recordStatus: field({ label: "记录状态", description: "已确认或待确认。", valueKind: "text", sensitivity: "internal" }),
    registeredCapitalBeforeYuan: field({ label: "变更前注册资本", description: "事件前注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    registeredCapitalAfterYuan: field({ label: "变更后注册资本", description: "事件后注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    sourceLabel: field({ label: "来源名称", description: "股本事件来源名称。", valueKind: "text", sensitivity: "confidential" }),
    sourceReference: field({ label: "来源引用", description: "股本事件来源引用文本。", valueKind: "text", sensitivity: "restricted" }),
    notes: field({ label: "备注", description: "股本事件备注。", valueKind: "text", sensitivity: "restricted" }),
    transactions: child("capital-securities.share-capital-transactions", "交易明细已拆成一交易一行的稳定子读模型。"),
    snapshotPositions: omit("nonScalar", "确认快照持仓是嵌套明细，不作为事件标量字段暴露。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_CAPTABLE_ROUNDS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CaptableRound>()({
  sourceKey: "capital-securities.captable-rounds",
  version: 1,
  label: "股权轮次",
  description: "以目标公司的一次股本轮次快照为粒度。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "captableRounds",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    eventId: field({ label: "事件 ID", description: "轮次对应的股本事件 ID。", valueKind: "integer", sensitivity: "internal" }),
    sequence: field({ label: "轮次序号", description: "轮次业务排序序号。", valueKind: "integer", sensitivity: "internal" }),
    label: field({ label: "轮次名称", description: "轮次展示名称。", valueKind: "text", sensitivity: "confidential" }),
    effectiveDate: field({ label: "生效日期", description: "轮次生效日期。", valueKind: "date", sensitivity: "confidential" }),
    recordStatus: field({ label: "记录状态", description: "已确认或待确认。", valueKind: "text", sensitivity: "internal" }),
    totalRegisteredCapitalYuan: field({ label: "注册资本", description: "该轮次后的注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_FINANCING_ROUNDS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<FinancingRound>()({
  sourceKey: "capital-securities.financing-rounds",
  version: 1,
  label: "融资轮次",
  description: "以一次可计算估值的融资轮次为粒度；出资方明细保留为后续子读模型。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "financingRounds",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    eventId: field({ label: "事件 ID", description: "融资轮次对应的股本事件 ID。", valueKind: "integer", sensitivity: "internal" }),
    sequence: field({ label: "轮次序号", description: "轮次业务排序序号。", valueKind: "integer", sensitivity: "internal" }),
    label: field({ label: "轮次名称", description: "融资轮次名称。", valueKind: "text", sensitivity: "confidential" }),
    effectiveDate: field({ label: "生效日期", description: "融资轮次生效日期。", valueKind: "date", sensitivity: "confidential" }),
    recordStatus: field({ label: "记录状态", description: "已确认或待确认。", valueKind: "text", sensitivity: "internal" }),
    kind: field({ label: "融资类型", description: "新增注册资本 primary 或存量转让 secondary。", valueKind: "text", sensitivity: "internal" }),
    registeredCapitalBeforeYuan: field({ label: "融资前注册资本", description: "融资前注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    registeredCapitalAfterYuan: field({ label: "融资后注册资本", description: "融资后注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    pricedRegisteredCapitalYuan: field({ label: "计价注册资本", description: "参与本轮定价的注册资本，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    totalConsiderationYuan: field({ label: "总对价", description: "本轮总对价，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    pricePerRegisteredCapitalYuan: field({ label: "每元注册资本价格", description: "每一元注册资本对应的交易价格。", valueKind: "currency", sensitivity: "restricted" }),
    preMoneyValuationYuan: field({ label: "投前估值", description: "本轮投前估值，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    postMoneyValuationYuan: field({ label: "投后估值", description: "本轮投后估值，单位元。", valueKind: "currency", sensitivity: "restricted" }),
    contributions: child("capital-securities.financing-contributions", "出资方明细已拆成一出资方一行的稳定子读模型。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  CAPITAL_SECURITIES_COMPANIES_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_OWNERSHIP_INTERESTS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_ORGANIZATIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_GOVERNANCE_POSITIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_INVESTOR_COMPANIES_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_SHAREHOLDERS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_SHARE_CAPITAL_EVENTS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_CAPTABLE_ROUNDS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_FINANCING_ROUNDS_ANALYSIS_SOURCE,
  ...CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_CHILD_SOURCE_REGISTRATIONS,
] as const;
