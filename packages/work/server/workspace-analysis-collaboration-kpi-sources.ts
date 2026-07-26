import "server-only";

import type { WorkspaceAnalysisNestedValueRow } from "@workspace/platform/server/workspace-analysis-nested-values";
import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { listDepartmentCollaborations } from "./department-collaborations";
import type { toWorkKpiDefinitionDto } from "./work-kpi-dto";

type DepartmentCollaborationListResult = Awaited<ReturnType<typeof listDepartmentCollaborations>>;
type DepartmentCollaborationRow = Extract<DepartmentCollaborationListResult, { ok: true }>["data"]["collaborations"][number];
type DepartmentCollaborationAnalysisRow = DepartmentCollaborationRow & {
  readonly responsibleDepartmentId: number;
  readonly responsibleDepartmentCode: string;
  readonly responsibleDepartmentName: string;
};
type WorkKpiDefinitionRow = ReturnType<typeof toWorkKpiDefinitionDto>;
type DepartmentCollaborationContext = {
  readonly collaborationId: number;
  readonly collaborationTitle: string;
};
type DepartmentCollaborationEnablingDepartmentRow = DepartmentCollaborationRow["enablingDepartments"][number] & DepartmentCollaborationContext;
type DepartmentCollaborationPositionRow = DepartmentCollaborationRow["responsiblePositions"][number] & DepartmentCollaborationContext;
type DepartmentCollaborationPlanRow = DepartmentCollaborationRow["workPlans"][number] & DepartmentCollaborationContext;
type DepartmentCollaborationItemRow = DepartmentCollaborationRow["workItems"][number] & DepartmentCollaborationContext;
type WorkKpiDefinitionScoringRuleValueRow = WorkspaceAnalysisNestedValueRow & {
  readonly rowKey: string;
  readonly definitionId: number;
  readonly definitionCode: string;
  readonly definitionVersion: number;
  readonly definitionName: string;
};

const field = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
  options: Partial<Pick<WorkspaceAnalysisReadModelField, "sensitivity" | "exportPolicy" | "capabilities">> = {},
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  valueKind,
  label,
  description,
  sensitivity: options.sensitivity ?? "internal",
  exportPolicy: options.exportPolicy ?? "allowed",
  ...(options.capabilities ? { capabilities: options.capabilities } : {}),
});
const id = (label: string, description: string) => field("integer", label, description, {
  capabilities: { groupable: true, aggregateOperations: ["count", "distinctCount"] },
});
const confidential = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description, { sensitivity: "confidential" })
);
const narrative = (label: string, description: string, sensitivity: "internal" | "confidential" = "internal") => (
  field("text", label, description, { sensitivity, capabilities: { groupable: false } })
);
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => ({ classification: "childSource", sourceKey, description } as const);

const DEPARTMENT_TARGET_SCOPE = {
  department: { mode: "target", description: "只读取目标部门原协作页面可见的协作事项。", query: { departmentId: "scopeId" } },
} as const;
const KPI_DEFINITION_SCOPES = {
  personal: { mode: "target", description: "强制绑定目标个人以复用原指标库查看资格；指标行本身仍以归口部门表达归属。", query: { targetType: "scopeType", targetId: "scopeId" } },
  department: { mode: "target", description: "强制绑定目标部门以复用原指标库查看资格；可用归口部门参数进一步收窄指标行。", query: { targetType: "scopeType", targetId: "scopeId" } },
  project: { mode: "target", description: "强制绑定目标项目以复用原指标库查看资格；指标行本身仍以归口部门表达归属。", query: { targetType: "scopeType", targetId: "scopeId" } },
} as const;
const STANDARD_LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 20,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const STANDARD_PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 } as const;

