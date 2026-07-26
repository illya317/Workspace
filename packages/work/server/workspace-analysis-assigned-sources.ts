import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { executeAssignedDepartmentWorkItemsRouteCommand } from "./work-task-route-command";

type WorkAssignedRouteResult = Awaited<ReturnType<typeof executeAssignedDepartmentWorkItemsRouteCommand>>;
export type WorkAssignedResponseData = Extract<WorkAssignedRouteResult, { ok: true }>["data"];
type PublicAssignedPlanGroup = WorkAssignedResponseData["planGroups"][number];
type PublicAssignedPlan = PublicAssignedPlanGroup["plan"];
type PublicAssignedItem = PublicAssignedPlanGroup["assignedWorks"][number];

/**
 * `personal_collaboration` is an assignment made from another user's personal
 * space. It is intentionally distinct from the DepartmentCollaboration model.
 */
export type WorkAssignmentKind = "department_or_project" | "personal_collaboration";

export type WorkAssignedPlanGroupAnalysisRow = PublicAssignedPlan & {
  readonly assignmentKind: WorkAssignmentKind;
  readonly arrangerEmployeeName: string | null;
  readonly assignerSpaceName: string | null;
};

export type WorkAssignedItemAnalysisRow = PublicAssignedItem & {
  readonly assignmentKind: WorkAssignmentKind;
  readonly assignedPlanTitle: PublicAssignedPlan["title"];
  readonly assignedPlanKind: PublicAssignedPlan["kind"];
  readonly arrangerEmployeeName: string | null;
  readonly assignerSpaceName: string | null;
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
    description: "读取当前查看人在原承接页可见的全部分配事项，不归属到当前个人空间。",
    query: { requesterId: "requesterId" },
  },
  department: {
    mode: "viewer",
    description: "读取当前查看人在原承接页可见的全部分配事项，不伪造为目标部门数据。",
    query: { requesterId: "requesterId" },
  },
  project: {
    mode: "viewer",
    description: "读取当前查看人在原承接页可见的全部分配事项，不伪造为目标项目数据。",
    query: { requesterId: "requesterId" },
  },
} as const;

const ASSIGNED_LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 20,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

const ASSIGNED_PAGINATION = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 250,
  maxPages: 20,
} as const;

/** Accounts for every field returned by the public assigned route. */
export const WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS = {
  works: omit(
    "derivedDuplicate",
    "部门/项目承接事项与 planGroups[].assignedWorks 相同；由 work.assigned-items 统一表达并附带分配类型。",
  ),
  collaborationWorks: omit(
    "derivedDuplicate",
    "他人个人空间分配事项与 collaborationPlanGroups[].assignedWorks 相同；由 work.assigned-items 统一表达并附带分配类型。",
  ),
  planGroups: child("work.assigned-plan-groups", "部门或项目空间分配的计划组规范化为承接计划组事实。"),
  collaborationPlanGroups: child(
    "work.assigned-plan-groups",
    "他人个人空间分配的计划组规范化为 personal_collaboration 计划组事实。",
  ),
} satisfies WorkspaceAnalysisReadModelFields<WorkAssignedResponseData>;

/** Accounts for every nested group field before the group is flattened. */
export const WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS = {
  plan: omit("nonScalar", "计划对象的公开标量字段直接规范化到 work.assigned-plan-groups 行。"),
  works: omit("derivedDuplicate", "当前公开服务中 works 是 assignedWorks 的兼容别名，不生成第二套事项行。"),
  assignedWorks: child("work.assigned-items", "计划组内实际分配给查看人的事项拆为一事项一行。"),
  assignedWorkIds: omit("derivedDuplicate", "分配事项 ID 可由 work.assigned-items 的 id 按 planId 聚合。"),
  arrangerEmployeeName: confidential("text", "安排人", "他人个人空间计划的安排人名称。"),
  assignerSpaceName: confidential("text", "分配空间", "部门或项目分配来源空间名称。"),
} satisfies WorkspaceAnalysisReadModelFields<PublicAssignedPlanGroup>;

