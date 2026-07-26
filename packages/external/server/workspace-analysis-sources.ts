import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelChild,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { ExternalParty } from "../types";

const field = (
  input: Omit<WorkspaceAnalysisReadModelField, "classification" | "exportPolicy"> & {
    exportPolicy?: WorkspaceAnalysisReadModelField["exportPolicy"];
  },
): WorkspaceAnalysisReadModelField => ({ classification: "field", exportPolicy: "allowed", ...input });

const child = (
  sourceKey: string,
  description: string,
): WorkspaceAnalysisReadModelChild => ({ classification: "childSource", sourceKey, description });

const workspaceScopes = {
  personal: { mode: "workspace", description: "往来主数据没有个人空间外键；显示当前账号按该角色权限可见的全公司数据。" },
  department: { mode: "workspace", description: "往来主数据没有可信目标部门外键；显示当前账号按该角色权限可见的全公司数据。" },
  project: { mode: "workspace", description: "往来主数据没有项目空间外键；显示当前账号按该角色权限可见的全公司数据。" },
} as const;

const externalPartyFields = (roleSourceKey: string) => ({
  id: field({ label: "主体 ID", description: "法定主体稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
  category: field({ label: "往来角色", description: "当前数据源固定的 customer 或 supplier 角色。", valueKind: "text", sensitivity: "internal" }),
  roles: child(roleSourceKey, "当前账号可见的主体业务角色拆为一主体一角色关系行，不因数组形状丢弃。"),
  subjectType: field({ label: "主体类型", description: "机构或个人。", valueKind: "text", sensitivity: "internal" }),
  relatedPartyType: field({ label: "关联方类型", description: "财务披露口径的关联关系类型。", valueKind: "text", sensitivity: "confidential" }),
  code: field({ label: "往来编码", description: "当前客户或供应商角色的业务编码。", valueKind: "text", sensitivity: "internal" }),
  name: field({ label: "名称", description: "主体名称。", valueKind: "text", sensitivity: "confidential" }),
  fullName: field({ label: "全称", description: "主体正式全称。", valueKind: "text", sensitivity: "confidential" }),
  classification: field({ label: "业务分类", description: "当前往来角色的业务分类。", valueKind: "text", sensitivity: "internal" }),
  identityNumber: field({ label: "统一代码或证件号", description: "机构统一代码或个人证件号码；复用当前角色 read 权限。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
  legalRepresentative: field({ label: "法定代表人", description: "机构法定代表人。", valueKind: "text", sensitivity: "restricted" }),
  contactPerson: field({ label: "联系人", description: "当前往来角色联系人。", valueKind: "text", sensitivity: "confidential" }),
  phone: field({ label: "联系电话", description: "当前往来角色联系电话。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
  email: field({ label: "邮箱", description: "当前往来角色联系邮箱。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
  bankName: field({ label: "开户行", description: "当前往来角色开户银行。", valueKind: "text", sensitivity: "restricted" }),
  bankAccount: field({ label: "银行账号", description: "当前往来角色银行账号。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
  address: field({ label: "地址", description: "当前往来角色联系地址。", valueKind: "text", sensitivity: "confidential" }),
  invoiceTitle: field({ label: "开票抬头", description: "当前往来角色开票抬头。", valueKind: "text", sensitivity: "confidential" }),
  invoiceAddressPhone: field({ label: "开票地址电话", description: "当前往来角色开票地址和电话。", valueKind: "text", sensitivity: "restricted" }),
  settlementTerms: field({ label: "结算条款", description: "当前往来角色结算条款。", valueKind: "text", sensitivity: "confidential" }),
  creditLimit: field({ label: "信用额度", description: "当前往来角色信用额度。", valueKind: "currency", sensitivity: "restricted" }),
  creditDays: field({ label: "信用天数", description: "当前往来角色信用账期天数。", valueKind: "integer", sensitivity: "confidential" }),
  taxRate: field({ label: "税率", description: "当前往来角色维护的税率百分数。", valueKind: "percent", sensitivity: "confidential" }),
  remark: field({ label: "备注", description: "当前往来角色备注。", valueKind: "text", sensitivity: "restricted" }),
  isActive: field({ label: "有效", description: "往来角色在所选服务端基准日是否有效。", valueKind: "boolean", sensitivity: "internal" }),
  availabilityVersion: field({ label: "角色期间版本", description: "角色可用期间命令的并发版本。", valueKind: "integer", sensitivity: "internal" }),
  availabilityTimeline: { classification: "omit", reason: "nonScalar", description: "角色可用期间时间线为嵌套修订集合，由业务详情展示，不作为主体标量字段。" },
  asOfDate: field({ label: "基准日", description: "法定事实与角色可用性投影使用的服务端业务日期。", valueKind: "date", sensitivity: "internal" }),
  legalFactRevision: field({ label: "法定事实修订", description: "当前已知法定事实台账的最新修订号。", valueKind: "integer", sensitivity: "internal" }),
  legalFactTimeline: { classification: "omit", reason: "nonScalar", description: "法定事实时间线为嵌套修订集合，由业务详情展示，不作为主体标量字段。" },
  version: field({ label: "主体版本", description: "共享主体聚合版本号。", valueKind: "integer", sensitivity: "internal" }),
  createdAt: field({ label: "创建日期", description: "主体记录创建日期。", valueKind: "date", sensitivity: "internal" }),
  updatedAt: field({ label: "更新日期", description: "主体记录最后更新日期。", valueKind: "date", sensitivity: "internal" }),
}) as const satisfies WorkspaceAnalysisReadModelFields<ExternalParty>;

export type ExternalPartyRoleAnalysisRow = {
  readonly rowKey: string;
  readonly partyId: ExternalParty["id"];
  readonly partyCode: ExternalParty["code"];
  readonly partyName: ExternalParty["name"];
  readonly sourceCategory: ExternalParty["category"];
  readonly role: ExternalParty["roles"][number];
};

function externalPartySource(input: {
  sourceKey: "external.customers" | "external.suppliers";
  roleSourceKey: "external.customer-roles" | "external.supplier-roles";
  label: string;
  apiPath: "/api/modules/external/customers" | "/api/modules/external/suppliers";
}) {
  return defineWorkspaceAnalysisReadModel<ExternalParty>()({
    sourceKey: input.sourceKey,
    version: 1,
    label: input.label,
    description: `以一个${input.label}角色为粒度，复用对应业务列表的对象可见性与 read 权限。`,
    apiPath: input.apiPath,
    rowsPath: "items",
    totalPath: "total",
    scopes: workspaceScopes,
    parameters: [
      { key: "keyword", label: "关键词", description: "匹配编码、名称、身份、联系、银行、地址、开票、结算或备注字段。", kind: "text", queryKey: "keyword" },
      { key: "asOfDate", label: "基准日", description: "按业务日期读取当日有效的法定事实。", kind: "date", queryKey: "asOfDate" },
    ],
    fields: externalPartyFields(input.roleSourceKey),
    pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 10 },
    limits: { maxRows: 5_000, maxGroups: 500, maxPageSize: 500, maxPages: 10, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 },
  });
}

function externalPartyRoleSource(input: {
  sourceKey: "external.customer-roles" | "external.supplier-roles";
  label: string;
  apiPath: "/api/modules/external/customers" | "/api/modules/external/suppliers";
}) {
  return defineWorkspaceAnalysisReadModel<ExternalPartyRoleAnalysisRow>()({
    sourceKey: input.sourceKey,
    version: 1,
    label: input.label,
    description: "以当前账号在原客户或供应商列表中可见的一条主体业务角色关系为粒度。",
    apiPath: input.apiPath,
    rowsPath: "items.roles",
    totalPath: "items.roles.length",
    scopes: workspaceScopes,
    parameters: [
      { key: "keyword", label: "关键词", description: "沿用对应主体列表的公开关键词筛选。", kind: "text", queryKey: "keyword" },
    ],
    fields: {
      rowKey: field({ label: "关系行键", description: "由来源角色、主体 ID 与可见角色组成的稳定行键。", valueKind: "text", sensitivity: "internal" }),
      partyId: field({ label: "主体 ID", description: "业务角色所属法定主体内部 ID。", valueKind: "integer", sensitivity: "internal" }),
      partyCode: field({ label: "主体编码", description: "当前来源角色下的主体业务编码。", valueKind: "text", sensitivity: "internal" }),
      partyName: field({ label: "主体名称", description: "当前来源角色下的主体名称。", valueKind: "text", sensitivity: "confidential" }),
      sourceCategory: field({ label: "来源角色", description: "本次读取所继承权限对应的 customer 或 supplier。", valueKind: "text", sensitivity: "internal" }),
      role: field({ label: "可见业务角色", description: "原业务服务按当前账号权限过滤后公开的 customer 或 supplier 角色。", valueKind: "text", sensitivity: "internal" }),
    },
    pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 20 },
    limits: { maxRows: 10_000, maxGroups: 500, maxPageSize: 500, maxPages: 20, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 },
  });
}

export const EXTERNAL_CUSTOMERS_ANALYSIS_SOURCE = externalPartySource({
  sourceKey: "external.customers",
  roleSourceKey: "external.customer-roles",
  label: "客户主数据",
  apiPath: "/api/modules/external/customers",
});

export const EXTERNAL_CUSTOMER_ROLES_ANALYSIS_SOURCE = externalPartyRoleSource({
  sourceKey: "external.customer-roles",
  label: "客户主体可见角色",
  apiPath: "/api/modules/external/customers",
});

export const EXTERNAL_SUPPLIERS_ANALYSIS_SOURCE = externalPartySource({
  sourceKey: "external.suppliers",
  roleSourceKey: "external.supplier-roles",
  label: "供应商主数据",
  apiPath: "/api/modules/external/suppliers",
});

export const EXTERNAL_SUPPLIER_ROLES_ANALYSIS_SOURCE = externalPartyRoleSource({
  sourceKey: "external.supplier-roles",
  label: "供应商主体可见角色",
  apiPath: "/api/modules/external/suppliers",
});

export const EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  EXTERNAL_CUSTOMERS_ANALYSIS_SOURCE,
  EXTERNAL_CUSTOMER_ROLES_ANALYSIS_SOURCE,
  EXTERNAL_SUPPLIERS_ANALYSIS_SOURCE,
  EXTERNAL_SUPPLIER_ROLES_ANALYSIS_SOURCE,
] as const;

export function *iterateExternalPartyRoleAnalysisRows(
  parties: readonly ExternalParty[],
): Generator<ExternalPartyRoleAnalysisRow> {
  for (const party of parties) {
    for (const role of party.roles) {
      yield {
        rowKey: `${party.category}:${party.id}:${role}`,
        partyId: party.id,
        partyCode: party.code,
        partyName: party.name,
        sourceCategory: party.category,
        role,
      };
    }
  }
}
