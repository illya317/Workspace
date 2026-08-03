import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";

import type {
  executeGetHrPerformanceReviewRouteCommand,
  executeListHrPerformanceDashboardRouteCommand,
} from "../performance";

type HrPerformanceDashboardResult = Awaited<ReturnType<typeof executeListHrPerformanceDashboardRouteCommand>>;
export type HrPerformanceDashboardData = Extract<HrPerformanceDashboardResult, { readonly ok: true }>["data"];
type HrPerformanceReviewDetailResult = Awaited<ReturnType<typeof executeGetHrPerformanceReviewRouteCommand>>;
export type HrPerformanceAttendanceAnalysisRow = HrPerformanceDashboardData["attendanceRows"][number];
export type HrPerformanceWorkPlanAnalysisRow = HrPerformanceDashboardData["workRows"][number];
export type HrPerformanceContributionAnalysisRow = HrPerformanceDashboardData["contributionRows"][number];
export type HrPerformanceReviewAnalysisRow = HrPerformanceDashboardData["reviewRows"][number];
export type HrPerformanceCycleAnalysisRow = HrPerformanceDashboardData["cycleOptions"][number];
export type HrPerformanceReviewDetailAnalysisRow = Extract<
  HrPerformanceReviewDetailResult,
  { readonly ok: true }
>["data"]["review"];
export type HrPerformanceReviewEvidenceValueAnalysisRow = {
  readonly rowKey: string;
  readonly reviewId: number;
  readonly employeeId: number;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly okrCycleId: number;
  readonly path: string;
  readonly valueKind: string;
  readonly textValue: string | null;
  readonly numberValue: number | null;
  readonly booleanValue: boolean | null;
};
export type HrPerformanceReportingAnalysisRow = {
  readonly audienceType: "personal" | "department" | "project";
  readonly audienceId: number;
  readonly audienceCode: string;
  readonly audienceName: string;
  readonly reportingApplicable: boolean;
  readonly reportingStatus: string | null;
  readonly deadline: string | null;
  readonly submittedAt: string | null;
};

const field = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
  sensitivity: WorkspaceAnalysisReadModelField["sensitivity"] = "internal",
  exportPolicy: WorkspaceAnalysisReadModelField["exportPolicy"] = "allowed",
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  valueKind,
  label,
  description,
  sensitivity,
  exportPolicy,
});

const internal = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description)
);
const confidential = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description, "confidential")
);
const restricted = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description, "restricted", "forbidden")
);
const child = (sourceKey: string, description: string) => ({
  classification: "childSource",
  sourceKey,
  description,
} as const);

const performanceScopes = {
  personal: {
    mode: "viewer",
    description: "复用绩效 dashboard 的 self 视图，只读取当前查看人的个人绩效，不把请求人数据伪装成其他个人空间归属。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "target",
    description: "复用绩效 dashboard 的 summary 视图，并强制把 audienceId 绑定到目标部门。",
    query: { audienceType: "scopeType", audienceId: "scopeId" },
  },
  project: {
    mode: "target",
    description: "复用绩效 dashboard 的 summary 视图，并强制把 audienceId 绑定到目标项目。",
    query: { audienceType: "scopeType", audienceId: "scopeId" },
  },
} as const;

const performanceCycleScopes = {
  personal: {
    mode: "viewer",
    description: "绩效周期没有个人外键；展示当前查看人通过绩效 dashboard 可见的周期维度。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "绩效周期没有部门外键；展示当前查看人通过绩效汇总 dashboard 可见的周期维度。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "绩效周期没有项目外键；展示当前查看人通过绩效汇总 dashboard 可见的周期维度。",
    query: { requesterId: "requesterId" },
  },
} as const;

const dashboardParameters = [
  { key: "cycleId", queryKey: "cycleId", label: "绩效周期", description: "指定公开 dashboard 中的绩效周期 ID。", kind: "integer" },
  { key: "periodType", queryKey: "periodType", label: "周期类型", description: "yearly、half_year、quarterly、monthly 或 weekly。", kind: "text" },
  { key: "keyword", queryKey: "keyword", label: "关键词", description: "沿用绩效 dashboard 的公开行关键词筛选。", kind: "text" },
] as const;

const dashboardPagination = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 500, maxPages: 10 } as const;
const dashboardLimits = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 500,
  maxPages: 10,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