export const WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS = {
  id: id("计划 ID", "工作计划稳定标识。"),
  targetType: field("text", "空间类型", "计划真实所属空间类型。"),
  targetId: id("空间 ID", "计划真实所属空间标识。"),
  kind: field("text", "计划类型", "okr 或 routine。"),
  title: confidential("text", "计划名称", "分配事项所属工作计划名称。"),
  description: narrative("计划说明", "分配事项所属工作计划说明。"),
  status: field("text", "状态", "计划 active 或 done 状态。"),
  isArchived: field("boolean", "已归档", "计划是否已归档。"),
  okrStage: field("text", "OKR 阶段", "公开 DTO 中的兼容治理阶段。"),
  maintenance: omit("controlPlane", "页面维护能力矩阵不是业务分析事实。"),
  governance: omit("controlPlane", "动态治理运行态不是稳定分析字段。"),
  objectiveSubmittedAt: field("date", "目标提交时间", "目标申报提交时间。"),
  objectiveApprovedAt: field("date", "目标确认时间", "目标申报确认时间。"),
  objectiveApprovedByUserId: id("目标确认人 ID", "目标确认用户标识。"),
  krReviewOpensAt: field("date", "结果开放时间", "KR 结果评审开放时间。"),
  krSubmittedAt: field("date", "结果提交时间", "KR 结果提交时间。"),
  krApprovedAt: field("date", "结果确认时间", "KR 结果确认时间。"),
  krApprovedByUserId: id("结果确认人 ID", "KR 结果确认用户标识。"),
  ownerEmployeeId: id("负责人 ID", "计划负责人员工标识。"),
  ownerEmployeeNumber: confidential("text", "负责人工号", "计划负责人业务工号。"),
  ownerEmployeeName: confidential("text", "负责人", "计划负责人姓名。"),
  collaborationId: id("部门协作 ID", "计划关联的 DepartmentCollaboration 标识；与 personal_collaboration 分配类型无关。"),
  collaborationTitle: confidential("text", "部门协作事项", "计划关联的 DepartmentCollaboration 标题。"),
  collaborationResponsibleDepartmentId: id("协作负责部门 ID", "部门协作负责部门标识。"),
  collaborationResponsibleDepartmentName: field("text", "协作负责部门", "部门协作负责部门名称。"),
  isSystemGenerated: field("boolean", "系统生成", "计划是否由周期系统生成。"),
  okrCycleId: id("周期 ID", "OKR 周期标识。"),
  okrCycleCode: field("text", "周期编码", "OKR 周期业务编码。"),
  okrCycleLabel: field("text", "周期", "OKR 周期名称。"),
  okrControlScopeType: field("text", "OKR 管控范围类型", "计划绑定的 OKR 管控范围类型。"),
  okrControlScopeId: field("text", "OKR 管控范围 ID", "计划绑定的 OKR 管控范围标识。"),
  governanceMode: field("text", "治理模式", "计划采用的治理模式。"),
  governanceRevision: id("治理修订号", "治理绑定的当前修订号。"),
  governanceActionKey: field("text", "治理动作键", "计划绑定的治理动作键。"),
  governanceWorkflowPolicyId: id("流程策略 ID", "治理流程策略标识。"),
  governanceWorkflowVersion: id("流程策略版本", "治理流程策略版本号。"),
  governanceActionContractVersion: id("动作契约版本", "动作契约版本号。"),
  governanceOkrControlVersion: id("OKR 管控版本", "OKR 管控配置版本号。"),
  governanceBindingSource: field("text", "治理绑定来源", "治理绑定来源类型。"),
  governanceBoundAt: field("date", "治理绑定时间", "治理绑定完成时间。"),
  sourcePlanId: id("来源计划 ID", "历史来源计划标识。"),
  sourcePlanTitle: confidential("text", "来源计划", "历史来源计划名称。"),
  sourcePlanCycleLabel: field("text", "来源计划周期", "历史来源计划所属周期。"),
  parentPeriodPlanId: id("上级周期计划 ID", "上级周期计划标识。"),
  parentPeriodPlanTitle: confidential("text", "上级周期计划", "上级周期计划名称。"),
  parentPeriodPlanCycleLabel: field("text", "上级计划周期", "上级周期计划所属周期。"),
  alignmentSourceType: field("text", "承接来源类型", "plan、objective 或 key_result。"),
  alignmentSourcePlanId: id("承接计划 ID", "承接来源计划标识。"),
  alignmentSourcePlanTitle: confidential("text", "承接计划", "承接来源计划名称。"),
  alignmentSourcePlanTargetType: field("text", "承接计划空间类型", "承接来源计划所属空间类型。"),
  alignmentSourcePlanTargetId: id("承接计划空间 ID", "承接来源计划所属空间标识。"),
  alignmentSourcePlanCycleLabel: field("text", "承接计划周期", "承接来源计划所属周期。"),
  alignmentSourceWorkItemId: id("承接节点 ID", "承接来源工作节点标识。"),
  alignmentSourceWorkItemContent: confidential("text", "承接节点", "承接来源工作节点内容。"),
  alignmentSourceWorkItemTargetType: field("text", "承接节点空间类型", "承接来源节点所属空间类型。"),
  alignmentSourceWorkItemTargetId: id("承接节点空间 ID", "承接来源节点所属空间标识。"),
  alignmentSourceWorkItemCycleLabel: field("text", "承接节点周期", "承接来源节点所属周期。"),
  alignmentSourceWorkItemPlanTitle: confidential("text", "承接节点计划", "承接来源节点所属计划。"),
  alignmentSourceWorkItemKrTargetValue: field("number", "承接 KR 目标值", "承接来源 KR 目标值。"),
  alignmentSourceWorkItemKrUnit: field("text", "承接 KR 单位", "承接来源 KR 计量单位。"),
  previousPeriodPlanId: id("前序计划 ID", "前一周期计划标识。"),
  previousPeriodPlanTitle: confidential("text", "前序计划", "前一周期计划名称。"),
  previousPeriodPlanCycleLabel: field("text", "前序计划周期", "前一周期计划所属周期。"),
  objectiveApprovalSnapshotJson: child("work.plan-approval-snapshot-values", "目标审批快照由规范化路径和值子读模型表达。"),
  krApprovalSnapshotJson: child("work.plan-approval-snapshot-values", "结果审批快照由规范化路径和值子读模型表达。"),
  periodType: field("text", "周期类型", "计划所属周期类型。"),
  actualStartDate: field("date", "实际开始", "计划实际开始日期。"),
  actualEndDate: field("date", "实际结束", "计划实际结束日期。"),
  plannedStartDate: field("date", "计划开始", "计划开始日期。"),
  plannedEndDate: field("date", "计划结束", "计划结束日期。"),
  isMilestone: field("boolean", "里程碑", "计划是否为里程碑。"),
  milestoneDate: field("date", "里程碑日期", "计划里程碑日期。"),
  sourceType: field("text", "来源类型", "计划兼容来源类型。"),
  sourceKind: field("text", "来源子类", "计划兼容来源子类。"),
  sourceMeetingId: id("来源会议 ID", "来源会议标识。"),
  sourceMeetingTitle: confidential("text", "来源会议", "来源会议标题。"),
  sourceMeetingStartAt: field("date", "来源会议日期", "来源会议开始日期。"),
  sourceMeetingDecisionId: id("来源决议 ID", "来源会议决议标识。"),
  sourceMeetingDecisionTitle: confidential("text", "来源决议", "来源会议决议标题。"),
  sourceMeetingDecisionKind: field("text", "决议类型", "来源会议决议类型。"),
  sourceMeetingActionCandidateId: id("行动建议 ID", "来源会议行动建议标识。"),
  sourceMeetingActionCandidateTitle: confidential("text", "行动建议", "来源会议行动建议标题。"),
  sourceDepartmentId: id("来源部门 ID", "来源部门标识。"),
  sourceDepartmentName: field("text", "来源部门", "来源部门名称。"),
  sourceDepartmentCode: field("text", "来源部门编码", "来源部门业务编码。"),
  linkedProjectId: id("关联项目 ID", "关联项目标识。"),
  linkedProjectName: confidential("text", "关联项目", "关联项目名称。"),
  linkedProjectCode: field("text", "项目编码", "关联项目业务编码。"),
  linkedProjectPhaseId: id("项目阶段 ID", "关联项目阶段标识。"),
  linkedProjectPhaseName: confidential("text", "项目阶段", "关联项目阶段名称。"),
  itemCount: field("integer", "节点数", "计划直属节点数量。"),
  itemStatusCounts: omit("derivedDuplicate", "状态汇总可从 work.assigned-items 按计划聚合。"),
  sortOrder: field("integer", "排序", "计划排序值。"),
  createdAt: field("date", "创建时间", "计划创建时间。"),
  updatedAt: field("date", "更新时间", "计划最后更新时间。"),
} satisfies WorkspaceAnalysisReadModelFields<PublicAssignedPlan>;

