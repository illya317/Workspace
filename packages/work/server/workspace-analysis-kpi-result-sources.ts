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

import type { executeGetKpiResultsCommand } from "./work-kpi-route-command";

type KpiResultsServiceResult = Awaited<ReturnType<typeof executeGetKpiResultsCommand>>;
export type WorkKpiResultsData = Extract<KpiResultsServiceResult, { ok: true }>["data"];

type KpiResultPreview = WorkKpiResultsData["results"][number];
type KpiResultWorkReport = NonNullable<WorkKpiResultsData["workReport"]>;

export type WorkKpiResultSummaryAnalysisRow = {
  readonly planId: number;
  readonly weightedScore: number;
};
export type WorkKpiResultWorkReportAnalysisRow = KpiResultWorkReport & {
  readonly planId: number;
};
export type WorkKpiResultNestedValueAnalysisRow = WorkspaceAnalysisNestedValueRow & {
  readonly rowKey: string;
  readonly planId: number;
  readonly assignmentId: number;
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
const child = (sourceKey: string, description: string) => (
  { classification: "childSource", sourceKey, description } as const
);

const VIEWER_SCOPES = {
  personal: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 结果预览，不归属到当前个人空间。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 结果预览，不伪造为目标部门数据。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原工作计划页可见的指定 KPI 结果预览，不借用页面目标绕过计划对象权限。",
    query: { requesterId: "requesterId" },
  },
} as const;
const PLAN_ID_PARAMETER = {
  key: "planId",
  queryKey: "planId",
  label: "工作计划",
  description: "必选计划稳定标识；执行时由原 KPI 结果服务复核当前查看人的计划对象可见性和结果可计算状态。",
  kind: "integer",
  required: true,
} as const;
const KPI_RESULTS_API_PATH = "/api/modules/work/tasks/plans/[id]/kpi-results";
const RESULT_LIMITS = {
  maxRows: 1_000,
  maxGroups: 500,
  maxPageSize: 500,
  maxPages: 20,
  maxBytes: 10 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const NESTED_VALUE_LIMITS = { ...RESULT_LIMITS, maxRows: 10_000 } as const;
const PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 20,
} as const;

