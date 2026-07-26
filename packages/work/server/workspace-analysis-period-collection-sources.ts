import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { listWorkPeriodCollection } from "./work-period-collection";

type PeriodCollectionResult = Awaited<ReturnType<typeof listWorkPeriodCollection>>;
export type WorkPeriodCollectionData = Extract<PeriodCollectionResult, { ok: true }>["data"];
type PeriodCollectionCycle = WorkPeriodCollectionData["rootCycle"];
type PeriodCollectionPlan = WorkPeriodCollectionData["plans"][number];
type PeriodCollectionItem = WorkPeriodCollectionData["items"][number];

export type WorkPeriodCollectionCycleAnalysisRow = PeriodCollectionCycle & {
  readonly rowKey: string;
  readonly rootCycleId: number;
  readonly cycleRole: "root" | "overlap";
  readonly displayPeriodType: WorkPeriodCollectionData["displayPeriodType"];
};

export type WorkPeriodCollectionPlanAnalysisRow = {
  readonly rootCycleId: number;
  readonly displayPeriodType: WorkPeriodCollectionData["displayPeriodType"];
  readonly planId: PeriodCollectionPlan["plan"]["id"];
  readonly targetType: PeriodCollectionPlan["plan"]["targetType"];
  readonly targetId: PeriodCollectionPlan["plan"]["targetId"];
  readonly planKind: PeriodCollectionPlan["plan"]["kind"];
  readonly planTitle: PeriodCollectionPlan["plan"]["title"];
  readonly planStatus: PeriodCollectionPlan["plan"]["status"];
  readonly okrCycleId: PeriodCollectionPlan["plan"]["okrCycleId"];
  readonly okrCycleCode: PeriodCollectionPlan["plan"]["okrCycleCode"];
  readonly okrCycleLabel: PeriodCollectionPlan["plan"]["okrCycleLabel"];
  readonly plannedStartDate: PeriodCollectionPlan["plan"]["plannedStartDate"];
  readonly plannedEndDate: PeriodCollectionPlan["plan"]["plannedEndDate"];
  readonly plan: PeriodCollectionPlan["plan"];
  readonly overlapCycleIds: PeriodCollectionPlan["overlapCycleIds"];
};

export type WorkPeriodCollectionItemAnalysisRow = {
  readonly rootCycleId: number;
  readonly displayPeriodType: WorkPeriodCollectionData["displayPeriodType"];
  readonly itemId: PeriodCollectionItem["item"]["id"];
  readonly targetType: PeriodCollectionItem["item"]["targetType"];
  readonly targetId: PeriodCollectionItem["item"]["targetId"];
  readonly itemType: PeriodCollectionItem["item"]["itemType"];
  readonly itemContent: PeriodCollectionItem["item"]["content"];
  readonly itemStatus: PeriodCollectionItem["item"]["status"];
  readonly itemPlannedStartDate: PeriodCollectionItem["item"]["plannedStartDate"];
  readonly itemPlannedEndDate: PeriodCollectionItem["item"]["plannedEndDate"];
  readonly planId: PeriodCollectionItem["planId"];
  readonly planTitle: PeriodCollectionItem["planTitle"];
  readonly planCycleId: PeriodCollectionItem["planCycleId"];
  readonly planCycleLabel: PeriodCollectionItem["planCycleLabel"];
  readonly item: PeriodCollectionItem["item"];
  readonly overlapCycleIds: PeriodCollectionItem["overlapCycleIds"];
};

export type WorkPeriodCollectionOverlapAnalysisRow = {
  readonly rowKey: string;
  readonly rootCycleId: number;
  readonly subjectKind: "plan" | "item";
  readonly subjectId: number;
  readonly targetType: string;
  readonly targetId: number | null;
  readonly cycleId: number;
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
const child = (sourceKey: string, description: string) => ({ classification: "childSource", sourceKey, description } as const);

const TARGET_SCOPES = {
  personal: { mode: "target", description: "只读取目标个人空间在指定根周期内的计划和事项。", query: { targetType: "scopeType", targetId: "scopeId" } },
  department: { mode: "target", description: "只读取目标部门空间在指定根周期内的计划和事项。", query: { targetType: "scopeType", targetId: "scopeId" } },
  project: { mode: "target", description: "只读取目标项目空间在指定根周期内的计划和事项。", query: { targetType: "scopeType", targetId: "scopeId" } },
} as const;

const PARAMETERS = [
  { key: "cycleId", queryKey: "cycleId", label: "根周期", description: "必选 OKR 根周期标识。", kind: "integer", required: true },
  { key: "displayPeriodType", queryKey: "displayPeriodType", label: "展示周期类型", description: "根周期内需要展开的更小周期类型。", kind: "text" },
] as const;

const LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 20,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 } as const;

