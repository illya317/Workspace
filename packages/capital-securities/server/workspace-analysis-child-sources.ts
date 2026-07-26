import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type {
  CaptableRoundPosition,
  FinancingRoundContribution,
  OwnershipStructureEdge,
  OwnershipStructureNode,
  ShareCapitalTransactionRecord,
} from "../types";

type OrganizationDescriptionValueRow = {
  rowKey: string;
  organizationId: number;
  organizationCode: string;
  organizationName: string;
  descriptionId: number;
  sourceFile: string;
  codeRaw: string | null;
  path: string;
  valueKind: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};

type OrganizationManagerRow = {
  rowKey: string;
  organizationId: number;
  organizationCode: string;
  organizationName: string;
  employeeId: number | null;
  employeeName: string | null;
  ordinal: number;
};

type GovernancePositionManagementRow = {
  rowKey: string;
  positionId: number;
  positionCode: string;
  positionName: string;
  managedOrganizationId: number;
  ordinal: number;
};

type ShareCapitalTransactionAnalysisRow = ShareCapitalTransactionRecord & {
  eventId: number;
  eventSequence: number;
  eventName: string;
  effectiveDate: string;
  recordStatus: string;
};

type FinancingContributionAnalysisRow = FinancingRoundContribution & {
  eventId: number;
  roundSequence: number;
  roundLabel: string;
  effectiveDate: string;
  recordStatus: string;
  kind: string;
};

type CaptablePositionAnalysisRow = CaptableRoundPosition & {
  rowKey: string;
  partyId: number;
  partyName: string;
};

const field = (
  input: Omit<WorkspaceAnalysisReadModelField, "classification" | "exportPolicy"> & {
    exportPolicy?: WorkspaceAnalysisReadModelField["exportPolicy"];
  },
): WorkspaceAnalysisReadModelField => ({ classification: "field", exportPolicy: "allowed", ...input });

const internal = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ label, description, valueKind, sensitivity: "internal" })
);
const confidential = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ label, description, valueKind, sensitivity: "confidential" })
);
const restricted = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ label, description, valueKind, sensitivity: "restricted" })
);

const workspaceScopes = {
  personal: { mode: "workspace", description: "资本治理数据没有个人空间外键；展示当前账号按业务权限可见的全公司数据。" },
  department: { mode: "workspace", description: "资本治理数据没有可信目标部门外键；展示当前账号按业务权限可见的全公司数据。" },
  project: { mode: "workspace", description: "资本治理数据没有项目空间外键；展示当前账号按业务权限可见的全公司数据。" },
} as const;
const pagination = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 20 } as const;
const limits = { maxRows: 10_000, maxGroups: 500, maxPageSize: 500, maxPages: 20, maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 } as const;
const investorParameters = [
  { key: "issuerCompanyId", label: "目标公司", description: "选择投资人关系视图的目标公司 ID。", kind: "integer", queryKey: "issuerCompanyId" },
  { key: "asOf", label: "基准日", description: "按 YYYY-MM-DD 基准日读取股本与投资人关系。", kind: "date", queryKey: "asOf" },
] as const;