export const WORK_KPI_RESULTS_RESPONSE_FIELD_CLASSIFICATIONS = {
  results: child("work.kpi-result-previews", "每项 KPI 计算结果拆为一项分配一行，并继续关联快照、评分规则和证据字段。"),
  weightedScore: child("work.kpi-result-summaries", "计划加权得分与必选计划标识保存在单行汇总来源。"),
  workReport: child("work.kpi-result-work-reports", "原响应关联的最新最终考核表拆为零或一行来源。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiResultsData>;

export const WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS = {
  assignmentId: id("KPI 分配 ID", "结果预览所属 KPI 分配标识。"),
  weight: field("number", "权重", "该 KPI 在计分卡中的权重。"),
  actualValue: field("number", "实际值", "当前用于结果计算的 KPI 实际值。"),
  calculatedScore: field("number", "计算得分", "按固化评分规则计算的 KPI 得分。"),
  definitionSnapshot: child("work.kpi-result-definition-snapshot-values", "结果计算使用的指标定义快照拆为路径值事实。"),
  assignmentSnapshot: child("work.kpi-result-assignment-snapshot-values", "结果计算使用的 KPI 分配快照拆为路径值事实。"),
  scoringRule: child("work.kpi-result-scoring-rule-values", "结果计算使用的评分规则拆为路径值事实。"),
  evidence: child("work.kpi-result-evidence-values", "结果计算使用的完整证据快照拆为确定性路径值事实。"),
} satisfies WorkspaceAnalysisReadModelFields<KpiResultPreview>;

const summaryFields = {
  planId: id("工作计划 ID", "结果汇总对应的必选工作计划标识。"),
  weightedScore: field("number", "加权得分", "全部 KPI 计算得分按权重汇总后的计划得分。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiResultSummaryAnalysisRow>;

const workReportFields = {
  planId: id("工作计划 ID", "考核表关联的 KPI 工作计划标识。"),
  id: id("工作汇报 ID", "原结果接口关联的最新最终考核表标识。"),
  periodType: field("text", "周期类型", "考核表周期类型。"),
  periodStart: field("date", "周期开始", "考核表周期开始日期。"),
  periodEnd: field("date", "周期结束", "考核表周期结束日期。"),
  submittedAt: field("date", "提交时间", "考核表提交时间。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiResultWorkReportAnalysisRow>;

const nestedValueFields = {
  rowKey: field("text", "字段行键", "由工作计划、KPI 分配、值类别和字段路径组成的确定性行键。"),
  planId: id("工作计划 ID", "嵌套字段所属工作计划标识。"),
  assignmentId: id("KPI 分配 ID", "嵌套字段所属 KPI 分配标识。"),
  path: field("text", "字段路径", "公开嵌套对象中的确定性字段路径。"),
  valueKind: field("text", "值类型", "字段值的原始标量或容器类型。"),
  textValue: confidential("text", "文本值", "字段值的无损文本表示。"),
  numberValue: confidential("number", "数值", "字段原值为数字时的数值列，否则为空。"),
  booleanValue: confidential("boolean", "布尔值", "字段原值为布尔值时的布尔列，否则为空。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkKpiResultNestedValueAnalysisRow>;

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
  apiPath: KPI_RESULTS_API_PATH,
  rowsPath: input.rowsPath,
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [PLAN_ID_PARAMETER],
  fields: input.fields,
  pagination: input.maxRows === 1 ? { ...PAGINATION, pageSize: 1, maxPages: 1 } : PAGINATION,
  limits: input.maxRows === 1
    ? { ...RESULT_LIMITS, maxRows: 1, maxPageSize: 1, maxPages: 1 }
    : input.maxRows === NESTED_VALUE_LIMITS.maxRows ? NESTED_VALUE_LIMITS : RESULT_LIMITS,
});

export const WORK_KPI_RESULT_SUMMARIES_ANALYSIS_SOURCE = source<WorkKpiResultSummaryAnalysisRow>({
  sourceKey: "work.kpi-result-summaries",
  label: "KPI 结果汇总",
  description: "参数绑定的单工作计划 KPI 加权得分；执行时直接复用原结果服务的对象可见性与计算口径。",
  rowsPath: "weightedScore",
  fields: summaryFields,
  maxRows: 1,
});
export const WORK_KPI_RESULT_PREVIEWS_ANALYSIS_SOURCE = source<KpiResultPreview>({
  sourceKey: "work.kpi-result-previews",
  label: "KPI 结果预览",
  description: "以当前查看人可见指定计划中的一项 KPI 计算结果为粒度。",
  rowsPath: "results",
  fields: WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS,
});
export const WORK_KPI_RESULT_WORK_REPORTS_ANALYSIS_SOURCE = source<WorkKpiResultWorkReportAnalysisRow>({
  sourceKey: "work.kpi-result-work-reports",
  label: "KPI 结果考核表",
  description: "以指定 KPI 计划及原结果接口关联的最新最终考核表为粒度；没有考核表时返回零行。",
  rowsPath: "workReport",
  fields: workReportFields,
  maxRows: 1,
});
export const WORK_KPI_RESULT_DEFINITION_SNAPSHOT_VALUES_ANALYSIS_SOURCE = source<WorkKpiResultNestedValueAnalysisRow>({
  sourceKey: "work.kpi-result-definition-snapshot-values",
  label: "KPI 结果定义快照字段",
  description: "以结果计算使用的指标定义快照中的一个确定性字段路径和值为粒度。",
  rowsPath: "results.definitionSnapshot",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_RESULT_ASSIGNMENT_SNAPSHOT_VALUES_ANALYSIS_SOURCE = source<WorkKpiResultNestedValueAnalysisRow>({
  sourceKey: "work.kpi-result-assignment-snapshot-values",
  label: "KPI 结果分配快照字段",
  description: "以结果计算使用的 KPI 分配快照中的一个确定性字段路径和值为粒度。",
  rowsPath: "results.assignmentSnapshot",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_RESULT_SCORING_RULE_VALUES_ANALYSIS_SOURCE = source<WorkKpiResultNestedValueAnalysisRow>({
  sourceKey: "work.kpi-result-scoring-rule-values",
  label: "KPI 结果评分规则字段",
  description: "以结果计算使用的评分规则中的一个确定性字段路径和值为粒度。",
  rowsPath: "results.scoringRule",
  fields: nestedValueFields,
  maxRows: 10_000,
});
export const WORK_KPI_RESULT_EVIDENCE_VALUES_ANALYSIS_SOURCE = source<WorkKpiResultNestedValueAnalysisRow>({
  sourceKey: "work.kpi-result-evidence-values",
  label: "KPI 结果证据字段",
  description: "以结果计算使用的完整公开证据快照中的一个确定性字段路径和值为粒度，包括证据任务字段。",
  rowsPath: "results.evidence",
  fields: nestedValueFields,
  maxRows: 10_000,
});

export const WORK_KPI_RESULT_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_KPI_RESULT_SUMMARIES_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_PREVIEWS_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_WORK_REPORTS_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_DEFINITION_SNAPSHOT_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_ASSIGNMENT_SNAPSHOT_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_SCORING_RULE_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_RESULT_EVIDENCE_VALUES_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkKpiResultSummaryRows(data: WorkKpiResultsData, planId: number) {
  yield { planId, weightedScore: data.weightedScore };
}

export function *iterateWorkKpiResultPreviewRows(data: WorkKpiResultsData) {
  yield *data.results;
}

export function *iterateWorkKpiResultWorkReportRows(data: WorkKpiResultsData, planId: number) {
  if (data.workReport) yield { planId, ...data.workReport };
}

export function *iterateWorkKpiResultDefinitionSnapshotValueRows(data: WorkKpiResultsData, planId: number) {
  yield *iterateNestedValues(data, planId, "definitionSnapshot", (result) => result.definitionSnapshot);
}

export function *iterateWorkKpiResultAssignmentSnapshotValueRows(data: WorkKpiResultsData, planId: number) {
  yield *iterateNestedValues(data, planId, "assignmentSnapshot", (result) => result.assignmentSnapshot);
}

export function *iterateWorkKpiResultScoringRuleValueRows(data: WorkKpiResultsData, planId: number) {
  yield *iterateNestedValues(data, planId, "scoringRule", (result) => result.scoringRule);
}

export function *iterateWorkKpiResultEvidenceValueRows(data: WorkKpiResultsData, planId: number) {
  yield *iterateNestedValues(data, planId, "evidence", (result) => result.evidence);
}

function *iterateNestedValues(
  data: WorkKpiResultsData,
  planId: number,
  valueKind: string,
  valueOf: (result: KpiResultPreview) => unknown,
): Generator<WorkKpiResultNestedValueAnalysisRow> {
  for (const result of data.results) {
    for (const value of flattenWorkspaceAnalysisNestedValue(valueOf(result))) {
      yield {
        rowKey: `${planId}:${result.assignmentId}:${valueKind}:${value.path}`,
        planId,
        assignmentId: result.assignmentId,
        ...value,
      };
    }
  }
}