export const WORK_DEPARTMENT_COLLABORATIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationAnalysisRow>()({
  sourceKey: "work.department-collaborations",
  version: 1,
  label: "部门协作事项",
  description: "以一条目标部门原协作页面可见的协作事项为粒度，保留负责岗位与赋能部门关系带来的原对象级过滤。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: {
    id: id("协作事项 ID", "部门协作事项稳定标识。"),
    title: confidential("text", "协作事项", "部门协作事项标题。"),
    description: narrative("协作说明", "协作事项说明。", "confidential"),
    collaborationType: field("text", "协作类型", "routine、periodic、event 或 temporary。"),
    triggerRule: narrative("触发规则", "协作事项的触发规则。", "confidential"),
    scopeDescription: narrative("协作范围", "协作事项覆盖的业务范围。", "confidential"),
    inputRequirement: narrative("输入要求", "发起协作所需输入。", "confidential"),
    deliverable: narrative("交付物", "协作事项约定的交付物。", "confidential"),
    acceptanceCriteria: narrative("验收标准", "协作事项约定的验收标准。", "confidential"),
    responseTargetHours: field("integer", "响应目标（小时）", "协作事项约定的响应时长。"),
    deliveryTargetDays: field("integer", "交付目标（天）", "协作事项约定的交付天数。"),
    effectiveFrom: field("date", "生效日期", "协作事项生效日期。"),
    effectiveTo: field("date", "失效日期", "协作事项失效日期。"),
    escalationPolicy: narrative("升级规则", "协作事项的升级处理规则。", "confidential"),
    status: field("text", "状态", "协作事项当前状态。"),
    isArchived: field("boolean", "已归档", "协作事项是否已归档。"),
    responsibleDepartment: omit("derivedDuplicate", "负责部门公开对象已无损投影为 ID、编码和名称三个分析字段。"),
    responsibleDepartmentId: {
      ...id("负责部门 ID", "协作事项权威负责部门标识。"),
      fieldPath: "responsibleDepartment.id",
    },
    responsibleDepartmentCode: {
      ...field("text", "负责部门编码", "协作事项权威负责部门业务编码。"),
      fieldPath: "responsibleDepartment.code",
    },
    responsibleDepartmentName: {
      ...confidential("text", "负责部门", "协作事项权威负责部门名称。"),
      fieldPath: "responsibleDepartment.name",
    },
    role: field("text", "当前部门角色", "目标部门在协作事项中是 responsible 或 enabling。"),
    currentResponseStatus: field("text", "当前部门响应状态", "目标部门作为赋能部门时的 pending、accepted 或 rejected 状态。"),
    enablingDepartments: child("work.department-collaboration-enabling-departments", "赋能部门与响应状态拆为一协作一部门关系源。"),
    responsiblePositions: child("work.department-collaboration-responsible-positions", "负责岗位拆为一协作一岗位关系源。"),
    executorPositions: child("work.department-collaboration-executor-positions", "执行岗位拆为一协作一岗位关系源。"),
    workPlans: child("work.department-collaboration-plans", "关联工作计划拆为一协作一计划关系源。"),
    workItems: child("work.department-collaboration-items", "关联工作节点拆为一协作一节点关系源。"),
    createdAt: field("date", "创建时间", "协作事项创建时间。"),
    updatedAt: field("date", "更新时间", "协作事项最后更新时间。"),
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

const departmentCollaborationContextFields = {
  collaborationId: id("协作事项 ID", "关系所属部门协作事项标识。"),
  collaborationTitle: confidential("text", "协作事项", "关系所属部门协作事项标题。"),
} as const;

export const WORK_DEPARTMENT_COLLABORATION_ENABLING_DEPARTMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationEnablingDepartmentRow>()({
  sourceKey: "work.department-collaboration-enabling-departments",
  version: 1,
  label: "部门协作赋能部门",
  description: "以一条目标部门可见协作事项与一个赋能部门的公开关系为粒度。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations.enablingDepartments",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: {
    id: id("赋能关系 ID", "协作事项与赋能部门的关系标识。"),
    departmentId: id("赋能部门 ID", "赋能部门标识。"),
    departmentCode: field("text", "赋能部门编码", "赋能部门业务编码。"),
    departmentName: field("text", "赋能部门", "赋能部门名称。"),
    responseStatus: field("text", "响应状态", "pending、accepted 或 rejected。"),
    responseNote: narrative("响应说明", "赋能部门的响应说明。", "confidential"),
    respondedAt: field("date", "响应时间", "赋能部门完成响应的时间。"),
    ...departmentCollaborationContextFields,
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

const departmentCollaborationPositionFields = {
  id: id("岗位 ID", "协作岗位标识。"),
  code: field("text", "岗位编码", "协作岗位业务编码。"),
  name: confidential("text", "岗位", "协作岗位名称。"),
  departmentId: id("岗位部门 ID", "岗位所属部门标识。"),
  departmentCode: field("text", "岗位部门编码", "岗位所属部门业务编码。"),
  departmentName: field("text", "岗位部门", "岗位所属部门名称。"),
  ...departmentCollaborationContextFields,
} as const;

export const WORK_DEPARTMENT_COLLABORATION_RESPONSIBLE_POSITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationPositionRow>()({
  sourceKey: "work.department-collaboration-responsible-positions",
  version: 1,
  label: "部门协作负责岗位",
  description: "以一条目标部门可见协作事项与一个负责岗位的公开关系为粒度。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations.responsiblePositions",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: departmentCollaborationPositionFields,
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

export const WORK_DEPARTMENT_COLLABORATION_EXECUTOR_POSITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationPositionRow>()({
  sourceKey: "work.department-collaboration-executor-positions",
  version: 1,
  label: "部门协作执行岗位",
  description: "以一条目标部门可见协作事项与一个执行岗位的公开关系为粒度。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations.executorPositions",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: departmentCollaborationPositionFields,
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

export const WORK_DEPARTMENT_COLLABORATION_PLANS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationPlanRow>()({
  sourceKey: "work.department-collaboration-plans",
  version: 1,
  label: "部门协作关联计划",
  description: "以一条目标部门可见协作事项与一个未归档工作计划的公开关系为粒度。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations.workPlans",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: {
    id: id("计划 ID", "关联工作计划标识。"),
    title: confidential("text", "计划", "关联工作计划标题。"),
    status: field("text", "计划状态", "关联工作计划当前状态。"),
    targetType: field("text", "计划空间类型", "关联计划所属空间类型。"),
    targetId: id("计划空间 ID", "关联计划所属空间标识。"),
    plannedStartDate: field("date", "计划开始", "关联计划的计划开始日期。"),
    plannedEndDate: field("date", "计划结束", "关联计划的计划结束日期。"),
    ...departmentCollaborationContextFields,
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

export const WORK_DEPARTMENT_COLLABORATION_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentCollaborationItemRow>()({
  sourceKey: "work.department-collaboration-items",
  version: 1,
  label: "部门协作关联节点",
  description: "以一条目标部门可见协作事项与一个未归档工作节点的公开关系为粒度。",
  apiPath: "/api/modules/work/tasks/collaborations",
  rowsPath: "collaborations.workItems",
  totalPath: "total",
  scopes: DEPARTMENT_TARGET_SCOPE,
  fields: {
    id: id("工作节点 ID", "关联工作节点标识。"),
    planId: id("计划 ID", "关联节点所属计划标识。"),
    content: confidential("text", "工作节点", "关联工作节点内容。"),
    status: field("text", "节点状态", "关联工作节点当前状态。"),
    targetType: field("text", "节点空间类型", "关联节点所属空间类型。"),
    targetId: id("节点空间 ID", "关联节点所属空间标识。"),
    plannedStartDate: field("date", "计划开始", "关联节点的计划开始日期。"),
    plannedEndDate: field("date", "计划结束", "关联节点的计划结束日期。"),
    owner: omit("notPublic", "原公开 JSON 已移除底层 owner 对象，仅保留负责人姓名。"),
    ownerEmployeeName: confidential("text", "负责人", "关联工作节点负责人姓名。"),
    ...departmentCollaborationContextFields,
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

export const WORK_KPI_DEFINITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkKpiDefinitionRow>()({
  sourceKey: "work.kpi-definitions",
  version: 1,
  label: "KPI 指标定义",
  description: "以一版 KPI 指标定义为粒度；目标空间只复用原指标库查看资格，指标归属仍由归口部门字段表达。",
  apiPath: "/api/modules/work/tasks/kpi/definitions",
  rowsPath: "definitions",
  totalPath: "total",
  scopes: KPI_DEFINITION_SCOPES,
  parameters: [
    { key: "ownerDepartmentId", queryKey: "ownerDepartmentId", label: "归口部门", description: "只读取指定归口部门的指标定义。", kind: "integer" },
    { key: "includeRetired", queryKey: "includeRetired", label: "包含停用", description: "是否包含 retired 指标定义。", kind: "boolean" },
  ],
  fields: {
    id: id("指标定义 ID", "KPI 指标定义版本标识。"),
    code: field("text", "指标编码", "跨版本稳定的 KPI 指标业务编码。"),
    version: id("指标版本", "同一指标编码的修订版本号。"),
    status: field("text", "状态", "draft、active 或 retired。"),
    name: confidential("text", "指标名称", "KPI 指标名称。"),
    description: narrative("指标说明", "KPI 指标定义说明。", "confidential"),
    valueType: field("text", "值类型", "指标原始值类型。"),
    displayType: field("text", "展示类型", "number、percent、currency 或 count。"),
    unit: field("text", "单位", "指标计量单位。"),
    direction: field("text", "指标方向", "higher_is_better、lower_is_better 或 target_range。"),
    scoringRule: child("work.kpi-definition-scoring-rule-values", "评分规则是嵌套值，拆为确定性路径和值子读模型。"),
    measurementMode: field("text", "取数方式", "指标定义的取数方式。"),
    ownerDepartmentId: id("归口部门 ID", "指标定义归口部门标识。"),
    ownerDepartmentCode: field("text", "归口部门编码", "指标定义归口部门业务编码。"),
    ownerDepartmentName: field("text", "归口部门", "指标定义归口部门名称。"),
    referenceCount: field("integer", "引用数", "当前指标定义版本被计分卡引用的数量。"),
    createdByUserId: id("创建人用户 ID", "指标定义版本创建用户标识。"),
    createdAt: field("date", "创建时间", "指标定义版本创建时间。"),
    updatedAt: field("date", "更新时间", "指标定义版本最后更新时间。"),
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});

export const WORK_KPI_DEFINITION_SCORING_RULE_VALUES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkKpiDefinitionScoringRuleValueRow>()({
  sourceKey: "work.kpi-definition-scoring-rule-values",
  version: 1,
  label: "KPI 评分规则字段",
  description: "以一个 KPI 指标定义评分规则的确定性字段路径和值为粒度。",
  apiPath: "/api/modules/work/tasks/kpi/definitions",
  rowsPath: "definitions.scoringRuleValues",
  totalPath: "total",
  scopes: KPI_DEFINITION_SCOPES,
  parameters: [
    { key: "ownerDepartmentId", queryKey: "ownerDepartmentId", label: "归口部门", description: "只读取指定归口部门指标的评分规则。", kind: "integer" },
    { key: "includeRetired", queryKey: "includeRetired", label: "包含停用", description: "是否包含 retired 指标定义的评分规则。", kind: "boolean" },
  ],
  fields: {
    rowKey: field("text", "规则字段行键", "由指标定义版本与评分规则字段路径组成的稳定行键。"),
    definitionId: id("指标定义 ID", "评分规则所属指标定义版本标识。"),
    definitionCode: field("text", "指标编码", "评分规则所属指标业务编码。"),
    definitionVersion: id("指标版本", "评分规则所属指标修订版本号。"),
    definitionName: confidential("text", "指标名称", "评分规则所属指标名称。"),
    path: field("text", "字段路径", "评分规则中的确定性字段路径。"),
    valueKind: field("text", "值类型", "字段值的原始标量或容器类型。"),
    textValue: confidential("text", "文本值", "字段值的无损文本表示。"),
    numberValue: confidential("number", "数值", "字段原值为数字时的数值列，否则为空。"),
    booleanValue: confidential("boolean", "布尔值", "字段原值为布尔值时的布尔列，否则为空。"),
  },
  pagination: STANDARD_PAGINATION,
  limits: STANDARD_LIMITS,
});
