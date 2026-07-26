import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { listWorkReportCollection } from "./task-reports";

type WorkReportCollectionResult = Awaited<ReturnType<typeof listWorkReportCollection>>;
export type WorkReportCollectionData = Extract<WorkReportCollectionResult, { ok: true }>["data"];
type WorkReportCollectionSpace = WorkReportCollectionData["spaces"][number];
type PublicWorkReport = WorkReportCollectionSpace["reports"][number];
type PublicWorkReportItem = PublicWorkReport["items"][number];

export type WorkReportAnalysisRow = Omit<PublicWorkReport, "items" | "groups"> & {
  readonly spaceName: WorkReportCollectionSpace["name"];
  readonly spaceSubtitle: WorkReportCollectionSpace["subtitle"];
  readonly spaceStatus: WorkReportCollectionSpace["status"];
  readonly items: PublicWorkReport["items"];
  readonly groups: PublicWorkReport["groups"];
};

export type WorkReportItemAnalysisRow = PublicWorkReportItem & {
  readonly reportId: PublicWorkReport["id"];
  readonly targetType: PublicWorkReport["targetType"];
  readonly targetId: PublicWorkReport["targetId"];
  readonly spaceName: WorkReportCollectionSpace["name"];
  readonly spaceSubtitle: WorkReportCollectionSpace["subtitle"];
  readonly periodType: PublicWorkReport["periodType"];
  readonly reportStage: PublicWorkReport["reportStage"];
  readonly periodStart: PublicWorkReport["periodStart"];
  readonly periodEnd: PublicWorkReport["periodEnd"];
  readonly submittedBy: PublicWorkReport["submittedBy"];
  readonly submitterName: PublicWorkReport["submitterName"];
  readonly submittedAt: PublicWorkReport["submittedAt"];
  readonly reportUpdatedAt: PublicWorkReport["updatedAt"];
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
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => ({ classification: "childSource", sourceKey, description } as const);

const VIEWER_SCOPES = {
  personal: {
    mode: "viewer",
    description: "读取当前查看人在原工作汇总页可见的全部工作空间，不归属到当前个人空间。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原工作汇总页可见的全部工作空间，不归属到目标部门。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原工作汇总页可见的全部工作空间，不归属到目标项目。",
    query: { requesterId: "requesterId" },
  },
} as const;

const REPORT_PARAMETERS = [
  {
    key: "periodType",
    queryKey: "periodType",
    label: "汇报周期类型",
    description: "复用汇总页周期类型；未提供时由原业务服务按当前周期归一化。",
    kind: "text",
  },
  {
    key: "periodStart",
    queryKey: "periodStart",
    label: "汇报周期开始",
    description: "复用汇总页周期开始日期；未提供时由原业务服务按当前日期归一化。",
    kind: "date",
  },
] as const;

const REPORT_LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 20,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

const REPORT_PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 250,
  maxPages: 20,
} as const;

/**
 * The collection route has a nested response rather than a flat table. Keep an
 * explicit account of the outer DTO so empty-space display state cannot vanish
 * from review merely because the analytical sources contain saved facts only.
 */
export const WORK_REPORT_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS = {
  period: omit(
    "derivedDuplicate",
    "归一化周期由 source 参数以及每条已保存报表的周期字段表达；没有已保存报表时，它只是本次查询上下文。",
  ),
  spaces: child(
    "work.reports",
    "空间容器中的已保存报表拆为报表事实；空间自身的公开字段另有逐项分类。",
  ),
} satisfies WorkspaceAnalysisReadModelFields<WorkReportCollectionData>;

