import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type {
  listProjectPlanBaselines,
  listProjectPlanGantt,
  listProjectPlanPhases,
} from "./projects/plan";

type ProjectPlanBaselinesResult = Awaited<ReturnType<typeof listProjectPlanBaselines>>;
type ProjectPlanPhasesResult = Awaited<ReturnType<typeof listProjectPlanPhases>>;
type ProjectPlanGanttResult = Awaited<ReturnType<typeof listProjectPlanGantt>>;

export type WorkProjectPlanBaselinesData = Extract<ProjectPlanBaselinesResult, { ok: true }>["data"];
export type WorkProjectPlanPhasesData = Extract<ProjectPlanPhasesResult, { ok: true }>["data"];
export type WorkProjectPlanGanttData = Extract<ProjectPlanGanttResult, { ok: true }>["data"];

type PublicProjectPlanBaseline = WorkProjectPlanBaselinesData["baselines"][number];
type PublicProjectPlanPhase = WorkProjectPlanPhasesData["phases"][number];
type PublicProjectPlanGanttItem = WorkProjectPlanGanttData["items"][number];
type PublicProjectPlanDependency = WorkProjectPlanGanttData["dependencies"][number];
type PublicProjectPlanActiveBaseline = NonNullable<WorkProjectPlanGanttData["activeBaseline"]>;
type PublicProjectPlanBaselineItem = PublicProjectPlanActiveBaseline["items"][number];