export const WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS = {
  id: id("节点 ID", "工作节点稳定标识。"),
  planId: id("计划 ID", "所属工作计划标识。"),
  targetType: field("text", "空间类型", "节点真实所属空间类型。"),
  targetId: id("空间 ID", "节点真实所属空间标识。"),
  category: field("text", "类别", "routine 或 non-routine。"),
  itemType: field("text", "节点类型", "objective、key_result 或 task。"),
  content: confidential("text", "内容", "工作节点标题或主要内容。"),
  description: narrative("说明", "工作节点补充说明。"),
  importance: field("integer", "重要度", "工作节点重要度。", { capabilities: { groupable: true } }),
  urgency: field("integer", "紧急度", "工作节点紧急度。", { capabilities: { groupable: true } }),
  status: field("text", "状态", "active、paused 或 done。"),
  krStartValue: field("number", "KR 起始值", "关键结果起始值。"),
  krTargetValue: field("number", "KR 目标值", "关键结果目标值。"),
  krCurrentValue: field("number", "KR 当前值", "关键结果当前值。"),
  krUnit: field("text", "KR 单位", "关键结果计量单位。"),
  routineTaskType: field("text", "日常任务类型", "standing 或 task。"),
  routineRecurrenceType: field("text", "重复类型", "日、周、月、季度或年度重复规则。"),
  routineRecurrenceTime: field("text", "重复时间", "日常任务的重复执行时间。"),
  routineRecurrenceWeekday: field("integer", "周几", "周重复规则中的星期序号。"),
  routineRecurrenceMonthDay: field("integer", "月内日期", "月重复规则中的日期。"),
  routineRecurrenceQuarterDay: field("integer", "季内日期", "季度重复规则中的日期。"),
  routineRecurrenceYearMonth: field("integer", "年度月份", "年度重复规则中的月份。"),
  routineRecurrenceYearDay: field("integer", "年度日期", "年度重复规则中的日期。"),
  ownerEmployeeId: id("负责人 ID", "负责人员工主键。"),
  ownerEmployeeNumber: confidential("text", "负责人工号", "负责人业务工号。"),
  ownerEmployeeName: confidential("text", "负责人", "负责人姓名。"),
  collaborationId: id("部门协作 ID", "工作节点关联的 DepartmentCollaboration 标识；与 personal_collaboration 分配类型无关。"),
  collaborationTitle: confidential("text", "部门协作事项", "工作节点关联的 DepartmentCollaboration 标题。"),
  collaborationResponsibleDepartmentId: id("协作负责部门 ID", "部门协作负责部门标识。"),
  collaborationResponsibleDepartmentName: field("text", "协作负责部门", "部门协作负责部门名称。"),
  actualStartDate: field("date", "实际开始", "实际开始日期。"),
  actualEndDate: field("date", "实际结束", "实际结束日期。"),
  plannedStartDate: field("date", "计划开始", "计划开始日期。"),
  plannedEndDate: field("date", "计划结束", "计划结束日期。"),
  isMilestone: field("boolean", "里程碑", "是否为里程碑节点。"),
  milestoneDate: field("date", "里程碑日期", "里程碑目标日期。"),
  completedAt: field("date", "完成时间", "节点完成时间。"),
  periodType: field("text", "周期类型", "节点所属周期类型。"),
  periodStart: field("date", "周期开始", "节点所属周期开始日期。"),
  periodEnd: field("date", "周期结束", "节点所属周期结束日期。"),
  sourceType: field("text", "来源类型", "department、project、meeting 或 other。"),
  sourceKind: field("text", "来源子类", "来源的业务子类型。"),
  sourceMeetingId: id("来源会议 ID", "来源会议标识。"),
  sourceMeetingTitle: confidential("text", "来源会议", "来源会议标题。"),
  sourceMeetingStartAt: field("date", "来源会议日期", "来源会议开始日期。"),
  sourceMeetingDecisionId: id("来源决议 ID", "来源会议决议标识。"),
  sourceMeetingDecisionTitle: confidential("text", "来源决议", "来源会议决议标题。"),
  sourceMeetingDecisionKind: field("text", "决议类型", "来源会议决议类型。"),
  sourceMeetingActionCandidateId: id("行动建议 ID", "来源会议行动建议标识。"),
  sourceMeetingActionCandidateTitle: confidential("text", "行动建议", "来源会议行动建议标题。"),
  sourceDepartmentId: id("来源部门 ID", "来源部门标识。"),
  sourceDepartmentName: field("text", "来源部门", "来源部门名称。"),
  sourceDepartmentCode: field("text", "来源部门编码", "来源部门业务编码。"),
  linkedProjectId: id("关联项目 ID", "关联项目标识。"),
  linkedProjectName: confidential("text", "关联项目", "关联项目名称。"),
  linkedProjectCode: field("text", "项目编码", "关联项目业务编码。"),
  linkedProjectPhaseId: id("项目阶段 ID", "关联项目阶段标识。"),
  linkedProjectPhaseName: confidential("text", "项目阶段", "关联项目阶段名称。"),
  parentWorkItemId: id("父节点 ID", "同计划父工作节点标识。"),
  parentWorkItemContent: confidential("text", "父节点", "同计划父工作节点内容。"),
  parentPeriodWorkItemId: id("上期父节点 ID", "跨周期父工作节点标识。"),
  parentPeriodWorkItemContent: confidential("text", "上期父节点", "跨周期父工作节点内容。"),
  parentPeriodWorkItemType: field("text", "上期父节点类型", "跨周期父节点的节点类型。"),
  parentPeriodWorkItemCycleLabel: field("text", "上期父节点周期", "跨周期父节点所属周期。"),
  parentPeriodWorkItemTargetType: field("text", "上期父节点空间类型", "跨周期父节点所属空间类型。"),
  parentPeriodWorkItemTargetId: id("上期父节点空间 ID", "跨周期父节点所属空间标识。"),
  parentPeriodWorkItemKrTargetValue: field("number", "上期 KR 目标值", "跨周期父 KR 目标值。"),
  parentPeriodWorkItemKrCurrentValue: field("number", "上期 KR 当前值", "跨周期父 KR 当前值。"),
  parentPeriodWorkItemKrUnit: field("text", "上期 KR 单位", "跨周期父 KR 计量单位。"),
  previousPeriodWorkItemId: id("前序节点 ID", "前一周期工作节点标识。"),
  previousPeriodWorkItemContent: confidential("text", "前序节点", "前一周期工作节点内容。"),
  previousPeriodWorkItemCycleLabel: field("text", "前序节点周期", "前一周期工作节点所属周期。"),
  responsibilityReferenceId: id("职责引用 ID", "执行职责引用标识。"),
  responsibilityNodeId: id("职责节点 ID", "岗位职责节点标识。"),
  responsibilityLabel: confidential("text", "关联职责", "执行职责展示名称。"),
  responsibilityPathLabel: confidential("text", "职责路径", "执行职责层级路径。"),
  responsibilityTitle: confidential("text", "职责标题", "执行职责标题快照。"),
  responsibilityContent: narrative("职责内容", "执行职责内容快照。"),
  responsibilityLockedEmployeeId: id("职责员工 ID", "职责引用锁定的员工标识。"),
  responsibilityPositionId: id("职责岗位 ID", "职责引用锁定的岗位标识。"),
  responsibilityPositionName: confidential("text", "职责岗位", "职责引用锁定的岗位名称。"),
  evidenceTaskIds: omit("derivedDuplicate", "证据任务 ID 已由证据明细关系表达。"),
  evidenceTasks: child("work.item-evidence", "KR 证据为一对多关系，拆到稳定证据明细源。"),
  isArchived: field("boolean", "已归档", "节点是否已归档。"),
  isPrivate: field("boolean", "私密标记", "节点在公开 DTO 中的私密标记。", { sensitivity: "confidential" }),
  participants: child("work.item-participants", "参与人为一对多关系，拆到稳定参与人明细源。"),
  sortOrder: field("integer", "排序", "节点在同级中的排序值。"),
  createdAt: field("date", "创建时间", "节点创建时间。"),
} satisfies WorkspaceAnalysisReadModelFields<PublicAssignedItem>;