export const WORK_PERIOD_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS = {
  rootCycle: child("work.period-collection-cycles", "根周期作为 cycleRole=root 的周期事实行。"),
  displayPeriodType: field("text", "展示周期类型", "归一化后的下钻周期类型，随周期、计划和事项行表达。"),
  cycles: child("work.period-collection-cycles", "根周期内有工作日重叠的下钻周期事实行。"),
  plans: child("work.period-collection-plans", "目标空间内与根周期有工作日重叠的计划成员关系。"),
  items: child("work.period-collection-items", "目标空间内入选计划的未归档事项成员关系。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkPeriodCollectionData>;

export const WORK_PERIOD_COLLECTION_PLAN_FIELD_CLASSIFICATIONS = {
  plan: child("work.plans", "完整公开 WorkPlan 标量由工作计划源表达，本源只增加周期入选关系。"),
  overlapCycleIds: child("work.period-collection-overlaps", "计划与下钻周期的多对多重叠关系拆为关系行。"),
} satisfies WorkspaceAnalysisReadModelFields<PeriodCollectionPlan>;

export const WORK_PERIOD_COLLECTION_ITEM_FIELD_CLASSIFICATIONS = {
  item: child("work.items", "完整公开 WorkItem 标量由工作节点源表达，本源只增加周期入选和计划上下文。"),
  planId: id("计划 ID", "事项所属计划标识。"),
  planTitle: confidential("text", "计划名称", "事项所属计划标题。"),
  planCycleId: id("计划周期 ID", "事项所属计划绑定的 OKR 周期标识。"),
  planCycleLabel: field("text", "计划周期", "事项所属计划绑定的 OKR 周期名称。"),
  overlapCycleIds: child("work.period-collection-overlaps", "事项与下钻周期的多对多重叠关系拆为关系行。"),
} satisfies WorkspaceAnalysisReadModelFields<PeriodCollectionItem>;

export const WORK_PERIOD_COLLECTION_CYCLES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPeriodCollectionCycleAnalysisRow>()({
  sourceKey: "work.period-collection-cycles",
  version: 1,
  label: "工作周期集合",
  description: "以指定根周期或其一个有工作日重叠的下钻周期为粒度，保留原周期服务的去重与工作日口径。",
  apiPath: "/api/modules/work/tasks/period-collection",
  rowsPath: "cycles",
  totalPath: "cycles.length",
  scopes: TARGET_SCOPES,
  parameters: PARAMETERS,
  fields: {
    rowKey: field("text", "周期行键", "由根周期、周期角色和周期 ID 组成的稳定行键。"),
    rootCycleId: id("根周期 ID", "本次周期集合的根 OKR 周期标识。"),
    cycleRole: field("text", "周期角色", "root 或 overlap。"),
    displayPeriodType: field("text", "展示周期类型", "归一化后的下钻周期类型。"),
    id: id("周期 ID", "OKR 周期稳定标识。"),
    code: field("text", "周期编码", "OKR 周期业务编码。"),
    label: field("text", "周期名称", "OKR 周期展示名称。"),
    periodType: field("text", "周期类型", "周、月、季度、半年或年度。"),
    startDate: field("date", "周期开始", "周期开始日期。"),
    endDate: field("date", "周期结束", "周期结束日期。"),
    workdayOverlapCount: field("integer", "重叠工作日", "该周期与根周期重叠的中国工作日数量。"),
  },
  pagination: PAGINATION,
  limits: LIMITS,
});

export const WORK_PERIOD_COLLECTION_PLANS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPeriodCollectionPlanAnalysisRow>()({
  sourceKey: "work.period-collection-plans",
  version: 1,
  label: "周期内工作计划",
  description: "以目标空间内一份与根周期有工作日重叠的未归档 OKR 计划为粒度。",
  apiPath: "/api/modules/work/tasks/period-collection",
  rowsPath: "plans",
  totalPath: "plans.length",
  scopes: TARGET_SCOPES,
  parameters: PARAMETERS,
  fields: {
    rootCycleId: id("根周期 ID", "计划入选所依据的根周期标识。"),
    displayPeriodType: field("text", "展示周期类型", "归一化后的下钻周期类型。"),
    planId: id("计划 ID", "入选工作计划标识。"),
    targetType: field("text", "空间类型", "计划真实所属空间类型。"),
    targetId: id("空间 ID", "计划真实所属空间标识。"),
    planKind: field("text", "计划类型", "入选计划类型；当前口径为 okr。"),
    planTitle: confidential("text", "计划名称", "入选计划标题。"),
    planStatus: field("text", "计划状态", "入选计划当前状态。"),
    okrCycleId: id("计划周期 ID", "计划绑定的 OKR 周期标识。"),
    okrCycleCode: field("text", "计划周期编码", "计划绑定的 OKR 周期业务编码。"),
    okrCycleLabel: field("text", "计划周期", "计划绑定的 OKR 周期名称。"),
    plannedStartDate: field("date", "计划开始", "计划的计划开始日期。"),
    plannedEndDate: field("date", "计划结束", "计划的计划结束日期。"),
    plan: child("work.plans", "完整公开 WorkPlan 字段由工作计划源表达。"),
    overlapCycleIds: child("work.period-collection-overlaps", "计划与下钻周期关系拆为独立关系源。"),
  },
  pagination: PAGINATION,
  limits: LIMITS,
});

export const WORK_PERIOD_COLLECTION_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPeriodCollectionItemAnalysisRow>()({
  sourceKey: "work.period-collection-items",
  version: 1,
  label: "周期内工作事项",
  description: "以目标空间周期集合中一条未归档 WorkItem 为粒度，并携带计划与根周期上下文。",
  apiPath: "/api/modules/work/tasks/period-collection",
  rowsPath: "items",
  totalPath: "items.length",
  scopes: TARGET_SCOPES,
  parameters: PARAMETERS,
  fields: {
    rootCycleId: id("根周期 ID", "事项入选所依据的根周期标识。"),
    displayPeriodType: field("text", "展示周期类型", "归一化后的下钻周期类型。"),
    itemId: id("工作节点 ID", "入选 WorkItem 标识。"),
    targetType: field("text", "空间类型", "事项真实所属空间类型。"),
    targetId: id("空间 ID", "事项真实所属空间标识。"),
    itemType: field("text", "节点类型", "objective、key_result 或 task。"),
    itemContent: confidential("text", "工作事项", "入选事项内容。"),
    itemStatus: field("text", "事项状态", "入选事项当前状态。"),
    itemPlannedStartDate: field("date", "事项计划开始", "事项计划开始日期。"),
    itemPlannedEndDate: field("date", "事项计划结束", "事项计划结束日期。"),
    planId: id("计划 ID", "事项所属计划标识。"),
    planTitle: confidential("text", "计划名称", "事项所属计划标题。"),
    planCycleId: id("计划周期 ID", "事项所属计划绑定的 OKR 周期标识。"),
    planCycleLabel: field("text", "计划周期", "事项所属计划绑定的 OKR 周期名称。"),
    item: child("work.items", "完整公开 WorkItem 字段由工作节点源表达。"),
    overlapCycleIds: child("work.period-collection-overlaps", "事项与下钻周期关系拆为独立关系源。"),
  },
  pagination: PAGINATION,
  limits: LIMITS,
});

export const WORK_PERIOD_COLLECTION_OVERLAPS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPeriodCollectionOverlapAnalysisRow>()({
  sourceKey: "work.period-collection-overlaps",
  version: 1,
  label: "周期重叠关系",
  description: "以一份入选计划或事项与一个下钻周期的工作日重叠关系为粒度。",
  apiPath: "/api/modules/work/tasks/period-collection",
  rowsPath: "plans.items.overlapCycleIds",
  totalPath: "plans.items.overlapCycleIds.length",
  scopes: TARGET_SCOPES,
  parameters: PARAMETERS,
  fields: {
    rowKey: field("text", "重叠关系行键", "由根周期、主体类型、主体 ID 和周期 ID 组成。"),
    rootCycleId: id("根周期 ID", "关系所属根周期标识。"),
    subjectKind: field("text", "主体类型", "plan 或 item。"),
    subjectId: id("主体 ID", "入选计划或事项标识。"),
    targetType: field("text", "空间类型", "主体真实所属空间类型。"),
    targetId: id("空间 ID", "主体真实所属空间标识。"),
    cycleId: id("重叠周期 ID", "与主体有工作日重叠的下钻周期标识。"),
  },
  pagination: PAGINATION,
  limits: LIMITS,
});

export const WORK_PERIOD_COLLECTION_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_PERIOD_COLLECTION_CYCLES_ANALYSIS_SOURCE,
  WORK_PERIOD_COLLECTION_PLANS_ANALYSIS_SOURCE,
  WORK_PERIOD_COLLECTION_ITEMS_ANALYSIS_SOURCE,
  WORK_PERIOD_COLLECTION_OVERLAPS_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkPeriodCollectionCycleRows(data: WorkPeriodCollectionData): Generator<WorkPeriodCollectionCycleAnalysisRow> {
  const context = { rootCycleId: data.rootCycle.id, displayPeriodType: data.displayPeriodType } as const;
  yield { rowKey: `${data.rootCycle.id}:root:${data.rootCycle.id}`, cycleRole: "root", ...context, ...data.rootCycle };
  for (const cycle of data.cycles) {
    yield { rowKey: `${data.rootCycle.id}:overlap:${cycle.id}`, cycleRole: "overlap", ...context, ...cycle };
  }
}

export function *iterateWorkPeriodCollectionPlanRows(data: WorkPeriodCollectionData): Generator<WorkPeriodCollectionPlanAnalysisRow> {
  for (const entry of data.plans) {
    yield {
      rootCycleId: data.rootCycle.id,
      displayPeriodType: data.displayPeriodType,
      planId: entry.plan.id,
      targetType: entry.plan.targetType,
      targetId: entry.plan.targetId,
      planKind: entry.plan.kind,
      planTitle: entry.plan.title,
      planStatus: entry.plan.status,
      okrCycleId: entry.plan.okrCycleId,
      okrCycleCode: entry.plan.okrCycleCode,
      okrCycleLabel: entry.plan.okrCycleLabel,
      plannedStartDate: entry.plan.plannedStartDate,
      plannedEndDate: entry.plan.plannedEndDate,
      ...entry,
    };
  }
}

export function *iterateWorkPeriodCollectionItemRows(data: WorkPeriodCollectionData): Generator<WorkPeriodCollectionItemAnalysisRow> {
  for (const entry of data.items) {
    yield {
      rootCycleId: data.rootCycle.id,
      displayPeriodType: data.displayPeriodType,
      itemId: entry.item.id,
      targetType: entry.item.targetType,
      targetId: entry.item.targetId,
      itemType: entry.item.itemType,
      itemContent: entry.item.content,
      itemStatus: entry.item.status,
      itemPlannedStartDate: entry.item.plannedStartDate,
      itemPlannedEndDate: entry.item.plannedEndDate,
      ...entry,
    };
  }
}

export function *iterateWorkPeriodCollectionOverlapRows(data: WorkPeriodCollectionData): Generator<WorkPeriodCollectionOverlapAnalysisRow> {
  for (const entry of data.plans) {
    for (const cycleId of entry.overlapCycleIds) {
      yield overlapRow(data.rootCycle.id, "plan", entry.plan.id, entry.plan.targetType, entry.plan.targetId, cycleId);
    }
  }
  for (const entry of data.items) {
    for (const cycleId of entry.overlapCycleIds) {
      yield overlapRow(data.rootCycle.id, "item", entry.item.id, entry.item.targetType, entry.item.targetId, cycleId);
    }
  }
}

function overlapRow(
  rootCycleId: number,
  subjectKind: "plan" | "item",
  subjectId: number,
  targetType: string,
  targetId: number | null,
  cycleId: number,
): WorkPeriodCollectionOverlapAnalysisRow {
  return {
    rowKey: `${rootCycleId}:${subjectKind}:${subjectId}:${cycleId}`,
    rootCycleId,
    subjectKind,
    subjectId,
    targetType,
    targetId,
    cycleId,
  };
}
