import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { listProjectGantt } from "./projects";

export type WorkProjectGanttResponse = Awaited<ReturnType<typeof listProjectGantt>>;
export type WorkProjectGanttProjectAnalysisRow = WorkProjectGanttResponse["projects"][number];
export type WorkProjectGanttLeaderAnalysisRow = {
  readonly rowKey: string;
  readonly projectId: WorkProjectGanttProjectAnalysisRow["id"];
  readonly projectName: WorkProjectGanttProjectAnalysisRow["name"];
  readonly leaderOrdinal: number;
  readonly leaderName: WorkProjectGanttProjectAnalysisRow["leaderNames"][number];
};

type WorkProjectGanttCompatibilityQuery = Pick<Parameters<typeof listProjectGantt>[0], "includeTasks">;

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
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => ({ classification: "childSource", sourceKey, description } as const);

const VIEWER_SCOPES = {
  personal: {
    mode: "viewer",
    description: "读取当前查看人在原项目甘特页可见的全部未归档项目，不归属到目标个人。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原项目甘特页可见的全部未归档项目，不归属到目标部门。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原项目甘特页可见的全部未归档项目，不归属到目标项目。",
    query: { requesterId: "requesterId" },
  },
} as const;

const PROJECT_GANTT_PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 1,
} as const;

const PROJECT_GANTT_LIMITS = {
  maxRows: 500,
  maxGroups: 200,
  maxPageSize: 500,
  maxPages: 1,
  maxBytes: 4 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

/**
 * The route still exposes tasks as an empty compatibility collection. Keep the
 * outer DTO accounted for without presenting that placeholder as business data.
 */
export const WORK_PROJECT_GANTT_RESPONSE_FIELD_CLASSIFICATIONS = {
  projects: child("work.project-gantt-projects", "可见项目拆为一项目一行。"),
  tasks: omit(
    "unstable",
    "原路由当前始终返回空 tasks 兼容集合；没有真实任务行可供分析，未来启用时必须升级读模型版本。",
  ),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectGanttResponse>;

/** includeTasks is accepted by the route but currently cannot change its empty tasks result. */
export const WORK_PROJECT_GANTT_QUERY_FIELD_CLASSIFICATIONS = {
  includeTasks: omit(
    "unstable",
    "includeTasks 是尚未生效的兼容参数；当前 true/false 都返回空 tasks，不登记成可用分析参数。",
  ),
} satisfies WorkspaceAnalysisReadModelFields<WorkProjectGanttCompatibilityQuery>;

export const WORK_PROJECT_GANTT_PROJECTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkProjectGanttProjectAnalysisRow>()({
  sourceKey: "work.project-gantt-projects",
  version: 1,
  label: "项目甘特项目",
  description: "以当前查看人在原项目甘特页可见的一条未归档项目为粒度，保留项目日期优先、active baseline 项目项日期回退的原服务口径。",
  apiPath: "/api/modules/work/projects/gantt",
  rowsPath: "projects",
  totalPath: "projects.length",
  scopes: VIEWER_SCOPES,
  fields: {
    id: id("项目 ID", "项目稳定标识。"),
    name: confidential("text", "项目名称", "项目名称。"),
    status: field("text", "项目状态", "项目当前状态。"),
    projectType: field("text", "项目类型", "项目类型。"),
    projectLevel: field("text", "项目级别", "项目级别。"),
    leadingDepartmentId: id("归口部门 ID", "项目归口部门标识。"),
    leadingDepartmentCode: field("text", "归口部门编码", "项目归口部门业务编码。"),
    leadingDepartmentName: field("text", "归口部门", "项目归口部门名称。"),
    workspaceEnabled: field("boolean", "项目空间", "项目空间是否启用。"),
    leaderNames: child("work.project-gantt-leaders", "项目负责人姓名拆为一项目一负责人关系行。"),
    stages: omit(
      "unstable",
      "原路由当前始终返回空 stages 兼容集合；不生成虚构阶段行，未来启用时必须升级读模型版本。",
    ),
    actualStartDate: field("date", "实际开始", "项目实际开始日期。"),
    actualEndDate: field("date", "实际结束", "项目实际结束日期。"),
    completionPercent: field("percent", "完成度", "项目完成百分比。"),
    plannedStartDate: field(
      "date",
      "计划开始",
      "项目自身计划开始日期；为空时沿用原服务的 active baseline 项目项计划开始日期回退值。",
    ),
    plannedEndDate: field(
      "date",
      "计划结束",
      "项目自身计划结束日期；为空时沿用原服务的 active baseline 项目项计划结束日期回退值。",
    ),
  },
  pagination: PROJECT_GANTT_PAGINATION,
  limits: PROJECT_GANTT_LIMITS,
});

export const WORK_PROJECT_GANTT_LEADERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkProjectGanttLeaderAnalysisRow>()({
  sourceKey: "work.project-gantt-leaders",
  version: 1,
  label: "项目甘特负责人",
  description: "以项目甘特公开 DTO 中的一条项目负责人姓名关系为粒度；原 DTO 未公开员工标识，因此仅保留项目身份、顺序和姓名。",
  apiPath: "/api/modules/work/projects/gantt",
  rowsPath: "projects.leaderNames",
  totalPath: "projects.leaderNames.length",
  scopes: VIEWER_SCOPES,
  fields: {
    rowKey: field("text", "负责人行键", "由项目 ID 与公开负责人顺序组成的确定性行键。"),
    projectId: id("项目 ID", "负责人所属项目标识。"),
    projectName: confidential("text", "项目名称", "负责人所属项目名称。"),
    leaderOrdinal: field("integer", "负责人顺序", "负责人在原公开 DTO 中的一基顺序。", {
      capabilities: { groupable: true },
    }),
    leaderName: confidential("text", "项目负责人", "原项目甘特 DTO 公开的负责人姓名。"),
  },
  pagination: PROJECT_GANTT_PAGINATION,
  limits: PROJECT_GANTT_LIMITS,
});

export const WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_PROJECT_GANTT_PROJECTS_ANALYSIS_SOURCE,
  WORK_PROJECT_GANTT_LEADERS_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkProjectGanttProjectAnalysisRows(
  data: WorkProjectGanttResponse,
): Generator<WorkProjectGanttProjectAnalysisRow> {
  yield *data.projects;
}

export function *iterateWorkProjectGanttLeaderAnalysisRows(
  data: WorkProjectGanttResponse,
): Generator<WorkProjectGanttLeaderAnalysisRow> {
  for (const project of data.projects) {
    for (const [leaderIndex, leaderName] of project.leaderNames.entries()) {
      const leaderOrdinal = leaderIndex + 1;
      yield {
        rowKey: `${project.id}:${leaderOrdinal}`,
        projectId: project.id,
        projectName: project.name,
        leaderOrdinal,
        leaderName,
      };
    }
  }
}
