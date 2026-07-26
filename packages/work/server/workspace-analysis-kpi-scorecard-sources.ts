import "server-only";

import {
  flattenWorkspaceAnalysisNestedValue,
  type WorkspaceAnalysisNestedValueRow,
} from "@workspace/platform/server/workspace-analysis-nested-values";
import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { executeGetKpiScorecardCommand } from "./work-kpi-route-command";

type KpiScorecardResult = Awaited<ReturnType<typeof executeGetKpiScorecardCommand>>;
export type WorkKpiScorecardData = Extract<KpiScorecardResult, { ok: true }>["data"];

type ScorecardAssignment = WorkKpiScorecardData["assignments"][number];
type ScorecardDefinition = ScorecardAssignment["definition"];
type ScorecardSourceAssignment = NonNullable<ScorecardAssignment["sourceAssignment"]>;
type ScorecardEvidenceTask = ScorecardAssignment["evidence"][number];
type ScorecardLatestResult = NonNullable<ScorecardAssignment["latestResult"]>;

export type WorkKpiScorecardPlanAnalysisRow = WorkKpiScorecardData["plan"] & {
  readonly totalWeight: number;
};
export type WorkKpiScorecardDefinitionAnalysisRow = ScorecardDefinition & {
  readonly assignmentId: number;
  readonly workPlanId: number;
};
export type WorkKpiScorecardSourceAssignmentAnalysisRow = ScorecardSourceAssignment & {
  readonly assignmentId: number;
  readonly workPlanId: number;
};
export type WorkKpiScorecardEvidenceTaskAnalysisRow = ScorecardEvidenceTask & {
  readonly assignmentId: number;
  readonly workPlanId: number;
};
export type WorkKpiScorecardLatestResultAnalysisRow = ScorecardLatestResult & {
  readonly assignmentId: number;
  readonly workPlanId: number;
};
export type WorkKpiScorecardNestedValueAnalysisRow = WorkspaceAnalysisNestedValueRow & {
  readonly rowKey: string;
  readonly assignmentId: number;
  readonly workPlanId: number;
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
const narrative = (label: string, description: string) => field("text", label, description, {
  sensitivity: "confidential",
  capabilities: { groupable: false },
});
const child = (sourceKey: string, description: string) => (
  { classification: "childSource", sourceKey, description } as const
);

const VIEWER_SCOPES = {
  personal: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 计分卡，不归属到当前个人空间。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 计分卡，不伪造为目标部门数据。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 计分卡，不借用页面目标绕过计划对象权限。",
    query: { requesterId: "requesterId" },
  },
} as const;
const PLAN_ID_PARAMETER = {
  key: "planId",
  queryKey: "planId",
  label: "工作计划",
  description: "必选计划稳定标识；执行时由原 KPI 计分卡服务复核当前查看人的计划对象可见性。",
  kind: "integer",
  required: true,
} as const;
const SCORECARD_API_PATH = "/api/modules/work/tasks/plans/[id]/kpi-scorecard";
const SCORECARD_LIMITS = {
  maxRows: 1_000,
  maxGroups: 500,
  maxPageSize: 500,
  maxPages: 20,
  maxBytes: 10 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const NESTED_VALUE_LIMITS = { ...SCORECARD_LIMITS, maxRows: 10_000 } as const;
const PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 20,
} as const;