export const WORK_REPORT_COLLECTION_SPACE_FIELD_CLASSIFICATIONS = {
  targetType: field("text", "空间类型", "可见工作空间类型，映射到已保存报表的 targetType。"),
  targetId: id("空间 ID", "可见工作空间标识，映射到已保存报表的 targetId。"),
  name: confidential("text", "空间名称", "可见工作空间名称，映射到 spaceName。"),
  subtitle: confidential("text", "空间副标题", "可见工作空间副标题，映射到 spaceSubtitle。"),
  status: omit(
    "derivedDuplicate",
    "submitted/missing 只表示当前查询周期是否存在已保存报表；missing 空间不是报表事实，不生成空报表行。",
  ),
  reports: child("work.reports", "空间中的已保存 WorkReport 拆为一报表一行。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkReportCollectionSpace>;

export const WORK_REPORTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkReportAnalysisRow>()({
  sourceKey: "work.reports",
  version: 1,
  label: "工作汇报",
  description: "以当前查看人在汇总页可见的一份已保存 WorkReport 为粒度；空间仅作为真实行身份，不按当前页面空间伪造归属。",
  apiPath: "/api/modules/work/tasks/reports/collection",
  rowsPath: "spaces.reports",
  totalPath: "spaces.reports.length",
  scopes: VIEWER_SCOPES,
  parameters: REPORT_PARAMETERS,
  fields: {
    spaceName: confidential("text", "空间名称", "报表所属可见工作空间名称。"),
    spaceSubtitle: confidential("text", "空间副标题", "报表所属可见工作空间副标题。"),
    spaceStatus: omit(
      "derivedDuplicate",
      "有已保存报表的行恒为 submitted；missing 只属于集合页空状态，不是已保存报表事实。",
    ),
    id: id("汇报 ID", "已保存 WorkReport 稳定标识。"),
    targetType: field("text", "空间类型", "报表真实所属空间类型。"),
    targetId: id("空间 ID", "报表真实所属空间标识。"),
    periodType: field("text", "周期类型", "周、月、季度、半年或年度汇报周期。"),
    reportStage: field("text", "汇报阶段", "kr 或 final。"),
    periodStart: field("date", "周期开始", "已保存汇报的周期开始日期。"),
    periodEnd: field("date", "周期结束", "已保存汇报的周期结束日期。"),
    submittedBy: id("提交用户 ID", "最后保存或提交该汇报的用户标识。"),
    submitterName: confidential("text", "提交人", "最后保存或提交该汇报的用户展示名称。"),
    submittedAt: field("date", "提交时间", "汇报提交时间；未提交时为空。"),
    updatedAt: field("date", "更新时间", "汇报最后更新时间。"),
    items: child("work.report-items", "已保存汇报事项拆为一事项一行。"),
    groups: omit("derivedDuplicate", "groups 只是按 workPlanId/workPlanKind 对 items 的展示分组，可由报表事项重建。"),
  },
  pagination: REPORT_PAGINATION,
  limits: REPORT_LIMITS,
});

export const WORK_REPORT_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkReportItemAnalysisRow>()({
  sourceKey: "work.report-items",
  version: 1,
  label: "工作汇报事项",
  description: "以当前查看人在汇总页可见的一条已保存 WorkReportItem 为粒度，并携带报表、周期和真实空间身份。",
  apiPath: "/api/modules/work/tasks/reports/collection",
  rowsPath: "spaces.reports.items",
  totalPath: "spaces.reports.items.length",
  scopes: VIEWER_SCOPES,
  parameters: REPORT_PARAMETERS,
  fields: {
    reportId: id("汇报 ID", "事项所属已保存 WorkReport 标识。"),
    targetType: field("text", "空间类型", "事项所属报表的真实空间类型。"),
    targetId: id("空间 ID", "事项所属报表的真实空间标识。"),
    spaceName: confidential("text", "空间名称", "事项所属可见工作空间名称。"),
    spaceSubtitle: confidential("text", "空间副标题", "事项所属可见工作空间副标题。"),
    periodType: field("text", "周期类型", "事项所属报表的周期类型。"),
    reportStage: field("text", "汇报阶段", "事项所属报表的 kr 或 final 阶段。"),
    periodStart: field("date", "周期开始", "事项所属报表的周期开始日期。"),
    periodEnd: field("date", "周期结束", "事项所属报表的周期结束日期。"),
    submittedBy: id("提交用户 ID", "事项所属报表最后保存或提交用户标识。"),
    submitterName: confidential("text", "提交人", "事项所属报表最后保存或提交用户名称。"),
    submittedAt: field("date", "提交时间", "事项所属报表的提交时间。"),
    reportUpdatedAt: field("date", "报表更新时间", "事项所属报表的最后更新时间。"),
    id: id("汇报事项 ID", "已保存 WorkReportItem 稳定标识。"),
    workPlanId: id("工作计划 ID", "事项快照关联的工作计划标识。"),
    workItemId: id("工作节点 ID", "事项快照关联的工作节点标识。"),
    title: narrative("事项标题", "已保存汇报事项标题。"),
    workPlanTitle: narrative("计划标题快照", "保存汇报时固化的工作计划标题。"),
    workPlanKind: field("text", "计划类型快照", "保存汇报时固化的 okr 或 routine 类型。"),
    workItemType: field("text", "节点类型快照", "保存汇报时固化的 objective、key_result 或 task 类型。"),
    parentWorkItemId: id("父节点 ID 快照", "保存汇报时固化的父工作节点标识。"),
    parentTitle: narrative("父节点标题快照", "保存汇报时固化的父节点标题。"),
    objectiveTitleSnapshot: narrative("目标标题快照", "保存汇报时固化的目标标题。"),
    keyResultTitleSnapshot: narrative("关键结果标题快照", "保存汇报时固化的关键结果标题。"),
    reportItemKind: field("text", "事项分区", "assessment、current、routine 或 next。"),
    workItemStatusSnapshot: field("text", "节点状态快照", "保存汇报时固化的工作节点状态。"),
    snapshotPlannedStartDate: field("date", "计划开始快照", "保存汇报时固化的计划开始日期。"),
    snapshotPlannedEndDate: field("date", "计划结束快照", "保存汇报时固化的计划结束日期。"),
    snapshotActualEndDate: field("date", "实际结束快照", "保存汇报时固化的实际结束日期。"),
    snapshotCompletedAt: field("date", "完成时间快照", "保存汇报时固化的完成时间。"),
    previousPlanSnapshot: narrative("上期计划快照", "保存汇报时固化的上期计划内容。"),
    currentKeyResult: narrative("本期完成情况", "已保存的本期完成情况。"),
    nextObjective: narrative("下期计划", "已保存的下期计划。"),
    note: narrative("备注", "已保存的汇报事项备注。"),
    selfScore: confidential("integer", "自评分", "已保存的事项自评分。"),
    performanceScore: confidential("integer", "绩效分", "已保存的事项绩效评分。"),
    sortOrder: field("integer", "排序", "事项在报表内的稳定排序值。", { capabilities: { groupable: true } }),
  },
  pagination: REPORT_PAGINATION,
  limits: REPORT_LIMITS,
});

export function *iterateWorkReportAnalysisRows(data: WorkReportCollectionData): Generator<WorkReportAnalysisRow> {
  for (const space of data.spaces) {
    for (const report of space.reports) {
      yield {
        spaceName: space.name,
        spaceSubtitle: space.subtitle,
        spaceStatus: space.status,
        ...report,
      };
    }
  }
}

export function *iterateWorkReportItemAnalysisRows(data: WorkReportCollectionData): Generator<WorkReportItemAnalysisRow> {
  for (const space of data.spaces) {
    for (const report of space.reports) {
      for (const item of report.items) {
        yield {
          reportId: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          spaceName: space.name,
          spaceSubtitle: space.subtitle,
          periodType: report.periodType,
          reportStage: report.reportStage,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          submittedBy: report.submittedBy,
          submitterName: report.submitterName,
          submittedAt: report.submittedAt,
          reportUpdatedAt: report.updatedAt,
          ...item,
        };
      }
    }
  }
}