export const WORK_ASSIGNED_PLAN_GROUPS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkAssignedPlanGroupAnalysisRow>()({
  sourceKey: "work.assigned-plan-groups",
  version: 1,
  label: "我的承接计划组",
  description: "以当前查看人原承接页可见的一条计划组为粒度，区分部门/项目承接和他人个人空间协作，不把查看结果归属到当前页面空间。",
  apiPath: "/api/modules/work/tasks/assigned",
  rowsPath: "planGroups",
  totalPath: "planGroups.length",
  scopes: VIEWER_SCOPES,
  fields: {
    assignmentKind: field("text", "分配类型", "department_or_project 或 personal_collaboration。"),
    ...WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS,
    arrangerEmployeeName: confidential("text", "安排人", "他人个人空间计划的安排人名称。"),
    assignerSpaceName: confidential("text", "分配空间", "部门或项目分配来源空间名称。"),
  },
  pagination: ASSIGNED_PAGINATION,
  limits: ASSIGNED_LIMITS,
});

export const WORK_ASSIGNED_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkAssignedItemAnalysisRow>()({
  sourceKey: "work.assigned-items",
  version: 1,
  label: "我的承接事项",
  description: "以当前查看人实际负责的一条公开 WorkItem 为粒度，保留原承接页的查看人范围和真实来源空间。",
  apiPath: "/api/modules/work/tasks/assigned",
  rowsPath: "planGroups.assignedWorks",
  totalPath: "planGroups.assignedWorks.length",
  scopes: VIEWER_SCOPES,
  fields: {
    assignmentKind: field("text", "分配类型", "department_or_project 或 personal_collaboration。"),
    assignedPlanTitle: confidential("text", "所属计划", "分配事项所属计划名称。"),
    assignedPlanKind: field("text", "所属计划类型", "分配事项所属计划的 okr 或 routine 类型。"),
    arrangerEmployeeName: confidential("text", "安排人", "他人个人空间计划的安排人名称。"),
    assignerSpaceName: confidential("text", "分配空间", "部门或项目分配来源空间名称。"),
    ...WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS,
  },
  pagination: ASSIGNED_PAGINATION,
  limits: ASSIGNED_LIMITS,
});