export const WORK_KPI_SCORECARD_RESPONSE_FIELD_CLASSIFICATIONS = {
  plan: child("work.kpi-scorecard-plans", "计分卡计划头与总权重规范化为单行来源。"),
  assignments: child("work.kpi-scorecard-assignments", "KPI 分配拆为一项指标一行，并继续关联其稳定子事实。"),
  totalWeight: child("work.kpi-scorecard-plans", "总权重与计划头保存在同一单行来源。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardData>;

export const WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS = {
  id: id("KPI 分配 ID", "KPI 计分卡分配稳定标识。"),
  version: field("integer", "分配版本", "KPI 分配并发控制版本。"),
  workPlanId: id("工作计划 ID", "KPI 分配所属工作计划标识。"),
  definitionId: id("指标定义 ID", "KPI 分配引用的指标定义版本标识。"),
  definition: child("work.kpi-scorecard-definitions", "原计分卡公开的指标定义详情拆为一分配一详情行。"),
  workItemId: id("KR 工作项 ID", "承载 KPI 的关键结果工作项标识。"),
  workItemContent: confidential("text", "KR 工作项", "承载 KPI 的关键结果内容。"),
  objectiveWorkItemId: id("所属目标 ID", "KPI 关键结果所属目标工作项标识。"),
  workItemStatus: field("text", "工作项状态", "承载 KPI 的关键结果当前状态。"),
  ownerEmployeeId: id("负责人 ID", "KPI 负责人员工主键。"),
  ownerEmployeeNumber: confidential("text", "负责人工号", "KPI 负责人业务工号。"),
  ownerEmployeeName: confidential("text", "负责人", "KPI 负责人姓名。"),
  sourceAssignmentId: id("来源分配 ID", "分解 KPI 所承接的上级分配标识。"),
  sourceAssignment: child("work.kpi-scorecard-source-assignments", "上级 KPI 公开摘要拆为一分配一来源关系行。"),
  relationKind: field("text", "承接关系", "direct 或 decompose。"),
  weight: field("number", "权重", "该 KPI 在计分卡中的权重。"),
  baselineValue: field("number", "基线值", "该 KPI 固化的起点值。"),
  targetValue: field("number", "目标值", "单向指标的目标值。"),
  targetLowerBound: field("number", "目标下限", "区间指标的目标下限。"),
  targetUpperBound: field("number", "目标上限", "区间指标的目标上限。"),
  currentValue: field("number", "当前值", "KPI 当前实际值。"),
  definitionSnapshot: child("work.kpi-scorecard-definition-snapshot-values", "分配时固化的指标定义快照拆为路径值事实。"),
  scoringRule: child("work.kpi-scorecard-scoring-rule-values", "分配时固化的评分规则拆为路径值事实。"),
  evidence: child("work.kpi-scorecard-evidence-tasks", "KR 证据任务拆为一分配一任务事实。"),
  latestResult: child("work.kpi-scorecard-latest-results", "最新已确认 KPI 结果拆为一分配一结果事实。"),
  createdAt: field("date", "创建时间", "KPI 分配创建时间。"),
  updatedAt: field("date", "更新时间", "KPI 分配最后更新时间。"),
} satisfies WorkspaceAnalysisReadModelFields<ScorecardAssignment>;

export const WORK_KPI_SCORECARD_DEFINITION_FIELD_CLASSIFICATIONS = {
  assignmentId: id("KPI 分配 ID", "指标详情所属 KPI 分配标识。"),
  workPlanId: id("工作计划 ID", "指标详情所属工作计划标识。"),
  id: id("指标定义 ID", "指标定义版本标识。"),
  code: field("text", "指标编码", "跨版本稳定的指标业务编码。"),
  version: field("integer", "指标版本", "指标定义修订版本号。"),
  status: field("text", "指标状态", "draft、active 或 retired。"),
  name: confidential("text", "指标名称", "KPI 指标名称。"),
  description: narrative("指标说明", "KPI 指标说明。"),
  valueType: field("text", "值类型", "指标原始值类型。"),
  displayType: field("text", "展示类型", "number、percent、currency 或 count。"),
  unit: field("text", "单位", "指标计量单位。"),
  direction: field("text", "指标方向", "higher_is_better、lower_is_better 或 target_range。"),
  scoringRule: child("work.kpi-scorecard-definition-scoring-rule-values", "原计分卡公开的当前指标评分规则拆为路径值事实。"),
  measurementMode: field("text", "取数方式", "指标定义的取数方式。"),
  ownerDepartmentId: id("归口部门 ID", "指标定义归口部门标识。"),
  ownerDepartmentCode: field("text", "归口部门编码", "指标定义归口部门业务编码。"),
  ownerDepartmentName: confidential("text", "归口部门", "指标定义归口部门名称。"),
  referenceCount: field("integer", "引用数", "该指标定义版本当前被计分卡引用的数量。"),
  createdByUserId: id("创建人用户 ID", "指标定义版本创建用户标识。"),
  createdAt: field("date", "创建时间", "指标定义版本创建时间。"),
  updatedAt: field("date", "更新时间", "指标定义版本最后更新时间。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardDefinitionAnalysisRow>;

const planFields = {
  id: id("工作计划 ID", "计分卡所属工作计划标识。"),
  title: confidential("text", "工作计划", "计分卡所属工作计划标题。"),
  targetType: field("text", "空间类型", "工作计划所属空间类型。"),
  targetId: id("空间 ID", "工作计划所属空间标识。"),
  okrCycleId: id("OKR 周期 ID", "工作计划绑定的 OKR 周期标识。"),
  okrStage: field("text", "OKR 阶段", "工作计划当前 OKR 阶段。"),
  status: field("text", "计划状态", "工作计划当前状态。"),
  governanceRevision: field("integer", "治理版本", "工作计划当前治理规则版本。"),
  totalWeight: field("number", "总权重", "计分卡全部 KPI 分配权重合计。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardPlanAnalysisRow>;

const sourceAssignmentFields = {
  assignmentId: id("KPI 分配 ID", "来源关系所属当前 KPI 分配标识。"),
  workPlanId: id("来源工作计划 ID", "上级 KPI 来源分配所属工作计划标识。"),
  id: id("来源分配 ID", "上级 KPI 分配稳定标识。"),
  definitionId: id("来源指标定义 ID", "上级 KPI 使用的指标定义版本标识。"),
  title: confidential("text", "来源 KPI", "上级 KPI 工作项标题。"),
  planTitle: confidential("text", "来源计划", "上级 KPI 所属计划标题。"),
  targetType: field("text", "来源空间类型", "上级 KPI 所属空间类型。"),
  targetId: id("来源空间 ID", "上级 KPI 所属空间标识。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardSourceAssignmentAnalysisRow>;

const evidenceTaskFields = {
  assignmentId: id("KPI 分配 ID", "证据任务所属 KPI 分配标识。"),
  workPlanId: id("工作计划 ID", "证据任务所属工作计划标识。"),
  taskId: id("证据任务 ID", "作为 KR 证据的任务工作项标识。"),
  content: confidential("text", "证据任务", "证据任务内容。"),
  status: field("text", "任务状态", "证据任务当前状态。"),
  completedAt: field("date", "完成时间", "证据任务完成时间。"),
  updatedAt: field("date", "更新时间", "证据任务最后更新时间。"),
  note: narrative("证据说明", "该任务作为 KPI 证据的说明。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardEvidenceTaskAnalysisRow>;

const latestResultFields = {
  assignmentId: id("KPI 分配 ID", "最新结果所属 KPI 分配标识。"),
  workPlanId: id("工作计划 ID", "最新结果所属工作计划标识。"),
  id: id("结果快照 ID", "最新 KPI 结果快照稳定标识。"),
  version: field("integer", "结果版本", "该 KPI 结果快照版本号。"),
  actualValue: field("number", "实际值", "结果快照固化的实际值。"),
  scoreBeforeAdjustment: field("number", "调分前得分", "规则计算出的原始得分。"),
  confirmedScore: field("number", "确认得分", "最终确认得分。"),
  adjustmentReason: narrative("调分原因", "最终确认得分相对规则得分的调整说明。"),
  approvedAt: field("date", "确认时间", "结果快照确认时间。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardLatestResultAnalysisRow>;

const nestedValueFields = {
  rowKey: field("text", "字段行键", "由 KPI 分配、值类别和字段路径组成的确定性行键。"),
  assignmentId: id("KPI 分配 ID", "嵌套字段所属 KPI 分配标识。"),
  workPlanId: id("工作计划 ID", "嵌套字段所属工作计划标识。"),
  path: field("text", "字段路径", "公开嵌套对象中的确定性字段路径。"),
  valueKind: field("text", "值类型", "字段值的原始标量或容器类型。"),
  textValue: confidential("text", "文本值", "字段值的无损文本表示。"),
  numberValue: confidential("number", "数值", "字段原值为数字时的数值列，否则为空。"),
  booleanValue: confidential("boolean", "布尔值", "字段原值为布尔值时的布尔列，否则为空。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiScorecardNestedValueAnalysisRow>;

const source = <TRow extends object>(input: {
  sourceKey: string;
  label: string;
  description: string;
  rowsPath: string;
  fields: WorkspaceAnalysisReadModelFields<TRow>;
  maxRows?: number;
}) => defineWorkspaceAnalysisReadModel<TRow>()({
  sourceKey: input.sourceKey,
  version: 1,
  label: input.label,
  description: input.description,
  apiPath: SCORECARD_API_PATH,
  rowsPath: input.rowsPath,
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [PLAN_ID_PARAMETER],
  fields: input.fields,
  pagination: input.maxRows === 1 ? { ...PAGINATION, pageSize: 1, maxPages: 1 } : PAGINATION,
  limits: input.maxRows === 1
    ? { ...SCORECARD_LIMITS, maxRows: 1, maxPageSize: 1, maxPages: 1 }
    : input.maxRows === NESTED_VALUE_LIMITS.maxRows ? NESTED_VALUE_LIMITS : SCORECARD_LIMITS,
});

export const WORK_KPI_SCORECARD_PLANS_ANALYSIS_SOURCE = source<WorkKpiScorecardPlanAnalysisRow>({
  sourceKey: "work.kpi-scorecard-plans",
  label: "KPI 计分卡计划",
  description: "参数绑定的单工作计划 KPI 计分卡头；执行时直接复用原计分卡服务的计划对象可见性。",
  rowsPath: "plan",
  fields: planFields,
  maxRows: 1,
});
export const WORK_KPI_SCORECARD_ASSIGNMENTS_ANALYSIS_SOURCE = source<ScorecardAssignment>({
  sourceKey: "work.kpi-scorecard-assignments",
  label: "KPI 计分卡分配",
  description: "以当前查看人可见指定计划中的一项 KPI 分配为粒度。",
  rowsPath: "assignments",
  fields: WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS,
});
export const WORK_KPI_SCORECARD_DEFINITIONS_ANALYSIS_SOURCE = source<WorkKpiScorecardDefinitionAnalysisRow>({
  sourceKey: "work.kpi-scorecard-definitions",
  label: "KPI 计分卡指标详情",
  description: "以指定计分卡的一项分配和原响应公开的当前指标定义详情为粒度。",
  rowsPath: "assignments.definition",
  fields: WORK_KPI_SCORECARD_DEFINITION_FIELD_CLASSIFICATIONS,
});
export const WORK_KPI_SCORECARD_SOURCE_ASSIGNMENTS_ANALYSIS_SOURCE = source<WorkKpiScorecardSourceAssignmentAnalysisRow>({
  sourceKey: "work.kpi-scorecard-source-assignments",
  label: "KPI 计分卡来源分配",
  description: "以指定计分卡的一项分解 KPI 与其公开上级 KPI 摘要关系为粒度。",
  rowsPath: "assignments.sourceAssignment",
  fields: sourceAssignmentFields,
});
export const WORK_KPI_SCORECARD_DEFINITION_SNAPSHOT_VALUES_ANALYSIS_SOURCE = source<WorkKpiScorecardNestedValueAnalysisRow>({
  sourceKey: "work.kpi-scorecard-definition-snapshot-values",
  label: "KPI 分配定义快照字段",
  description: "以 KPI 分配时固化定义快照的一个确定性字段路径和值为粒度。",
  rowsPath: "assignments.definitionSnapshot",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_SCORECARD_SCORING_RULE_VALUES_ANALYSIS_SOURCE = source<WorkKpiScorecardNestedValueAnalysisRow>({
  sourceKey: "work.kpi-scorecard-scoring-rule-values",
  label: "KPI 分配评分规则字段",
  description: "以 KPI 分配时固化评分规则的一个确定性字段路径和值为粒度。",
  rowsPath: "assignments.scoringRule",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_SCORECARD_DEFINITION_SCORING_RULE_VALUES_ANALYSIS_SOURCE = source<WorkKpiScorecardNestedValueAnalysisRow>({
  sourceKey: "work.kpi-scorecard-definition-scoring-rule-values",
  label: "KPI 计分卡当前定义评分规则字段",
  description: "以计分卡响应中当前指标定义评分规则的一个确定性字段路径和值为粒度。",
  rowsPath: "assignments.definition.scoringRule",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_SCORECARD_EVIDENCE_TASKS_ANALYSIS_SOURCE = source<WorkKpiScorecardEvidenceTaskAnalysisRow>({
  sourceKey: "work.kpi-scorecard-evidence-tasks",
  label: "KPI 计分卡证据任务",
  description: "以指定计分卡的一项 KPI 分配和一条公开 KR 证据任务关系为粒度。",
  rowsPath: "assignments.evidence",
  fields: evidenceTaskFields,
  maxRows: 10_000,
});
export const WORK_KPI_SCORECARD_LATEST_RESULTS_ANALYSIS_SOURCE = source<WorkKpiScorecardLatestResultAnalysisRow>({
  sourceKey: "work.kpi-scorecard-latest-results",
  label: "KPI 计分卡最新结果",
  description: "以指定计分卡的一项 KPI 分配及其原响应公开的最新结果快照为粒度。",
  rowsPath: "assignments.latestResult",
  fields: latestResultFields,
});

export const WORK_KPI_SCORECARD_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_KPI_SCORECARD_PLANS_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_ASSIGNMENTS_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_DEFINITIONS_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_SOURCE_ASSIGNMENTS_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_DEFINITION_SNAPSHOT_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_SCORING_RULE_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_DEFINITION_SCORING_RULE_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_EVIDENCE_TASKS_ANALYSIS_SOURCE,
  WORK_KPI_SCORECARD_LATEST_RESULTS_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkKpiScorecardPlanRows(data: WorkKpiScorecardData) {
  yield { ...data.plan, totalWeight: data.totalWeight };
}

export function *iterateWorkKpiScorecardAssignmentRows(data: WorkKpiScorecardData) {
  yield *data.assignments;
}

export function *iterateWorkKpiScorecardDefinitionRows(data: WorkKpiScorecardData) {
  for (const assignment of data.assignments) {
    yield { assignmentId: assignment.id, workPlanId: assignment.workPlanId, ...assignment.definition };
  }
}

export function *iterateWorkKpiScorecardSourceAssignmentRows(data: WorkKpiScorecardData) {
  for (const assignment of data.assignments) {
    if (assignment.sourceAssignment) {
      yield { assignmentId: assignment.id, ...assignment.sourceAssignment };
    }
  }
}

export function *iterateWorkKpiScorecardDefinitionSnapshotValueRows(data: WorkKpiScorecardData) {
  yield *iterateNestedValues(data, "definitionSnapshot", (assignment) => assignment.definitionSnapshot);
}

export function *iterateWorkKpiScorecardScoringRuleValueRows(data: WorkKpiScorecardData) {
  yield *iterateNestedValues(data, "scoringRule", (assignment) => assignment.scoringRule);
}

export function *iterateWorkKpiScorecardDefinitionScoringRuleValueRows(data: WorkKpiScorecardData) {
  yield *iterateNestedValues(data, "definitionScoringRule", (assignment) => assignment.definition.scoringRule);
}

export function *iterateWorkKpiScorecardEvidenceTaskRows(data: WorkKpiScorecardData) {
  for (const assignment of data.assignments) {
    for (const evidence of assignment.evidence) {
      yield { assignmentId: assignment.id, workPlanId: assignment.workPlanId, ...evidence };
    }
  }
}

export function *iterateWorkKpiScorecardLatestResultRows(data: WorkKpiScorecardData) {
  for (const assignment of data.assignments) {
    if (assignment.latestResult) {
      yield { assignmentId: assignment.id, workPlanId: assignment.workPlanId, ...assignment.latestResult };
    }
  }
}

function *iterateNestedValues(
  data: WorkKpiScorecardData,
  valueKind: string,
  valueOf: (assignment: ScorecardAssignment) => unknown,
): Generator<WorkKpiScorecardNestedValueAnalysisRow> {
  for (const assignment of data.assignments) {
    for (const value of flattenWorkspaceAnalysisNestedValue(valueOf(assignment))) {
      yield {
        rowKey: `${assignment.id}:${valueKind}:${value.path}`,
        assignmentId: assignment.id,
        workPlanId: assignment.workPlanId,
        ...value,
      };
    }
  }
}