export type WorkProjectPlanBaselineAnalysisRow = PublicProjectPlanBaseline & {
  readonly projectId: number;
};
export type WorkProjectPlanGanttItemAnalysisRow = PublicProjectPlanGanttItem & {
  readonly projectId: WorkProjectPlanGanttData["projectId"];
};
export type WorkProjectPlanGanttOwnerAnalysisRow = {
  readonly rowKey: string;
  readonly projectId: WorkProjectPlanGanttData["projectId"];
  readonly planItemId: PublicProjectPlanGanttItem["id"];
  readonly ownerOrdinal: number;
  readonly ownerName: PublicProjectPlanGanttItem["ownerNames"][number];
};
export type WorkProjectPlanDependencyAnalysisRow = PublicProjectPlanDependency & {
  readonly projectId: WorkProjectPlanGanttData["projectId"];
};
export type WorkProjectPlanBaselineItemAnalysisRow = PublicProjectPlanBaselineItem & {
  readonly projectId: WorkProjectPlanGanttData["projectId"];
  readonly baselineId: PublicProjectPlanActiveBaseline["id"];
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
const child = (sourceKey: string, description: string) => (
  { classification: "childSource", sourceKey, description } as const
);

const VIEWER_SCOPES = {
  personal: {
    mode: "viewer",
    description: "读取当前查看人在原项目页可见的指定项目计划，不归属到当前个人空间。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原项目页可见的指定项目计划，不伪造为目标部门数据。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原项目页可见的指定项目计划，不借用页面目标绕过项目对象权限。",
    query: { requesterId: "requesterId" },
  },
} as const;

const PROJECT_ID_PARAMETER = {
  key: "planProjectId",
  queryKey: "planProjectId",
  label: "项目",
  description: "必选项目稳定标识；执行时由原项目阶段、基线或甘特服务复核当前查看人的对象可见性。",
  kind: "integer",
  required: true,
} as const;

const PROJECT_PLAN_LIMITS = {
  maxRows: 1_000,
  maxGroups: 500,
  maxPageSize: 500,
  maxPages: 2,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const PROJECT_PLAN_PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 2,
} as const;

export const WORK_PROJECT_PLAN_BASELINES_RESPONSE_FIELD_CLASSIFICATIONS = {
  baselines: child("work.project-plan-baselines", "指定项目的基线头拆为一基准一行。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanBaselinesData>;

export const WORK_PROJECT_PLAN_PHASES_RESPONSE_FIELD_CLASSIFICATIONS = {
  phases: child("work.project-plan-phases", "指定项目的阶段拆为一阶段一行。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanPhasesData>;

export const WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS = {
  projectId: child("work.project-plan-gantt-items", "项目查询身份随唯一项目甘特根节点表达。"),
  permissions: omit("controlPlane", "当前查看人的项目操作权限矩阵不是经营事实。"),
  phases: child("work.project-plan-phases", "阶段与原阶段列表是同一公开事实，统一复用阶段来源。"),
  items: child("work.project-plan-gantt-items", "项目甘特根节点拆为一节点一行。"),
  dependencies: child("work.project-plan-dependencies", "项目计划依赖拆为一依赖一行。"),
  activeBaseline: child(
    "work.project-plan-baselines",
    "active baseline 头与基线列表是同一事实，统一复用基线来源；其 items 另拆为基线条目来源。",
  ),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanGanttData>;

export const WORK_PROJECT_PLAN_ACTIVE_BASELINE_FIELD_CLASSIFICATIONS = {
  id: child("work.project-plan-baselines", "active baseline ID 复用 isActive=true 的基线头。"),
  name: child("work.project-plan-baselines", "active baseline 名称复用 isActive=true 的基线头。"),
  note: child("work.project-plan-baselines", "active baseline 备注复用 isActive=true 的基线头。"),
  createdAt: child("work.project-plan-baselines", "active baseline 创建时间复用 isActive=true 的基线头。"),
  items: child("work.project-plan-baseline-items", "active baseline 快照条目拆为一条目一行。"),
} satisfies WorkspaceAnalysisReadModelFields<PublicProjectPlanActiveBaseline>;

const phaseFields = {
  id: id("阶段 ID", "项目阶段稳定标识。"),
  version: field("integer", "阶段版本", "项目阶段并发控制版本。"),
  projectId: id("项目 ID", "阶段所属项目标识。"),
  sequenceNo: field("integer", "阶段序号", "阶段在项目计划中的业务顺序。"),
  name: confidential("text", "阶段名称", "项目阶段名称。"),
  plannedStartDate: field("date", "计划开始", "阶段计划开始日期。"),
  plannedEndDate: field("date", "计划结束", "阶段计划结束日期。"),
  note: narrative("阶段备注", "项目阶段备注。"),
} satisfies WorkspaceAnalysisReadModelFields<PublicProjectPlanPhase>;

const baselineFields = {
  projectId: id("项目 ID", "查询参数绑定的项目标识。"),
  id: id("基线 ID", "项目计划基线稳定标识。"),
  name: confidential("text", "基线名称", "项目计划基线名称。"),
  note: narrative("基线备注", "项目计划基线备注。"),
  isActive: field("boolean", "当前基线", "该基线是否为项目当前激活基线。"),
  createdAt: field("date", "创建时间", "项目计划基线创建时间。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanBaselineAnalysisRow>;

const ganttItemFields = {
  projectId: id("项目 ID", "查询参数绑定且经对象权限复核的项目标识。"),
  kind: field("text", "节点类型", "甘特节点类型；当前公开值为 project。"),
  id: id("节点 ID", "项目甘特根节点标识。"),
  name: confidential("text", "项目名称", "项目甘特根节点名称。"),
  parentKind: field("text", "上级节点类型", "项目甘特根节点的上级类型。"),
  parentId: id("上级节点 ID", "项目甘特根节点的上级标识。"),
  phaseId: id("阶段 ID", "甘特节点关联项目阶段标识。"),
  status: field("text", "项目状态", "项目当前状态。"),
  projectLevel: field("text", "项目级别", "项目当前级别。"),
  isMilestone: field("boolean", "里程碑", "甘特节点是否作为里程碑展示。"),
  ownerNames: child("work.project-plan-gantt-owners", "项目负责人姓名拆为一节点一负责人关系行。"),
  actualStartDate: field("date", "实际开始", "项目实际开始日期。"),
  actualEndDate: field("date", "实际结束", "项目实际结束日期。"),
  plannedStartDate: field("date", "计划开始", "项目自身日期为空时，沿用原服务从阶段首日推导的计划开始日期。"),
  plannedEndDate: field("date", "计划结束", "项目自身日期为空时，沿用原服务从阶段末日推导的计划结束日期。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanGanttItemAnalysisRow>;

const ganttOwnerFields = {
  rowKey: field("text", "负责人行键", "由项目、甘特节点和公开负责人顺序组成的确定性行键。"),
  projectId: id("项目 ID", "负责人所属项目标识。"),
  planItemId: id("甘特节点 ID", "负责人所属甘特节点标识。"),
  ownerOrdinal: field("integer", "负责人顺序", "负责人在公开 DTO 中的一基顺序。"),
  ownerName: confidential("text", "项目负责人", "原项目甘特详情公开的负责人姓名。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanGanttOwnerAnalysisRow>;

const dependencyFields = {
  projectId: id("项目 ID", "依赖所属项目标识。"),
  id: id("依赖 ID", "项目计划依赖稳定标识。"),
  predecessorKind: field("text", "前置节点类型", "依赖前置节点类型。"),
  predecessorId: id("前置节点 ID", "依赖前置节点标识。"),
  successorKind: field("text", "后续节点类型", "依赖后续节点类型。"),
  successorId: id("后续节点 ID", "依赖后续节点标识。"),
  dependencyType: field("text", "依赖类型", "项目计划依赖类型。"),
  lagDays: field("integer", "间隔天数", "前置与后续节点之间的间隔天数。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanDependencyAnalysisRow>;

const baselineItemFields = {
  projectId: id("项目 ID", "基线条目所属项目标识。"),
  baselineId: id("基线 ID", "条目所属 active baseline 标识。"),
  id: id("基线条目 ID", "项目计划基线条目稳定标识。"),
  itemKind: field("text", "快照节点类型", "基线快照节点类型。"),
  itemId: id("快照节点 ID", "基线快照所引用的业务节点标识。"),
  parentKind: field("text", "上级节点类型", "基线快照上级节点类型。"),
  parentId: id("上级节点 ID", "基线快照上级节点标识。"),
  phaseId: id("阶段 ID", "基线条目关联项目阶段标识。"),
  name: confidential("text", "快照名称", "创建基线时固化的节点名称。"),
  status: field("text", "快照状态", "创建基线时固化的节点状态。"),
  isMilestone: field("boolean", "里程碑快照", "创建基线时固化的里程碑标记。"),
  plannedStartDate: field("date", "计划开始快照", "创建基线时固化的计划开始日期。"),
  plannedEndDate: field("date", "计划结束快照", "创建基线时固化的计划结束日期。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectPlanBaselineItemAnalysisRow>;

const source = <TRow extends object>(input: {
  sourceKey: string;
  label: string;
  description: string;
  apiPath: string;
  rowsPath: string;
  totalPath: string;
  fields: WorkspaceAnalysisReadModelFields<TRow>;
  maxRows?: number;
}) => defineWorkspaceAnalysisReadModel<TRow>()({
  sourceKey: input.sourceKey,
  version: 1,
  label: input.label,
  description: input.description,
  apiPath: input.apiPath,
  rowsPath: input.rowsPath,
  totalPath: input.totalPath,
  scopes: VIEWER_SCOPES,
  parameters: [PROJECT_ID_PARAMETER],
  fields: input.fields,
  pagination: input.maxRows === 1
    ? { ...PROJECT_PLAN_PAGINATION, pageSize: 1, maxPages: 1 }
    : PROJECT_PLAN_PAGINATION,
  limits: input.maxRows === 1
    ? { ...PROJECT_PLAN_LIMITS, maxRows: 1, maxPageSize: 1, maxPages: 1 }
    : PROJECT_PLAN_LIMITS,
});

export const WORK_PROJECT_PLAN_PHASES_ANALYSIS_SOURCE = source<PublicProjectPlanPhase>({
  sourceKey: "work.project-plan-phases",
  label: "项目计划阶段",
  description: "以当前查看人可见指定项目中的一条存量计划阶段为粒度。",
  apiPath: "/api/modules/work/projects/[id]/plan-phases",
  rowsPath: "phases",
  totalPath: "phases.length",
  fields: phaseFields,
});

export const WORK_PROJECT_PLAN_BASELINES_ANALYSIS_SOURCE = source<WorkProjectPlanBaselineAnalysisRow>({
  sourceKey: "work.project-plan-baselines",
  label: "项目计划基线",
  description: "以当前查看人可见指定项目中的一条计划基线头为粒度；active 状态是基线头的唯一权威事实。",
  apiPath: "/api/modules/work/projects/[id]/plan-baselines",
  rowsPath: "baselines",
  totalPath: "baselines.length",
  fields: baselineFields,
});

export const WORK_PROJECT_PLAN_GANTT_ITEMS_ANALYSIS_SOURCE = source<WorkProjectPlanGanttItemAnalysisRow>({
  sourceKey: "work.project-plan-gantt-items",
  label: "项目计划甘特节点",
  description: "以当前查看人可见指定项目的一个甘特根节点为粒度，保留原服务解析后的项目计划日期口径。",
  apiPath: "/api/modules/work/projects/[id]/plan-gantt",
  rowsPath: "items",
  totalPath: "items.length",
  fields: ganttItemFields,
  maxRows: 1,
});

export const WORK_PROJECT_PLAN_GANTT_OWNERS_ANALYSIS_SOURCE = source<WorkProjectPlanGanttOwnerAnalysisRow>({
  sourceKey: "work.project-plan-gantt-owners",
  label: "项目计划负责人",
  description: "以指定项目甘特根节点的一位公开负责人姓名为粒度；原 DTO 未公开员工标识。",
  apiPath: "/api/modules/work/projects/[id]/plan-gantt",
  rowsPath: "items.ownerNames",
  totalPath: "items.ownerNames.length",
  fields: ganttOwnerFields,
});

export const WORK_PROJECT_PLAN_DEPENDENCIES_ANALYSIS_SOURCE = source<WorkProjectPlanDependencyAnalysisRow>({
  sourceKey: "work.project-plan-dependencies",
  label: "项目计划依赖",
  description: "以当前查看人可见指定项目中的一条非 task 计划依赖为粒度，沿用原甘特详情过滤口径。",
  apiPath: "/api/modules/work/projects/[id]/plan-gantt",
  rowsPath: "dependencies",
  totalPath: "dependencies.length",
  fields: dependencyFields,
});

export const WORK_PROJECT_PLAN_BASELINE_ITEMS_ANALYSIS_SOURCE = source<WorkProjectPlanBaselineItemAnalysisRow>({
  sourceKey: "work.project-plan-baseline-items",
  label: "项目当前基线条目",
  description: "以当前查看人可见指定项目 active baseline 中的一条非 task 快照条目为粒度；基线头统一连接基线来源。",
  apiPath: "/api/modules/work/projects/[id]/plan-gantt",
  rowsPath: "activeBaseline.items",
  totalPath: "activeBaseline.items.length",
  fields: baselineItemFields,
});

export const WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_PROJECT_PLAN_PHASES_ANALYSIS_SOURCE,
  WORK_PROJECT_PLAN_BASELINES_ANALYSIS_SOURCE,
  WORK_PROJECT_PLAN_GANTT_ITEMS_ANALYSIS_SOURCE,
  WORK_PROJECT_PLAN_GANTT_OWNERS_ANALYSIS_SOURCE,
  WORK_PROJECT_PLAN_DEPENDENCIES_ANALYSIS_SOURCE,
  WORK_PROJECT_PLAN_BASELINE_ITEMS_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkProjectPlanPhaseRows(
  data: WorkProjectPlanPhasesData,
): Generator<PublicProjectPlanPhase> {
  yield *data.phases;
}

export function *iterateWorkProjectPlanBaselineRows(
  data: WorkProjectPlanBaselinesData,
  projectId: number,
): Generator<WorkProjectPlanBaselineAnalysisRow> {
  for (const baseline of data.baselines) yield { projectId, ...baseline };
}

export function *iterateWorkProjectPlanGanttItemRows(
  data: WorkProjectPlanGanttData,
): Generator<WorkProjectPlanGanttItemAnalysisRow> {
  for (const item of data.items) yield { projectId: data.projectId, ...item };
}

export function *iterateWorkProjectPlanGanttOwnerRows(
  data: WorkProjectPlanGanttData,
): Generator<WorkProjectPlanGanttOwnerAnalysisRow> {
  for (const item of data.items) {
    for (const [ownerIndex, ownerName] of item.ownerNames.entries()) {
      const ownerOrdinal = ownerIndex + 1;
      yield {
        rowKey: `${data.projectId}:${item.id}:${ownerOrdinal}`,
        projectId: data.projectId,
        planItemId: item.id,
        ownerOrdinal,
        ownerName,
      };
    }
  }
}

export function *iterateWorkProjectPlanDependencyRows(
  data: WorkProjectPlanGanttData,
): Generator<WorkProjectPlanDependencyAnalysisRow> {
  for (const dependency of data.dependencies) yield { projectId: data.projectId, ...dependency };
}

export function *iterateWorkProjectPlanBaselineItemRows(
  data: WorkProjectPlanGanttData,
): Generator<WorkProjectPlanBaselineItemAnalysisRow> {
  if (!data.activeBaseline) return;
  for (const item of data.activeBaseline.items) {
    yield { projectId: data.projectId, baselineId: data.activeBaseline.id, ...item };
  }
}