export const WORK_ASSIGNED_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_ASSIGNED_PLAN_GROUPS_ANALYSIS_SOURCE,
  WORK_ASSIGNED_ITEMS_ANALYSIS_SOURCE,
] as const;

export function *iterateWorkAssignedPlanGroupAnalysisRows(
  data: WorkAssignedResponseData,
): Generator<WorkAssignedPlanGroupAnalysisRow> {
  for (const [assignmentKind, groups] of assignedGroupSets(data)) {
    for (const group of groups) {
      yield {
        assignmentKind,
        ...group.plan,
        arrangerEmployeeName: group.arrangerEmployeeName ?? null,
        assignerSpaceName: group.assignerSpaceName ?? null,
      };
    }
  }
}

export function *iterateWorkAssignedItemAnalysisRows(
  data: WorkAssignedResponseData,
): Generator<WorkAssignedItemAnalysisRow> {
  for (const [assignmentKind, groups] of assignedGroupSets(data)) {
    for (const group of groups) {
      for (const item of group.assignedWorks) {
        yield {
          assignmentKind,
          assignedPlanTitle: group.plan.title,
          assignedPlanKind: group.plan.kind,
          arrangerEmployeeName: group.arrangerEmployeeName ?? null,
          assignerSpaceName: group.assignerSpaceName ?? null,
          ...item,
        };
      }
    }
  }
}

function assignedGroupSets(data: WorkAssignedResponseData) {
  return [
    ["department_or_project", data.planGroups],
    ["personal_collaboration", data.collaborationPlanGroups],
  ] as const satisfies readonly (readonly [WorkAssignmentKind, readonly PublicAssignedPlanGroup[]])[];
}