type DashboardRowField = "attendanceRows" | "contributionRows" | "reviewRows" | "cycleOptions";
type PerformanceAnalysisRow = HrPerformanceAttendanceAnalysisRow | HrPerformanceWorkPlanAnalysisRow | HrPerformanceContributionAnalysisRow
  | HrPerformanceReviewAnalysisRow | HrPerformanceReviewDetailAnalysisRow | HrPerformanceReviewEvidenceValueAnalysisRow | HrPerformanceCycleAnalysisRow | HrPerformanceReportingAnalysisRow;
type ExactLoader<TRow, Expected, Loader> = TRow extends Expected ? Expected extends TRow ? Loader : never : never;
type DashboardRowsLoader<TRow> = { [Field in DashboardRowField]: ExactLoader<TRow, HrPerformanceDashboardData[Field][number],
  { readonly kind: "dashboardRows"; readonly field: Field }> }[DashboardRowField];
export type HrPerformanceAnalysisLoaderDescriptor<TRow extends object = PerformanceAnalysisRow> = TRow extends object
  ? DashboardRowsLoader<TRow> | ExactLoader<TRow, HrPerformanceWorkPlanAnalysisRow, { readonly kind: "dashboardWorkPlans" }>
  | ExactLoader<TRow, HrPerformanceReviewDetailAnalysisRow, { readonly kind: "reviewDetails" }> | ExactLoader<TRow, HrPerformanceReviewEvidenceValueAnalysisRow, { readonly kind: "reviewEvidence" }>
  | ExactLoader<TRow, HrPerformanceReportingAnalysisRow, { readonly kind: "reporting" }>
  : never;
type PerformanceAnalysisSourceInput<TRow extends object> = {
  readonly sourceKey: string;
  readonly label: string;
  readonly description: string;
  readonly rowsPath: string;
  readonly totalPath: string;
  readonly scopeMode?: "target" | "viewer";
  readonly fields: WorkspaceAnalysisReadModelFields<TRow>;
  readonly pagination?: { readonly pageParam: string; readonly pageSizeParam: string; readonly pageSize: number; readonly maxPages: number };
  readonly limits?: WorkspaceAnalysisSourceDefinition["limits"];
  readonly loader: HrPerformanceAnalysisLoaderDescriptor<TRow>;
};
function definePerformanceAnalysisSource<TRow extends object>(input: PerformanceAnalysisSourceInput<TRow>) {
  return {
    registration: defineWorkspaceAnalysisReadModel<TRow>()({
      sourceKey: input.sourceKey,
      version: 1,
      label: input.label,
      description: input.description,
      apiPath: "/api/modules/hr/performance",
      rowsPath: input.rowsPath,
      totalPath: input.totalPath,
      scopes: input.scopeMode === "viewer" ? performanceCycleScopes : performanceScopes,
      parameters: dashboardParameters,
      fields: input.fields,
      pagination: input.pagination ?? dashboardPagination,
      limits: input.limits ?? dashboardLimits,
    }),
    loader: input.loader,
    bindsTargetAudience: input.scopeMode !== "viewer",
  } as const;
}

const performanceReviewFields = {
  id: internal("integer", "绩效记录 ID", "正式绩效评审内部 ID。"),
  employeeId: internal("integer", "员工 ID", "绩效评审关联的员工内部 ID。"),
  employeeCode: confidential("text", "员工编号", "绩效评审关联的业务工号。"),
  employeeName: confidential("text", "员工姓名", "绩效评审关联的员工姓名。"),
  okrCycleId: internal("integer", "OKR 周期 ID", "绩效评审关联的周期 ID。"),
  approvalRequestId: internal("integer", "审批请求 ID", "形成正式绩效记录的审批请求 ID。"),
  selfScore: confidential("number", "自评分", "员工自评分。"),
  managerScore: confidential("number", "上级评分", "直属上级评分。"),
  finalScore: confidential("number", "最终得分", "归档后的最终绩效得分。"),
  finalGrade: confidential("text", "最终等级", "归档后的最终绩效等级。"),
  archivedAt: internal("date", "归档时间", "正式绩效记录归档时间。"),
  version: internal("integer", "记录版本", "正式绩效记录并发版本号。"),
} as const;