export const CAPITAL_SECURITIES_ORGANIZATION_DESCRIPTIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<OrganizationDescriptionValueRow>()({
  sourceKey: "capital-securities.organization-descriptions",
  version: 1,
  label: "治理组织说明书字段",
  description: "以一条治理组织说明书动态字段为粒度，把公开 details 完整规范化为可筛选标量行。",
  apiPath: "/api/modules/capitalSecurities/governance/organizations",
  rowsPath: "organizations.descriptions",
  totalPath: "total",
  scopes: workspaceScopes,
  fields: {
    rowKey: internal("text", "明细行键", "由组织、说明书和字段路径组成的稳定行键。"),
    organizationId: internal("integer", "组织 ID", "说明书所属治理组织 ID。"),
    organizationCode: internal("text", "组织编码", "说明书所属治理组织编码。"),
    organizationName: internal("text", "组织名称", "说明书所属治理组织名称。"),
    descriptionId: internal("integer", "说明书 ID", "治理组织说明书内部 ID。"),
    sourceFile: confidential("text", "来源文件", "公开说明书记录的来源文件标识。"),
    codeRaw: internal("text", "原始编码", "说明书保留的原始来源编码。"),
    path: internal("text", "字段路径", "动态 details 中的确定性字段路径。"),
    valueKind: internal("text", "值类型", "字段值的原始标量类型或空容器类型。"),
    textValue: confidential("text", "文本值", "字段值的无损文本表示。"),
    numberValue: confidential("number", "数值", "字段原值为数字时的数值列。"),
    booleanValue: confidential("boolean", "布尔值", "字段原值为布尔值时的布尔列。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_ORGANIZATION_MANAGERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<OrganizationManagerRow>()({
  sourceKey: "capital-securities.organization-managers",
  version: 1,
  label: "治理组织负责人",
  description: "以一名治理组织负责人为粒度，保留公开 DTO 中负责人 ID 与姓名数组的对应关系。",
  apiPath: "/api/modules/capitalSecurities/governance/organizations",
  rowsPath: "organizations.managerEmployeeIds",
  totalPath: "total",
  scopes: workspaceScopes,
  fields: {
    rowKey: internal("text", "关系行键", "由组织和数组序号组成的稳定行键。"),
    organizationId: internal("integer", "组织 ID", "负责人所属治理组织 ID。"),
    organizationCode: internal("text", "组织编码", "负责人所属治理组织编码。"),
    organizationName: internal("text", "组织名称", "负责人所属治理组织名称。"),
    employeeId: internal("integer", "员工 ID", "公开负责人数组中的员工内部 ID。"),
    employeeName: confidential("text", "负责人姓名", "公开负责人数组中的员工姓名。"),
    ordinal: internal("integer", "数组序号", "负责人在公开 DTO 数组中的零基序号。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_GOVERNANCE_POSITION_MANAGEMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<GovernancePositionManagementRow>()({
  sourceKey: "capital-securities.governance-position-managements",
  version: 1,
  label: "治理岗位负责组织",
  description: "以一条治理岗位—负责组织关系为粒度，规范化公开 managerOfDepartmentIds 数组。",
  apiPath: "/api/modules/capitalSecurities/governance/organizations",
  rowsPath: "positions.managerOfDepartmentIds",
  totalPath: "total",
  scopes: workspaceScopes,
  fields: {
    rowKey: internal("text", "关系行键", "由岗位、组织和数组序号组成的稳定行键。"),
    positionId: internal("integer", "岗位 ID", "治理岗位内部 ID。"),
    positionCode: internal("text", "岗位编码", "治理岗位业务编码。"),
    positionName: internal("text", "岗位名称", "治理岗位名称。"),
    managedOrganizationId: internal("integer", "负责组织 ID", "该岗位负责的治理组织内部 ID。"),
    ordinal: internal("integer", "数组序号", "负责组织在公开 DTO 数组中的零基序号。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_SHARE_CAPITAL_TRANSACTIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ShareCapitalTransactionAnalysisRow>()({
  sourceKey: "capital-securities.share-capital-transactions",
  version: 1,
  label: "股本交易明细",
  description: "以股本事件中的一笔交易为粒度，保留交易及其事件上下文的全部公开标量字段。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "events.transactions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    eventId: internal("integer", "事件 ID", "交易所属股本事件 ID。"),
    eventSequence: internal("integer", "事件序号", "交易所属股本事件序号。"),
    eventName: confidential("text", "事件名称", "交易所属股本事件名称。"),
    effectiveDate: confidential("date", "生效日期", "交易所属股本事件生效日期。"),
    recordStatus: internal("text", "记录状态", "交易所属事件为已确认或待确认。"),
    id: internal("integer", "交易 ID", "股本交易内部 ID。"),
    sequence: internal("integer", "交易序号", "交易在事件内的业务序号。"),
    fromPartyId: internal("integer", "转出方主体 ID", "转出方法定主体内部 ID。"),
    fromPartyName: confidential("text", "转出方", "转出方主体名称。"),
    toPartyId: internal("integer", "转入方主体 ID", "转入方法定主体内部 ID。"),
    toPartyName: confidential("text", "转入方", "转入方主体名称。"),
    registeredCapitalAmountYuan: restricted("currency", "注册资本金额", "本笔交易对应注册资本金额，单位元。"),
    considerationAmountYuan: restricted("currency", "交易对价", "本笔交易对价，单位元。"),
    sourceReference: restricted("text", "来源引用", "交易来源引用文本。"),
    notes: restricted("text", "备注", "股本交易备注。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_FINANCING_CONTRIBUTIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<FinancingContributionAnalysisRow>()({
  sourceKey: "capital-securities.financing-contributions",
  version: 1,
  label: "融资轮次出资方",
  description: "以融资轮次的一名出资方为粒度，保留全部公开出资标量与轮次上下文。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "financingRounds.contributions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    eventId: internal("integer", "事件 ID", "融资轮次对应股本事件 ID。"),
    roundSequence: internal("integer", "轮次序号", "融资轮次业务序号。"),
    roundLabel: confidential("text", "轮次名称", "融资轮次名称。"),
    effectiveDate: confidential("date", "生效日期", "融资轮次生效日期。"),
    recordStatus: internal("text", "记录状态", "融资轮次为已确认或待确认。"),
    kind: internal("text", "融资类型", "新增注册资本或存量转让。"),
    partyId: internal("integer", "出资方主体 ID", "出资方法定主体内部 ID。"),
    partyName: confidential("text", "出资方", "出资方主体名称。"),
    registeredCapitalAmountYuan: restricted("currency", "注册资本金额", "该出资方参与计价的注册资本金额。"),
    considerationAmountYuan: restricted("currency", "出资对价", "该出资方本轮对价金额。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_CAPTABLE_POSITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CaptablePositionAnalysisRow>()({
  sourceKey: "capital-securities.captable-positions",
  version: 1,
  label: "股权轮次股东持仓",
  description: "以一名股东在一个股权轮次的持仓为粒度，规范化公开 captableRows.positions。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "captableRows.positions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    rowKey: internal("text", "持仓行键", "由股东主体与事件组成的稳定行键。"),
    partyId: internal("integer", "股东主体 ID", "股东法定主体内部 ID。"),
    partyName: confidential("text", "股东名称", "股东主体名称。"),
    eventId: internal("integer", "事件 ID", "持仓对应股本事件 ID。"),
    isPresent: internal("boolean", "是否持仓", "该股东在对应轮次是否持有权益。"),
    subscribedCapitalYuan: restricted("currency", "认缴资本", "该股东在该轮次后的认缴资本金额。"),
    shareRatio: restricted("percent", "持股比例", "该股东在该轮次后的持股比例。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_OWNERSHIP_STRUCTURE_NODES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<OwnershipStructureNode>()({
  sourceKey: "capital-securities.ownership-structure-nodes",
  version: 1,
  label: "股权结构节点",
  description: "以股权结构图中的一个主体节点为粒度，保留公开图模型的全部标量字段。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "ownershipStructure.nodes",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    key: internal("text", "节点键", "股权结构图节点稳定键。"),
    entityPartyId: internal("integer", "主体 ID", "节点对应法定主体 ID。"),
    companyId: internal("integer", "公司 ID", "节点对应内部公司 ID。"),
    label: confidential("text", "节点名称", "节点展示名称。"),
    subtitle: confidential("text", "节点副标题", "节点展示副标题。"),
    role: internal("text", "节点角色", "焦点、股东、子公司或共同持股方。"),
    layoutOrder: internal("integer", "布局序号", "公开图模型的布局序号。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_OWNERSHIP_STRUCTURE_EDGES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<OwnershipStructureEdge>()({
  sourceKey: "capital-securities.ownership-structure-edges",
  version: 1,
  label: "股权结构关系",
  description: "以股权结构图中的一条关系边为粒度，保留公开图模型的全部标量字段。",
  apiPath: "/api/modules/capitalSecurities/investors",
  rowsPath: "ownershipStructure.edges",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: investorParameters,
  fields: {
    key: internal("text", "关系键", "股权结构图关系稳定键。"),
    source: internal("text", "来源节点", "关系来源节点键。"),
    target: internal("text", "目标节点", "关系目标节点键。"),
    shareRatio: restricted("percent", "持股比例", "关系在基准日的持股比例。"),
    previousShareRatio: restricted("percent", "前次持股比例", "关系前次确认持股比例。"),
    recordStatus: internal("text", "记录状态", "关系为已确认或待确认。"),
    relationType: internal("text", "关系类型", "股本关系或长期股权关系。"),
    isConsolidated: confidential("boolean", "纳入合并", "该长期股权关系是否纳入合并。"),
  },
  pagination,
  limits,
});

export const CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_CHILD_SOURCE_REGISTRATIONS = [
  CAPITAL_SECURITIES_ORGANIZATION_DESCRIPTIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_ORGANIZATION_MANAGERS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_GOVERNANCE_POSITION_MANAGEMENTS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_SHARE_CAPITAL_TRANSACTIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_FINANCING_CONTRIBUTIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_CAPTABLE_POSITIONS_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_OWNERSHIP_STRUCTURE_NODES_ANALYSIS_SOURCE,
  CAPITAL_SECURITIES_OWNERSHIP_STRUCTURE_EDGES_ANALYSIS_SOURCE,
] as const;
