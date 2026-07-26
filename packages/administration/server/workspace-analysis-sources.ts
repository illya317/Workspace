import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelChild,
  type WorkspaceAnalysisReadModelField,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  ErpDiligenceEvidenceAttachment,
  ErpDiligenceEvidenceItem,
  ErpDiligenceProcessStep,
  ErpDiligenceSubmissionDto,
} from "@workspace/administration/types";

type AdministrationContractListRow = {
  id: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  category: string | null;
  content: string | null;
  handlerEmployeeId: number | null;
  signDate: string | null;
  endDate: string | null;
  status: string | null;
  amount: number | null;
  executedAmount: number | null;
  location: string | null;
  remark: string | null;
  editedBy: number | null;
  editedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  handlerEmployeeName: string | null;
  handlerEmployeeActive: boolean | null;
};

const field = (
  input: Omit<WorkspaceAnalysisReadModelField, "classification" | "exportPolicy"> & {
    exportPolicy?: WorkspaceAnalysisReadModelField["exportPolicy"];
  },
): WorkspaceAnalysisReadModelField => ({ classification: "field", exportPolicy: input.exportPolicy ?? "allowed", ...input });

const child = (sourceKey: string, description: string): WorkspaceAnalysisReadModelChild => ({
  classification: "childSource",
  sourceKey,
  description,
});

const internal = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ valueKind, label, description, sensitivity: "internal" })
);
const confidential = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ valueKind, label, description, sensitivity: "confidential" })
);
const restricted = (valueKind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field({ valueKind, label, description, sensitivity: "restricted" })
);

const workspaceScopes = {
  personal: { mode: "workspace", description: "合同台账没有个人外键；显示当前账号按合同权限可见的全公司台账。" },
  department: { mode: "workspace", description: "合同台账没有可信目标部门外键；显示当前账号按合同权限可见的全公司台账。" },
  project: { mode: "workspace", description: "合同台账没有项目外键；显示当前账号按合同权限可见的全公司台账。" },
} as const;

const viewerScopes = {
  personal: { mode: "viewer", description: "沿用 ERP 尽调工作台：普通查看人只看到自己的填报，具备查看全部权限者看到全部填报。", query: { requesterId: "requesterId" } },
  department: { mode: "viewer", description: "该工作台按查看者权限而非目标部门归属返回数据，不伪装成部门数据。", query: { requesterId: "requesterId" } },
  project: { mode: "viewer", description: "该工作台按查看者权限而非目标项目归属返回数据，不伪装成项目数据。", query: { requesterId: "requesterId" } },
} as const;

const diligencePagination = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const diligenceLimits = { maxRows: 4_000, maxGroups: 500, maxPageSize: 200, maxPages: 20, maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 } as const;

type ErpDiligenceAnswerValueRow = {
  rowKey: string;
  submissionId: number;
  respondentUserId: number;
  respondentName: string;
  departmentName: string;
  roleTitle: string;
  path: string;
  valueKind: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};

type ErpDiligenceProcessStepRow = ErpDiligenceProcessStep & {
  rowKey: string;
  submissionId: number;
  respondentUserId: number;
  respondentName: string;
  departmentName: string;
  roleTitle: string;
  stepOrdinal: number;
};

type ErpDiligenceProcessPainPointRow = {
  rowKey: string;
  submissionId: number;
  processStepKey: string;
  stepOrdinal: number;
  painPointOrdinal: number;
  painPoint: string;
};

type ErpDiligenceEvidenceRow = Omit<ErpDiligenceEvidenceItem, "attachments"> & {
  rowKey: string;
  submissionId: number;
  respondentUserId: number;
  respondentName: string;
  departmentName: string;
  roleTitle: string;
  evidenceOrdinal: number;
  attachments?: ErpDiligenceEvidenceAttachment[];
};

type ErpDiligenceAttachmentRow = ErpDiligenceEvidenceAttachment & {
  rowKey: string;
  submissionId: number;
  respondentUserId: number;
  evidenceOrdinal: number;
  attachmentOrdinal: number;
};