const performanceAnalysisSources = [
  definePerformanceAnalysisSource<HrPerformanceAttendanceAnalysisRow>({
    sourceKey: "hr.performance-attendance",
    label: "HR 绩效考勤口径",
    description: "以一名绩效查看范围内的员工为粒度，复用公开绩效 dashboard 的考勤口径行。",
    rowsPath: "attendanceRows",
    totalPath: "metrics.activeEmployeeCount",
    fields: {
      id: internal("integer", "员工 ID", "绩效考勤行关联的员工内部 ID。"),
      employeeId: confidential("text", "员工编号", "绩效考勤行关联的业务工号。"),
      name: confidential("text", "姓名", "绩效考勤行关联的员工姓名。"),
      userId: internal("integer", "账号 ID", "员工绑定的 Workspace 账号 ID。"),
      company: confidential("text", "公司", "员工主岗汇报公司或当前雇佣公司。"),
      department: confidential("text", "部门", "员工当前主岗优先的部门名称。"),
      position: confidential("text", "岗位", "员工当前主岗优先的岗位名称。"),
      attendanceType: confidential("text", "考勤类型", "员工当前雇佣记录中的考勤类型。"),
      personnelType: confidential("text", "人员类型", "员工当前雇佣记录中的人员类型。"),
      joinDate: confidential("date", "入职日期", "员工当前雇佣记录中的入职日期。"),
      status: internal("text", "在职状态", "绩效 dashboard 派生的在职或离职状态。"),
    },
    loader: { kind: "dashboardRows", field: "attendanceRows" },
  }),

  definePerformanceAnalysisSource<HrPerformanceWorkPlanAnalysisRow>({
    sourceKey: "hr.performance-work-plans",
    label: "HR 绩效工作计划",
    description: "以一条绩效周期内的工作计划摘要为粒度，保留 dashboard 的目标、KR 数量和完成率口径；目标部门或项目只保留可归属到其员工的计划。",
    rowsPath: "workRows",
    totalPath: "metrics.workPlanCount",
    fields: {
      id: internal("integer", "计划 ID", "绩效工作计划内部 ID。"),
      employeeId: internal("integer", "负责人 ID", "计划负责人员工内部 ID；无负责人时为空。"),
      employeeName: confidential("text", "负责人", "计划负责人员工姓名。"),
      planTitle: confidential("text", "计划名称", "绩效 dashboard 中的工作计划名称。"),
      kind: internal("text", "计划类型", "okr 或 routine。"),
      okrCycleId: internal("integer", "OKR 周期 ID", "计划直接关联的 OKR 周期 ID。"),
      stage: internal("text", "OKR 阶段", "计划当前 OKR 阶段。"),
      status: internal("text", "计划状态", "计划当前业务状态。"),
      objectiveCount: internal("integer", "目标数", "计划未归档 objective 节点数量。"),
      keyResultCount: internal("integer", "KR 数", "计划未归档 key_result 节点数量。"),
      completionRate: confidential("percent", "KR 平均完成率", "计划下可计算 KR 完成率的算术平均值。"),
    },
    loader: { kind: "dashboardWorkPlans" },
  }),

  definePerformanceAnalysisSource<HrPerformanceContributionAnalysisRow>({
    sourceKey: "hr.performance-contributions",
    label: "HR 绩效贡献材料",
    description: "以一名员工对一个工作节点的一种贡献角色为粒度，覆盖 dashboard 的批量贡献材料事实。",
    rowsPath: "contributionRows",
    totalPath: "metrics.contributionCount",
    fields: {
      id: internal("text", "贡献行 ID", "由工作节点、员工和贡献角色组成的稳定行 ID。"),
      employeeId: internal("integer", "员工 ID", "贡献人员工内部 ID。"),
      employeeName: confidential("text", "员工姓名", "贡献人员工姓名。"),
      sourceKind: internal("text", "来源类型", "当前公开口径为 work_item。"),
      contributionType: internal("text", "贡献类型", "工作节点的业务类型标签。"),
      contributionRole: internal("text", "贡献角色", "owner 或 participant。"),
      roleLabel: internal("text", "角色名称", "贡献角色的公开展示名称。"),
      sourceSpace: confidential("text", "来源空间", "贡献工作节点所在空间的公开展示值。"),
      title: confidential("text", "贡献事项", "贡献工作节点标题。"),
      relation: confidential("text", "目标关系", "贡献事项的目标、KR 与计划关系路径。"),
      status: internal("text", "状态", "贡献工作节点的公开状态标签。"),
      actualEndDate: confidential("date", "实际结束日期", "贡献工作节点实际结束日期。"),
      evidenceCount: internal("integer", "证据数", "显式证据和公开业务引用的合计数量。"),
      referenceLabel: confidential("text", "业务引用", "项目、阶段、会议或部门等公开引用标签。"),
    },
    loader: { kind: "dashboardRows", field: "contributionRows" },
  }),

  definePerformanceAnalysisSource<HrPerformanceReviewAnalysisRow>({
    sourceKey: "hr.performance-reviews",
    label: "HR 正式绩效记录",
    description: "以一条已归档正式绩效评审为粒度；批量主源保留稳定评分与归档字段，评语、时间和证据由同一可见 ID 集合派生的有界子来源补齐。",
    rowsPath: "reviewRows",
    totalPath: "metrics.reviewCount",
    fields: performanceReviewFields,
    loader: { kind: "dashboardRows", field: "reviewRows" },
  }),

  definePerformanceAnalysisSource<HrPerformanceReviewDetailAnalysisRow>({
    sourceKey: "hr.performance-review-details",
    label: "HR 正式绩效详情",
    description: "以一条当前 dashboard 可见的正式绩效评审为粒度；先按原 self/summary 对象可见性取得 review ID，再一次有界批量读取评语和稳定时间字段。",
    rowsPath: "reviewRows.details",
    totalPath: "metrics.reviewCount",
    fields: {
      ...performanceReviewFields,
      selfComment: restricted("text", "自评说明", "员工提交并归档的自评说明。"),
      managerComment: restricted("text", "上级评语", "直属上级提交并归档的评语。"),
      hrComment: restricted("text", "HR 评语", "HR 最终审批时提交并归档的评语。"),
      workEvidenceSnapshot: child("hr.performance-review-evidence-values", "归档证据快照拆为确定性 JSON 路径和值行，不暴露原始嵌套对象。"),
      createdAt: internal("date", "创建时间", "正式绩效记录创建时间。"),
      updatedAt: internal("date", "更新时间", "正式绩效记录最后更新时间。"),
    },
    loader: { kind: "reviewDetails" },
  }),

  definePerformanceAnalysisSource<HrPerformanceReviewEvidenceValueAnalysisRow>({
    sourceKey: "hr.performance-review-evidence-values",
    label: "HR 绩效归档证据字段",
    description: "以一条当前可见正式绩效记录快照中的确定性标量 JSON 路径为粒度，完整保留 work、OKR、贡献和 KPI 归档事实。",
    rowsPath: "reviewRows.details.workEvidenceSnapshot",
    totalPath: "metrics.reviewCount",
    fields: {
      rowKey: internal("text", "证据行 ID", "由绩效记录 ID 和快照 JSON 路径组成的稳定行键。"),
      reviewId: internal("integer", "绩效记录 ID", "证据快照所属正式绩效记录 ID。"),
      employeeId: internal("integer", "员工 ID", "证据快照所属员工内部 ID。"),
      employeeCode: confidential("text", "员工编号", "证据快照所属员工业务工号。"),
      employeeName: confidential("text", "员工姓名", "证据快照所属员工姓名。"),
      okrCycleId: internal("integer", "OKR 周期 ID", "证据快照所属绩效周期 ID。"),
      path: internal("text", "字段路径", "从快照根节点开始的确定性 JSON 路径。"),
      valueKind: internal("text", "值类型", "null、text、number、boolean、array 或 object。"),
      textValue: restricted("text", "文本值", "路径对应的文本值；数字和布尔值同时保留可检索文本。"),
      numberValue: restricted("number", "数值", "路径对应的数值，可用于聚合。"),
      booleanValue: restricted("boolean", "布尔值", "路径对应的布尔值。"),
    },
    pagination: { ...dashboardPagination, maxPages: 20 },
    limits: {
      ...dashboardLimits,
      maxRows: 10_000,
      maxPages: 20,
      maxBytes: 10 * 1024 * 1024,
    },
    loader: { kind: "reviewEvidence" },
  }),

  definePerformanceAnalysisSource<HrPerformanceCycleAnalysisRow>({
    sourceKey: "hr.performance-cycles",
    label: "HR 绩效周期",
    description: "以一个绩效 dashboard 可选周期为粒度，作为考勤、计划、贡献和正式评审的公共周期维度。",
    rowsPath: "cycleOptions",
    totalPath: "cycleOptions.length",
    scopeMode: "viewer",
    fields: {
      id: internal("integer", "周期 ID", "绩效周期内部 ID。"),
      label: internal("text", "周期名称", "绩效周期公开名称。"),
      code: internal("text", "周期编码", "绩效周期业务编码。"),
      periodType: internal("text", "周期类型", "yearly、half_year、quarterly、monthly 或 weekly。"),
      startDate: internal("date", "开始日期", "绩效周期开始日期。"),
      endDate: internal("date", "结束日期", "绩效周期结束日期。"),
    },
    loader: { kind: "dashboardRows", field: "cycleOptions" },
  }),

  definePerformanceAnalysisSource<HrPerformanceReportingAnalysisRow>({
    sourceKey: "hr.performance-reporting",
    label: "HR 绩效汇报状态",
    description: "以一个当前查看范围的汇报对象为粒度，把 contributionDirectories 中的嵌套 reporting 规范化为固定标量列。",
    rowsPath: "contributionDirectories.reporting",
    totalPath: "reportingSummary.total",
    fields: {
      audienceType: internal("text", "汇报对象类型", "personal、department 或 project。"),
      audienceId: internal("integer", "汇报对象 ID", "员工、部门或项目的内部 ID。"),
      audienceCode: confidential("text", "汇报对象编码", "员工编号、部门编码或项目编码。"),
      audienceName: confidential("text", "汇报对象名称", "员工、部门或项目名称。"),
      reportingApplicable: internal("boolean", "适用汇报收集", "当前周期是否启用周报或月报收集口径。"),
      reportingStatus: internal("text", "汇报状态", "按时、逾期、未交、关闭、未启用或不可用等公开状态。"),
      deadline: internal("date", "汇报截止日期", "当前周期的汇报截止日期。"),
      submittedAt: internal("date", "提交时间", "最终工作汇报提交或更新时间。"),
    },
    loader: { kind: "reporting" },
  }),
] as const;

