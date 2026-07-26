import "server-only";

import type { AuditLogEntry } from "@workspace/platform/server/audit-log";
import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelChild,
  type WorkspaceAnalysisReadModelField,
} from "@workspace/platform/server/workspace-analysis-read-model";

type HrAuditChangeRow = {
  rowKey: string;
  auditEntryId: number;
  entityId: string;
  entityName: string;
  version: number;
  editorName: string;
  createdAt: Date;
  changeOrdinal: number;
  field: string;
  label: string | null;
  from: string | null;
  to: string;
};

type PositionReportOverrideAnalysisRow = {
  id: number;
  positionId: number;
  companyId: number;
  companyCode: string | null;
  companyName: string | null;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  departmentPath: string;
  reportToPositionId: number | null;
  reportToPositionName: string | null;
  headcount: number | null;
  isActive: boolean;
  edpCount: number;
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
const child = (sourceKey: string, description: string): WorkspaceAnalysisReadModelChild => ({
  classification: "childSource",
  sourceKey,
  description,
});

const workspaceScopes = {
  personal: { mode: "workspace", description: "HR 治理记录没有个人空间外键；展示当前账号按原业务权限可见的全公司数据。" },
  department: { mode: "workspace", description: "HR 治理记录没有可信目标部门外键；展示当前账号按原业务权限可见的全公司数据。" },
  project: { mode: "workspace", description: "HR 治理记录没有项目空间外键；展示当前账号按原业务权限可见的全公司数据。" },
} as const;
const auditParameters = [
  { key: "entityType", label: "实体类型", description: "HR 允许审计的实体类型。", kind: "text", required: true, queryKey: "entityType" },
  { key: "date", label: "审计日期", description: "按上海自然日筛选审计记录。", kind: "date", queryKey: "date" },
] as const;
const auditPagination = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const auditLimits = { maxRows: 4_000, maxGroups: 500, maxPageSize: 200, maxPages: 20, maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 } as const;

export const HR_AUDIT_ENTRIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<AuditLogEntry>()({
  sourceKey: "hr.audit-entries",
  version: 1,
  label: "HR 变更审计记录",
  description: "以一次 HR 主数据版本变更为粒度，复用花名册审计列表及其实体类型约束。",
  apiPath: "/api/modules/hr/roster/audit-log",
  rowsPath: "entries",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: auditParameters,
  fields: {
    id: internal("integer", "审计记录 ID", "编辑历史记录内部 ID。"),
    entityId: internal("text", "业务记录 ID", "被修改 HR 记录的实体 ID。"),
    entityName: confidential("text", "业务记录名称", "被修改 HR 记录的展示名称。"),
    version: internal("integer", "版本", "该记录的审计版本号。"),
    editorName: confidential("text", "编辑人", "本次变更的编辑人员姓名。"),
    createdAt: internal("date", "变更时间", "审计版本创建时间。"),
    tag: internal("text", "审计标签", "审计记录内部标签；正常变更通常为空。"),
    action: internal("text", "变更动作", "创建或更新。"),
    canRestore: internal("boolean", "可恢复", "该实体历史版本是否支持恢复。"),
    changes: child("hr.audit-changes", "字段变更数组已拆为一字段变更一行的子数据源。"),
  },
  pagination: auditPagination,
  limits: auditLimits,
});

export const HR_AUDIT_CHANGES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<HrAuditChangeRow>()({
  sourceKey: "hr.audit-changes",
  version: 1,
  label: "HR 审计字段变更",
  description: "以一条字段级变更为粒度，完整保留审计列表公开的前值、后值和字段口径。",
  apiPath: "/api/modules/hr/roster/audit-log",
  rowsPath: "entries.changes",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: auditParameters,
  fields: {
    rowKey: internal("text", "变更行键", "由审计记录和字段序号组成的稳定行键。"),
    auditEntryId: internal("integer", "审计记录 ID", "字段变更所属审计记录 ID。"),
    entityId: internal("text", "业务记录 ID", "被修改 HR 记录的实体 ID。"),
    entityName: confidential("text", "业务记录名称", "被修改 HR 记录的展示名称。"),
    version: internal("integer", "版本", "字段变更所属审计版本号。"),
    editorName: confidential("text", "编辑人", "本次变更的编辑人员姓名。"),
    createdAt: internal("date", "变更时间", "字段变更所属审计版本时间。"),
    changeOrdinal: internal("integer", "字段序号", "字段变更在公开数组中的零基序号。"),
    field: internal("text", "字段键", "发生变化的原始字段键。"),
    label: internal("text", "字段名称", "业务审计口径中的字段名称。"),
    from: restricted("text", "变更前", "字段变更前的格式化公开值。"),
    to: restricted("text", "变更后", "字段变更后的格式化公开值。"),
  },
  pagination: auditPagination,
  limits: auditLimits,
});

export const HR_POSITION_REPORT_OVERRIDES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<PositionReportOverrideAnalysisRow>()({
  sourceKey: "hr.position-report-overrides",
  version: 1,
  label: "HR 岗位特殊汇报规则",
  description: "以一条岗位—公司—部门特殊汇报规则为粒度，复用原按岗位查询接口；positionId 必须明确提供。",
  apiPath: "/api/modules/hr/roster/position-report-overrides",
  rowsPath: "overrides",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "positionId", label: "来源岗位", description: "需要查询的来源岗位内部 ID。", kind: "integer", required: true, queryKey: "positionId" },
  ],
  fields: {
    id: internal("integer", "规则 ID", "特殊汇报规则内部 ID。"),
    positionId: internal("integer", "来源岗位 ID", "规则所属来源岗位 ID。"),
    companyId: internal("integer", "公司 ID", "规则适用公司 ID。"),
    companyCode: internal("text", "公司编码", "规则适用公司编码。"),
    companyName: confidential("text", "公司名称", "规则适用公司名称。"),
    departmentId: internal("integer", "部门 ID", "规则适用部门 ID。"),
    departmentCode: internal("text", "部门编码", "规则适用部门编码。"),
    departmentName: internal("text", "部门名称", "规则适用部门名称。"),
    departmentPath: internal("text", "部门路径", "公开 DTO 返回的部门路径口径。"),
    reportToPositionId: internal("integer", "汇报岗位 ID", "特殊汇报目标岗位 ID。"),
    reportToPositionName: internal("text", "汇报岗位", "特殊汇报目标岗位名称。"),
    headcount: confidential("integer", "编制", "该规则维护的编制人数。"),
    isActive: internal("boolean", "有效", "该特殊汇报规则是否有效。"),
    edpCount: confidential("integer", "实际人数", "当前引用该规则的 EDP 数量。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 1 },
  limits: { maxRows: 500, maxGroups: 500, maxPageSize: 500, maxPages: 1, maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 },
});

export const HR_WORKSPACE_ANALYSIS_GOVERNANCE_SOURCE_REGISTRATIONS = [
  HR_AUDIT_ENTRIES_ANALYSIS_SOURCE,
  HR_AUDIT_CHANGES_ANALYSIS_SOURCE,
  HR_POSITION_REPORT_OVERRIDES_ANALYSIS_SOURCE,
] as const;