export const ADMINISTRATION_CONTRACTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<AdministrationContractListRow>()({
  sourceKey: "administration.contracts",
  version: 1,
  label: "行政合同台账",
  description: "以一份行政合同为粒度，完整复用合同列表 DTO 与 administration.contracts.read。",
  apiPath: "/api/modules/administration/contracts",
  rowsPath: "contracts",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "keyword", label: "关键词", description: "匹配合同编号、名称、主体、内容、股东、经办人或备注。", kind: "text", queryKey: "q" },
    { key: "location", label: "文件位置", description: "按合同文件位置精确筛选。", kind: "text", queryKey: "location" },
    { key: "category", label: "合同类型", description: "按合同类型精确筛选。", kind: "text", queryKey: "category" },
    { key: "status", label: "合同状态", description: "按合同状态精确筛选。", kind: "text", queryKey: "status" },
  ],
  fields: {
    id: field({ label: "合同 ID", description: "合同稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    contractNo: field({ label: "合同编号", description: "合同业务编号。", valueKind: "text", sensitivity: "confidential" }),
    name: field({ label: "合同名称", description: "合同名称。", valueKind: "text", sensitivity: "confidential" }),
    partyA: field({ label: "甲方", description: "合同甲方。", valueKind: "text", sensitivity: "confidential" }),
    partyB: field({ label: "乙方", description: "合同乙方。", valueKind: "text", sensitivity: "confidential" }),
    shareholder: field({ label: "股东", description: "合同台账维护的股东。", valueKind: "text", sensitivity: "confidential" }),
    category: field({ label: "合同类型", description: "合同类型。", valueKind: "text", sensitivity: "internal" }),
    content: field({ label: "合同内容", description: "合同台账维护的内容摘要。", valueKind: "text", sensitivity: "restricted" }),
    handlerEmployeeId: field({ label: "经办人 ID", description: "合同经办员工内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    signDate: field({ label: "签订日期", description: "合同签订日期。", valueKind: "date", sensitivity: "confidential" }),
    endDate: field({ label: "结束日期", description: "合同结束日期。", valueKind: "date", sensitivity: "confidential" }),
    status: field({ label: "状态", description: "合同当前状态。", valueKind: "text", sensitivity: "internal" }),
    amount: field({ label: "合同金额", description: "合同含税或台账约定金额，单位沿用业务记录。", valueKind: "currency", sensitivity: "restricted" }),
    executedAmount: field({ label: "已执行金额", description: "合同已执行金额，单位沿用业务记录。", valueKind: "currency", sensitivity: "restricted" }),
    location: field({ label: "文件位置", description: "合同文件归档位置文本，不读取附件内容。", valueKind: "text", sensitivity: "confidential" }),
    remark: field({ label: "备注", description: "合同备注。", valueKind: "text", sensitivity: "restricted" }),
    editedBy: field({ label: "最后编辑人 ID", description: "公开合同列表返回的最后编辑账号 ID。", valueKind: "integer", sensitivity: "internal" }),
    editedAt: field({ label: "最后编辑时间", description: "公开合同列表返回的最后编辑时间。", valueKind: "date", sensitivity: "internal" }),
    version: field({ label: "合同版本", description: "合同台账版本号。", valueKind: "integer", sensitivity: "internal" }),
    createdAt: field({ label: "记录创建时间", description: "合同台账记录创建时间；不等同于签订日期。", valueKind: "date", sensitivity: "internal" }),
    updatedAt: field({ label: "记录更新时间", description: "合同台账记录最后更新时间；不等同于合同业务状态日期。", valueKind: "date", sensitivity: "internal" }),
    handlerEmployeeName: field({ label: "经办人", description: "合同经办员工姓名。", valueKind: "text", sensitivity: "confidential" }),
    handlerEmployeeActive: field({ label: "经办人在职", description: "经办员工是否存在在职雇佣记录。", valueKind: "boolean", sensitivity: "confidential" }),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 10 },
  limits: { maxRows: 5_000, maxGroups: 500, maxPageSize: 500, maxPages: 10, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 },
});

export const ADMINISTRATION_ERP_DILIGENCE_SUBMISSIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceSubmissionDto>()({
  sourceKey: "administration.erp-diligence.submissions",
  version: 1,
  label: "ERP 尽调填报",
  description: "以一份当前查看者可见的 ERP 尽调填报为粒度；普通用户沿用原工作台只读自己的填报，查看全部权限不被二次收窄。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions",
  totalPath: "total",
  scopes: viewerScopes,
  fields: {
    id: internal("integer", "填报 ID", "ERP 尽调填报稳定内部 ID。"),
    respondentUserId: internal("integer", "填报用户 ID", "填报人的 Workspace 用户 ID。"),
    respondentName: confidential("text", "填报人", "填报人姓名。"),
    positionAssignmentId: internal("integer", "岗位关系 ID", "填报时选择的在职岗位关系 ID。"),
    departmentName: confidential("text", "部门", "填报时固化的部门名称。"),
    roleTitle: confidential("text", "岗位", "填报时固化的岗位名称。"),
    primaryArea: confidential("text", "主要领域", "填报人选择的主要业务领域。"),
    status: internal("text", "状态", "draft 或 submitted。"),
    answers: child("administration.erp-diligence.answers", "动态问卷答案拆为路径和值的一行一值数据源。"),
    processSteps: child("administration.erp-diligence.process-steps", "流程步骤拆为一流程步骤一行。"),
    evidenceItems: child("administration.erp-diligence.evidence-items", "证据清单拆为一证据项一行。"),
    campaignKey: internal("text", "活动键", "尽调活动稳定业务键。"),
    definitionVersion: internal("integer", "定义版本", "填报采用的问卷定义版本。"),
    submittedAt: internal("date", "提交时间", "填报正式提交时间。"),
    updatedAt: internal("date", "更新时间", "填报最后更新时间。"),
    version: internal("integer", "版本", "填报并发版本号。"),
    completionPercent: internal("percent", "完成度", "按当前尽调定义计算的填报完成百分比。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

const diligenceContextFields = {
  submissionId: internal("integer", "填报 ID", "所属 ERP 尽调填报 ID。"),
  respondentUserId: internal("integer", "填报用户 ID", "所属填报人的 Workspace 用户 ID。"),
  respondentName: confidential("text", "填报人", "所属填报人姓名。"),
  departmentName: confidential("text", "部门", "所属填报固化的部门名称。"),
  roleTitle: confidential("text", "岗位", "所属填报固化的岗位名称。"),
} as const;

export const ADMINISTRATION_ERP_DILIGENCE_ANSWERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceAnswerValueRow>()({
  sourceKey: "administration.erp-diligence.answers",
  version: 1,
  label: "ERP 尽调答案",
  description: "以一个公开问卷答案标量值为粒度，数组答案保留稳定下标路径。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions.answers",
  totalPath: "answerValueCount",
  scopes: viewerScopes,
  fields: {
    rowKey: internal("text", "答案行键", "由填报 ID 和答案路径组成的稳定行键。"),
    ...diligenceContextFields,
    path: internal("text", "答案路径", "问卷答案键及数组下标路径。"),
    valueKind: internal("text", "值类型", "null、text、number、boolean、array 或 object。"),
    textValue: restricted("text", "文本值", "答案的文本表达。"),
    numberValue: restricted("number", "数值", "答案为数值时的原值。"),
    booleanValue: restricted("boolean", "布尔值", "答案为布尔值时的原值。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

export const ADMINISTRATION_ERP_DILIGENCE_PROCESS_STEPS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceProcessStepRow>()({
  sourceKey: "administration.erp-diligence.process-steps",
  version: 1,
  label: "ERP 尽调流程步骤",
  description: "以一条公开流程步骤为粒度，完整保留原工作台的稳定标量字段。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions.processSteps",
  totalPath: "processStepCount",
  scopes: viewerScopes,
  fields: {
    rowKey: internal("text", "步骤行键", "由填报 ID、步骤键和序号组成。"),
    ...diligenceContextFields,
    stepOrdinal: internal("integer", "步骤序号", "流程步骤在原数组中的零基序号。"),
    key: internal("text", "步骤键", "流程步骤稳定键。"),
    activityKey: internal("text", "活动键", "流程活动稳定键。"),
    ownerPositionId: internal("integer", "责任岗位 ID", "流程步骤责任岗位 ID。"),
    ownerPositionName: confidential("text", "责任岗位", "流程步骤责任岗位名称。"),
    ownerDepartmentName: confidential("text", "责任部门", "流程步骤责任部门名称。"),
    frequency: internal("text", "频率", "流程发生频率。"),
    volumeBand: internal("text", "业务量", "流程业务量区间。"),
    touchTimeBand: internal("text", "操作时长", "流程人工触达时长区间。"),
    waitTimeBand: internal("text", "等待时长", "流程等待时长区间。"),
    executionMode: internal("text", "执行方式", "流程执行方式。"),
    inputStructure: internal("text", "输入结构", "流程输入数据结构化程度。"),
    ruleType: internal("text", "规则类型", "流程规则类型。"),
    variability: internal("text", "变异程度", "流程执行变异程度。"),
    exceptionRate: internal("text", "异常率", "流程异常率区间。"),
    errorRate: internal("text", "差错率", "流程差错率区间。"),
    handoffMode: internal("text", "交接方式", "流程交接方式。"),
    systemCount: internal("text", "系统数量", "流程涉及系统数量区间。"),
    logAvailability: internal("text", "日志可用性", "流程日志可获取程度。"),
    riskLevel: confidential("text", "风险等级", "填报的流程风险等级。"),
    reviewRequirement: confidential("text", "复核要求", "流程复核要求。"),
    painPoints: child("administration.erp-diligence.process-step-pain-points", "痛点数组拆为一条痛点一行。"),
    notes: restricted("text", "说明", "流程步骤补充说明。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

export const ADMINISTRATION_ERP_DILIGENCE_PROCESS_PAIN_POINTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceProcessPainPointRow>()({
  sourceKey: "administration.erp-diligence.process-step-pain-points",
  version: 1,
  label: "ERP 尽调流程痛点",
  description: "以一条流程痛点为粒度，保留所属填报和流程步骤。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions.processSteps.painPoints",
  totalPath: "painPointCount",
  scopes: viewerScopes,
  fields: {
    rowKey: internal("text", "痛点行键", "由填报、流程步骤和痛点序号组成。"),
    submissionId: internal("integer", "填报 ID", "所属 ERP 尽调填报 ID。"),
    processStepKey: internal("text", "步骤键", "所属流程步骤稳定键。"),
    stepOrdinal: internal("integer", "步骤序号", "所属流程步骤原数组序号。"),
    painPointOrdinal: internal("integer", "痛点序号", "痛点在原数组中的零基序号。"),
    painPoint: restricted("text", "痛点", "填报的流程痛点原文。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

export const ADMINISTRATION_ERP_DILIGENCE_EVIDENCE_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceEvidenceRow>()({
  sourceKey: "administration.erp-diligence.evidence-items",
  version: 1,
  label: "ERP 尽调证据项",
  description: "以一条公开证据要求为粒度，附件内容不进入分析但附件元数据另有子源。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions.evidenceItems",
  totalPath: "evidenceItemCount",
  scopes: viewerScopes,
  fields: {
    rowKey: internal("text", "证据行键", "由填报 ID、证据键和序号组成。"),
    ...diligenceContextFields,
    evidenceOrdinal: internal("integer", "证据序号", "证据项在原数组中的零基序号。"),
    key: internal("text", "证据键", "证据项稳定键。"),
    documentType: internal("text", "资料类型", "要求提供的资料类型。"),
    format: internal("text", "格式", "资料文件或内容格式。"),
    updateFrequency: internal("text", "更新频率", "资料更新频率。"),
    completeness: internal("text", "完整度", "资料完整程度。"),
    sampleLocation: restricted("text", "样本位置", "资料样本位置文本，不读取文件内容。"),
    ownerPositionId: internal("integer", "责任岗位 ID", "资料责任岗位 ID。"),
    ownerPositionName: confidential("text", "责任岗位", "资料责任岗位名称。"),
    ownerDepartmentName: confidential("text", "责任部门", "资料责任部门名称。"),
    notes: restricted("text", "说明", "证据项补充说明。"),
    attachments: child("administration.erp-diligence.evidence-attachments", "附件只登记公开元数据；下载内容永不进入分析。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

export const ADMINISTRATION_ERP_DILIGENCE_EVIDENCE_ATTACHMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ErpDiligenceAttachmentRow>()({
  sourceKey: "administration.erp-diligence.evidence-attachments",
  version: 1,
  label: "ERP 尽调附件元数据",
  description: "以一份可见证据附件的公开元数据为粒度；不读取、解析或导出附件二进制内容。",
  apiPath: "/api/modules/administration/erp-diligence",
  rowsPath: "submissions.evidenceItems.attachments",
  totalPath: "attachmentCount",
  scopes: viewerScopes,
  fields: {
    rowKey: internal("text", "附件行键", "由填报、证据和附件序号组成。"),
    submissionId: internal("integer", "填报 ID", "所属 ERP 尽调填报 ID。"),
    respondentUserId: internal("integer", "填报用户 ID", "所属填报人的 Workspace 用户 ID。"),
    evidenceOrdinal: internal("integer", "证据序号", "所属证据项原数组序号。"),
    attachmentOrdinal: internal("integer", "附件序号", "附件在原数组中的零基序号。"),
    attachmentUid: internal("text", "附件 UID", "附件稳定业务 UID。"),
    evidenceKey: internal("text", "证据键", "附件所属证据项键。"),
    fileName: restricted("text", "文件名", "公开附件文件名。"),
    mimeType: internal("text", "MIME 类型", "附件 MIME 类型。"),
    fileSize: internal("integer", "文件大小", "附件字节数。"),
    checksumSha256: field({ valueKind: "text", label: "校验值", description: "附件 SHA-256 完整性校验值。", sensitivity: "restricted", exportPolicy: "forbidden" }),
    uploadedAt: internal("date", "上传时间", "附件上传时间。"),
  },
  pagination: diligencePagination,
  limits: diligenceLimits,
});

export const ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  ADMINISTRATION_CONTRACTS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_SUBMISSIONS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_ANSWERS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_PROCESS_STEPS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_PROCESS_PAIN_POINTS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_EVIDENCE_ITEMS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_EVIDENCE_ATTACHMENTS_ANALYSIS_SOURCE,
] as const;