type DashboardCoverageEntry = Exclude<
  WorkspaceAnalysisReadModelFieldClassification,
  { readonly classification: "field" }
>;

export const HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE = {
  createRuntime: { classification: "omit", reason: "controlPlane", description: "创建动作运行态只控制页面流程入口，不是绩效事实。" },
  currentEmployee: { classification: "omit", reason: "controlPlane", description: "当前员工用于 self 视图选择，不作为独立经营事实。" },
  cycleOptions: { classification: "childSource", sourceKey: "hr.performance-cycles", description: "周期选项已注册为稳定绩效周期维度。" },
  activeCycleId: { classification: "omit", reason: "controlPlane", description: "活动周期是当前查询选择结果，可由请求参数和周期维度解释。" },
  audienceOptions: { classification: "omit", reason: "derivedDuplicate", description: "查看范围选项由 HR 员工、部门和 Work 项目主数据派生。" },
  contributionDirectories: { classification: "childSource", sourceKey: "hr.performance-reporting", description: "目录身份字段与主数据重复，嵌套 reporting 已规范化为汇报状态子数据源。" },
  reportingSummary: { classification: "omit", reason: "derivedDuplicate", description: "汇报汇总可从绩效汇报状态子数据源按状态聚合。" },
  attendanceRows: { classification: "childSource", sourceKey: "hr.performance-attendance", description: "考勤口径已注册为一员工一行的事实源。" },
  workRows: { classification: "childSource", sourceKey: "hr.performance-work-plans", description: "绩效工作计划摘要已注册为一计划一行的事实源。" },
  contributionRows: { classification: "childSource", sourceKey: "hr.performance-contributions", description: "贡献材料已注册为一员工、一工作节点、一角色一行的事实源。" },
  reviewRows: { classification: "childSource", sourceKey: "hr.performance-reviews", description: "正式绩效评审已注册为一归档记录一行的事实源。" },
  submissionRows: { classification: "omit", reason: "controlPlane", description: "绩效 submission 是待办流程及可执行动作记录，不作为经营事实源长期分析。" },
  metrics: { classification: "omit", reason: "derivedDuplicate", description: "dashboard 指标可从考勤、计划、贡献、评审及流程状态重新聚合。" },
} as const satisfies { readonly [Key in keyof HrPerformanceDashboardData]: DashboardCoverageEntry };

export const HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS = performanceAnalysisSources.map((source) => (
  source.registration
));

const performanceSourceDirectory = new Map(performanceAnalysisSources.map((source) => (
  [source.registration.definition.sourceKey, source] as const
)));

export function getHrPerformanceWorkspaceAnalysisSource(sourceKey: string) {
  return performanceSourceDirectory.get(sourceKey);
}

export function isHrPerformanceWorkspaceAnalysisSourceKey(sourceKey: string) {
  return performanceSourceDirectory.has(sourceKey);
}
