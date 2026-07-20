/* eslint-disable max-lines */
import {
  listRequests,
  type ApprovalAdapter,
  type ApprovalHandlerSource,
  type ApprovalOperation,
  type ApprovalRequestDto,
  type ApprovalRequestRecord,
  type ApprovalStatus,
} from "@workspace/platform/server/approvals";
import { bindApprovalLifecycle } from "@workspace/platform/server/approval-lifecycle";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { selectVisiblePeriods } from "@workspace/core/period";
import { checkHRRead, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { listDirectManagerUserIds } from "@workspace/platform/server/business-space-natural-users";
import { resolveWorkflowNodeHandlerUserIds } from "@workspace/platform/server/approvals/workflow-node-handlers";
import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { resolveWorkflowPolicy, type WorkflowPolicyNodeDefinition } from "@workspace/platform/server/workflows";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { assertBusinessActionWorkflowDisabledFallbackAllowed } from "@workspace/platform/server/business-action-executor";
import { buildHrPerformanceReviewArchiveCommand } from "./domain/performance-validation";
import { buildEmployeeContributionSnapshot, listEmployeeContributionRows } from "./performance-contributions";
import {
  getHrPerformanceEmployeeIdentity,
  loadHrPerformanceAudienceCatalog,
  resolveHrPerformanceDashboardProjection,
  selectHrPerformanceAudience,
  type HrPerformanceAudienceEmployee,
  type HrPerformanceAudienceType,
  type HrPerformanceDashboardView,
} from "./performance-audience";
import {
  canReadHrPerformanceEmployee,
  canReadHrPerformanceSummary,
  hrPerformanceSubmissionSubmitterScope,
} from "./performance-access";

export type HrPerformanceReviewPayload = {
  entityType: "performance_review";
  employeeId: number;
  okrCycleId: number;
  data: {
    selfScore: number | null;
    selfComment: string;
    managerScore: number | null;
    managerComment: string;
    finalScore: number | null;
    finalGrade: string;
    hrComment: string;
  };
};

type HrPerformanceDashboardQuery = {
  view?: HrPerformanceDashboardView | null;
  cycleId?: number | null;
  periodType?: string | null;
  audienceType?: string | null;
  audienceId?: number | null;
  keyword?: string | null;
  status?: string | null;
};

type PerformanceAudience = HrPerformanceAudienceType;
type PerformancePeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";

type HrPerformanceSubmissionBody = {
  employeeId?: number | null;
  okrCycleId?: number | null;
  payload?: Record<string, unknown> | null;
  comment?: string | null;
};

type HrPerformanceSubmissionActionBody = {
  payload?: Record<string, unknown> | null;
  comment?: string | null;
  version?: number | null;
};

type HrPerformanceSubmissionsQuery = {
  view?: HrPerformanceDashboardView | null;
  status?: string | null;
};

const HR_PERFORMANCE_RESOURCE_KEY = "hr.performance";
const HR_PERFORMANCE_APPROVAL_SUBJECT = "hr.performance.review";
const HR_PERFORMANCE_BUSINESS_ACTION_KEY = "hr.performance.review.evaluate";
const HR_PERFORMANCE_GRADES = ["S", "A", "B", "C", "D"] as const;
const HR_PERFORMANCE_PERIOD_TYPES: PerformancePeriodType[] = ["yearly", "half_year", "quarterly", "monthly", "weekly"];
const HR_PERFORMANCE_DEFAULT_WORKFLOW_NODES: WorkflowPolicyNodeDefinition[] = [
  {
    key: "direct-manager-review",
    kind: "approval",
    assignees: [{ fieldKind: "relationship", value: "direct_manager" }],
    approvalMode: "any_one",
  },
  {
    key: "hr-final-review",
    kind: "approval",
    assignees: [{ fieldKind: "relationship", value: "permission" }],
    approvalMode: "any_one",
  },
];

export async function commitHrPerformanceApprovedPayload(input: {
  actorUserId: number;
  request: ApprovalRequestRecord<HrPerformanceReviewPayload>;
}) {
  const { actorUserId, request } = input;
  if (!(await canApproveHrPerformance(actorUserId))) return serviceError("无权限归档绩效记录", 403);
  const payload = request.latestPayload;
  const snapshot = await buildEmployeeWorkEvidenceSnapshot(payload.employeeId, payload.okrCycleId);
  const command = await buildHrPerformanceReviewArchiveCommand({
    employeeId: payload.employeeId,
    okrCycleId: payload.okrCycleId,
    approvalRequestId: request.id,
    selfScore: payload.data.selfScore,
    selfComment: payload.data.selfComment,
    managerScore: payload.data.managerScore,
    managerComment: payload.data.managerComment,
    finalScore: payload.data.finalScore,
    finalGrade: payload.data.finalGrade,
    hrComment: payload.data.hrComment,
    workEvidenceSnapshotJson: JSON.stringify(snapshot),
    archivedByUserId: actorUserId,
  });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const review = await prisma.hrPerformanceReview.create(command.data);
  return serviceOk({ entityType: "hr.performance.review", entityId: review.id });
}

export const hrPerformanceApprovalAdapter: ApprovalAdapter<HrPerformanceReviewPayload> = {
  subjectType: HR_PERFORMANCE_APPROVAL_SUBJECT,
  workflowDefaults: () => ({
    businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
    scopeType: "global",
    mode: "required",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    handlerSource: "direct_manager",
    handlerCanRevise: true,
    requestCanWithdraw: true,
    requestCanResubmit: true,
    requestCanCancel: true,
    requestCanRevise: true,
    workflowNodes: HR_PERFORMANCE_DEFAULT_WORKFLOW_NODES,
  }),
  validatePayload: async ({ actorUserId, operation, subjectId, payload, request }) =>
    validateHrPerformancePayload({ actorUserId, operation, subjectId, payload, request }),
  resolveAccess: async ({ actorUserId, action, prepared, request }) => {
    if (action === "listRequests") {
      return checkHRRead(actorUserId, HR_PERFORMANCE_RESOURCE_KEY);
    }
    if (action === "createDraft") {
      return Boolean(prepared && await canSubmitHrPerformance(actorUserId) && await isSelfPerformancePayload(actorUserId, prepared.payload));
    }
    if (action === "approve" || action === "reject" || action === "reviewUpdate") {
      return Boolean(request && await canProcessHrPerformanceRequest(actorUserId, request));
    }
    if (action === "comment") {
      return Boolean(request && (
        request.submitterUserId === actorUserId ||
        await canProcessHrPerformanceRequest(actorUserId, request)
      ));
    }
    return false;
  },
  resolveHandlers: async ({ handlerSource, request }) =>
    resolveHrPerformanceHandlerUserIds(handlerSource, request),
  resolveRecipients: async ({ eventType, actorUserId, request }) => {
    if (eventType === "submit") return resolveHrPerformanceHandlerUserIds(request.handlerSource, request, actorUserId);
    if (eventType === "approve" || eventType === "reject" || eventType === "review") return [request.submitterUserId];
    if (eventType === "comment") {
      if (actorUserId === request.submitterUserId) return resolveHrPerformanceHandlerUserIds(request.handlerSource, request, actorUserId);
      return [request.submitterUserId];
    }
    return [];
  },
  describeRequest: async ({ request }) => {
    const [employee, cycle] = await Promise.all([
      prisma.employee.findUnique({ where: { id: request.latestPayload.employeeId }, select: { name: true, employeeId: true } }),
      prisma.workOkrCycle.findUnique({ where: { id: request.latestPayload.okrCycleId }, select: { label: true, code: true } }),
    ]);
    const employeeLabel = employee ? `${employee.name}(${employee.employeeId})` : `员工 #${request.latestPayload.employeeId}`;
    const cycleLabel = cycle?.label || cycle?.code || `周期 #${request.latestPayload.okrCycleId}`;
    return {
      title: "绩效评审流程",
      summary: `${employeeLabel} · ${cycleLabel}`,
      href: `/work/performance?workflowId=${request.id}`,
    };
  },
  commitApprovedPayload: commitHrPerformanceApprovedPayload,
};

const hrPerformanceApprovalLifecycle = bindApprovalLifecycle(hrPerformanceApprovalAdapter);

export function buildListHrPerformanceDashboardRouteCommand(input: {
  userId: number;
  query: HrPerformanceDashboardQuery;
}) {
  return okCommand({
    userId: input.userId,
    view: input.query.view ?? null,
    cycleId: positiveNumber(input.query.cycleId),
    periodType: normalizePerformancePeriodType(input.query.periodType),
    audienceType: normalizePerformanceAudience(input.query.audienceType),
    audienceId: positiveNumber(input.query.audienceId),
    keyword: String(input.query.keyword || "").trim(),
    status: String(input.query.status || "").trim(),
  });
}

export async function executeListHrPerformanceDashboardRouteCommand(command: {
  userId: number;
  view?: HrPerformanceDashboardView | null;
  cycleId?: number | null;
  periodType?: PerformancePeriodType | null;
  audienceType?: PerformanceAudience | null;
  audienceId?: number | null;
  keyword?: string;
  status?: string;
}) {
  const [hasEffectiveRead, canReadSummary, currentEmployee] = await Promise.all([
    checkHRRead(command.userId, HR_PERFORMANCE_RESOURCE_KEY),
    canReadHrPerformanceSummary(command.userId),
    prisma.employee.findFirst({
      where: { userId: command.userId, employments: { some: { isActive: true } } },
      select: { id: true, employeeId: true, name: true, userId: true },
    }),
  ]);
  if (!hasEffectiveRead) return serviceError("无权限查看绩效工作台", 403);
  const dashboardProjection = resolveHrPerformanceDashboardProjection({
    requestedView: command.view ?? null,
    canReadSummary,
    currentEmployeeId: currentEmployee?.id ?? null,
    requestedAudienceType: command.audienceType ?? null,
    requestedAudienceId: command.audienceId ?? null,
  });
  if (!dashboardProjection.ok) {
    if (dashboardProjection.reason === "self_identity_missing") return serviceError("当前账号未关联在职员工，无法查看个人绩效", 403);
    if (dashboardProjection.reason === "summary_forbidden") return serviceError("无权限查看绩效汇总", 403);
    return serviceError("无权限查看其他员工或组织绩效", 403);
  }
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const cycleCandidates = await prisma.workOkrCycle.findMany({
    where: {
      periodType: { in: HR_PERFORMANCE_PERIOD_TYPES },
      year: { in: [currentYear - 1, currentYear, currentYear + 1] },
    },
    select: { id: true, code: true, label: true, periodType: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "desc" }, { sequence: "desc" }],
  });
  const cycleOptions = HR_PERFORMANCE_PERIOD_TYPES.flatMap((periodType) => selectVisiblePeriods(
    cycleCandidates
      .filter((cycle) => cycle.periodType === periodType)
      .map((cycle) => ({
        ...cycle,
        periodType,
        startDate: cycle.startDate.toISOString().slice(0, 10),
        endDate: cycle.endDate.toISOString().slice(0, 10),
      })),
    { today },
  ));
  const requestedCycle = command.cycleId
    ? cycleOptions.find((cycle) => cycle.id === command.cycleId) ?? null
    : null;
  const requestedPeriodType = requestedCycle?.periodType ?? command.periodType ?? "monthly";
  const activeCycleOption = requestedCycle
    ?? cycleOptions.find((cycle) => cycle.periodType === requestedPeriodType && cycle.startDate <= today && cycle.endDate >= today)
    ?? cycleOptions.find((cycle) => cycle.periodType === requestedPeriodType)
    ?? null;
  const activeCycle = activeCycleOption
    ? cycleCandidates.find((cycle) => cycle.id === activeCycleOption.id) ?? null
    : null;
  const cycleId = activeCycle?.id ?? null;
  const projectedEmployeeIds = dashboardProjection.employeeIds ? [...dashboardProjection.employeeIds] : null;
  const workPlanScopeWhere: Prisma.WorkPlanWhereInput = dashboardProjection.view === "self"
    ? {
        OR: [
          { ownerEmployeeId: dashboardProjection.audienceId ?? -1 },
          { targetType: "personal", targetId: command.userId },
        ],
      }
    : {};
  const [audienceCatalog, reviews, submissions, workPlans, workflowPolicy, canStartWorkflow] = await Promise.all([
    loadHrPerformanceAudienceCatalog({
      employeeIds: projectedEmployeeIds,
      includeDirectories: dashboardProjection.view === "summary",
    }),
    cycleId ? prisma.hrPerformanceReview.findMany({
      where: {
        okrCycleId: cycleId,
        ...(projectedEmployeeIds ? { employeeId: { in: projectedEmployeeIds } } : {}),
      },
      include: { employee: true },
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
    }) : Promise.resolve([]),
    listRequests({
      adapter: hrPerformanceApprovalAdapter,
      actorUserId: command.userId,
      resourceKey: HR_PERFORMANCE_RESOURCE_KEY,
      scopeId: null,
      submitterUserId: hrPerformanceSubmissionSubmitterScope(dashboardProjection.view, command.userId),
      statuses: normalizeStatusFilter(command.status),
    }).then((result) => result.ok ? result.data.requests : []),
    activeCycle ? prisma.workPlan.findMany({
      where: {
        isArchived: false,
        AND: [
          { OR: [
            { kind: "okr", actualStartDate: { lte: activeCycle.endDate }, actualEndDate: { gte: activeCycle.startDate } },
            { kind: "routine" },
          ] },
          workPlanScopeWhere,
        ],
      },
      include: {
        owner: true,
        items: { where: { isArchived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ targetType: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
    resolveHrPerformanceWorkflowPolicy(command.userId),
    canSubmitHrPerformance(command.userId),
  ]);
  const { employees, departments, projects } = audienceCatalog;
  const audienceSelection = selectHrPerformanceAudience({
    audienceType: dashboardProjection.audienceType,
    audienceId: dashboardProjection.audienceId,
    catalog: audienceCatalog,
    today,
  });
  if (!audienceSelection.ok) return serviceError("所选查看范围不存在、已停用或类型不完整", 404);
  const scopedEmployeeIds = audienceSelection.employeeIds;
  const scopedEmployees = scopedEmployeeIds
    ? employees.filter((employee) => scopedEmployeeIds.has(employee.id))
    : employees;
  const keyword = command.keyword || "";
  const allEmployeeRows = employees.map((employee) => toAttendanceRow(employee));
  const employeeRows = scopedEmployees
    .map((employee) => toAttendanceRow(employee))
    .filter((row) => matchAnyField(row as unknown as Record<string, unknown>, keyword));
  const visibleEmployeeIds = new Set(employeeRows.map((row) => row.id));
  const contributionRows = activeCycle ? (await listEmployeeContributionRows({
    employeeIds: scopedEmployees.map((employee) => employee.id),
    cycle: activeCycle,
    employeeNameById: new Map(employees.map((employee) => [employee.id, employee.name])),
  })).filter((row) => matchAnyField(row as unknown as Record<string, unknown>, keyword)) : [];
  const workRows = workPlans
    .map((plan) => toWorkSourceRow(plan))
    .filter((row) => row.employeeId === null || visibleEmployeeIds.has(row.employeeId))
    .filter((row) => matchAnyField(row as unknown as Record<string, unknown>, keyword));
  const reviewRows = reviews
    .map((review) => toReviewRow(review))
    .filter((row) => visibleEmployeeIds.has(row.employeeId))
    .filter((row) => matchAnyField(row as unknown as Record<string, unknown>, keyword));
  const submissionRows = submissions
    .map((request) => toSubmissionRow(request, command.userId))
    .filter((row) => !cycleId || row.okrCycleId === cycleId)
    .filter((row) => visibleEmployeeIds.has(row.employeeId))
    .filter((row) => !command.status || command.status.split(",").includes(row.status))
    .filter((row) => matchAnyField(row as unknown as Record<string, unknown>, keyword));
  const departmentContributionRows = departments
    .filter((department) => dashboardProjection.audienceType !== "department" || !dashboardProjection.audienceId || department.id === dashboardProjection.audienceId)
    .map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      hierarchy: `${department.hierarchyKind}${department.level}`,
      parentName: department.parent?.name || "",
      status: "现用",
    }));
  const projectContributionRows = projects
    .filter((project) => dashboardProjection.audienceType !== "project" || !dashboardProjection.audienceId || project.id === dashboardProjection.audienceId)
    .map((project) => ({
      id: project.id,
      code: project.code || "",
      name: project.name,
      projectType: project.projectType,
      projectLevel: project.projectLevel,
      leadingDepartment: project.leadingDepartment?.name || "",
      status: "开启",
    }));
  return serviceOk({
    createRuntime: resolveActionRuntime({
      businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
      workflowPolicyMode: workflowPolicy.mode,
      workflowWhenDisabled: "unavailable",
      actor: { userId: command.userId, canStartWorkflow },
    }),
    currentEmployee,
    cycleOptions,
    activeCycleId: cycleId,
    audienceOptions: {
      personal: allEmployeeRows.map((employee) => ({
        id: employee.id,
        name: employee.name,
        details: [employee.employeeId, employee.department, employee.position].filter(Boolean).join(" · "),
      })),
      department: departments.map((department) => ({
        id: department.id,
        name: department.name,
        details: department.code,
      })),
      project: projects.map((project) => ({
        id: project.id,
        name: project.name,
        details: project.code || undefined,
      })),
    },
    contributionDirectories: {
      department: departmentContributionRows,
      project: projectContributionRows,
    },
    attendanceRows: employeeRows,
    workRows,
    contributionRows,
    reviewRows,
    submissionRows,
    metrics: {
      activeEmployeeCount: employeeRows.length,
      workPlanCount: workRows.length,
      contributionCount: new Set(contributionRows.map((row) => row.employeeId)).size,
      reviewCount: reviewRows.length,
      submittedFlowCount: submissionRows.filter((row) => row.status === "submitted").length,
      draftFlowCount: submissionRows.filter((row) => row.status === "draft").length,
    },
  });
}

export async function executeGetHrPerformanceReviewRouteCommand(command: {
  userId: number;
  reviewId: number;
}) {
  if (!(await checkHRRead(command.userId, HR_PERFORMANCE_RESOURCE_KEY))) return serviceError("无权限查看绩效记录", 403);
  const review = await prisma.hrPerformanceReview.findUnique({
    where: { id: command.reviewId },
    include: { employee: true },
  });
  if (!review) return serviceError("绩效记录不存在", 404);
  if (!(await canReadHrPerformanceEmployee(command.userId, review.employee.userId))) {
    return serviceError("无权限查看该绩效记录", 403);
  }
  return serviceOk({ review: toReviewDetail(review) });
}

export function buildListHrPerformanceSubmissionsRouteCommand(input: {
  userId: number;
  query: HrPerformanceSubmissionsQuery;
}): DomainValidationResult<{
  userId: number;
  view: HrPerformanceDashboardView;
  statuses?: ApprovalStatus[];
}> {
  return okCommand({
    userId: input.userId,
    view: input.query.view === "summary" ? "summary" as const : "self" as const,
    statuses: normalizeStatusFilter(input.query.status),
  });
}

export async function executeListHrPerformanceSubmissionsRouteCommand(command: {
  userId: number;
  view: HrPerformanceDashboardView;
  statuses?: ApprovalStatus[];
}) {
  if (command.view === "summary" && !(await canReadHrPerformanceSummary(command.userId))) {
    return serviceError("无权限查看绩效流程汇总", 403);
  }
  return listRequests({
    adapter: hrPerformanceApprovalAdapter,
    actorUserId: command.userId,
    resourceKey: HR_PERFORMANCE_RESOURCE_KEY,
    scopeId: null,
    submitterUserId: hrPerformanceSubmissionSubmitterScope(command.view, command.userId),
    statuses: command.statuses,
  });
}

export function buildCreateHrPerformanceSubmissionRouteCommand(input: {
  userId: number;
  body: HrPerformanceSubmissionBody;
}) {
  const employeeId = positiveNumber(input.body.employeeId);
  const okrCycleId = positiveNumber(input.body.okrCycleId);
  if (!employeeId) return failCommand("员工 ID 无效", 400, "employeeId");
  if (!okrCycleId) return failCommand("绩效周期无效", 400, "okrCycleId");
  return okCommand({
    actorUserId: input.userId,
    operation: "create" as const,
    subjectId: `${employeeId}:${okrCycleId}`,
    payload: normalizeReviewPayloadSeed({
      entityType: "performance_review",
      employeeId,
      okrCycleId,
      data: input.body.payload || {},
    }),
    comment: input.body.comment ?? null,
  });
}

export async function executeCreateHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: HrPerformanceReviewPayload;
  comment?: string | null;
}) {
  const workflowPolicy = await resolveHrPerformanceWorkflowPolicy(command.actorUserId);
  if (workflowPolicy.mode === "direct" || workflowPolicy.mode === "permission_only") {
    return assertBusinessActionWorkflowDisabledFallbackAllowed({
      businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
      blockedMessage: "绩效评审流程已关闭",
    });
  }
  return hrPerformanceApprovalLifecycle.createDraft(command);
}

function resolveHrPerformanceWorkflowPolicy(actorUserId: number) {
  return resolveWorkflowPolicy({
    businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
    resourceKey: HR_PERFORMANCE_RESOURCE_KEY,
    scopeType: "global",
    actorUserId,
    defaults: {
      businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
      scopeType: "global",
      mode: "required",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "direct_manager",
      workflowNodes: HR_PERFORMANCE_DEFAULT_WORKFLOW_NODES,
    },
  });
}

export function buildHrPerformanceSubmissionActionRouteCommand(input: {
  userId: number;
  requestId: number;
  body?: HrPerformanceSubmissionActionBody;
}) {
  return okCommand({
    actorUserId: input.userId,
    requestId: input.requestId,
    payload: input.body?.payload,
    comment: input.body?.comment ?? null,
    expectedVersion: input.body?.version ?? null,
  });
}

export async function executeReviseHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  payload?: Record<string, unknown> | null;
  comment?: string | null;
  expectedVersion?: number | null;
}) {
  return hrPerformanceApprovalLifecycle.revise(command, mergeHrPerformanceSubmissionPayload);
}

export function executeSubmitHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.submit(command);
}

export function executeWithdrawHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.withdraw(command);
}

export function executeCancelHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.cancel(command);
}

export function executeCommentHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.comment(command);
}

export function executeApproveHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.approve(command);
}

export function executeRejectHrPerformanceSubmissionRouteCommand(command: {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
}) {
  return hrPerformanceApprovalLifecycle.reject(command);
}

export async function validateHrPerformancePayload(input: {
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: unknown;
  request?: ApprovalRequestRecord<HrPerformanceReviewPayload>;
}) {
  if (input.operation !== "create") return serviceError("已归档绩效记录暂不支持修订流程", 409);
  const normalized = normalizeReviewPayloadSeed(input.payload);
  if (!normalized.employeeId || !normalized.okrCycleId) return serviceError("绩效流程缺少员工或周期", 400);
  if (input.request) {
    const expectedSubjectId = `${normalized.employeeId}:${normalized.okrCycleId}`;
    if (input.request.subjectId && input.request.subjectId !== expectedSubjectId) return serviceError("流程员工或周期不能变更", 400);
  }
  const [employee, cycle, duplicate] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: normalized.employeeId },
      select: { id: true, employeeId: true, name: true, userId: true, employments: { where: { isActive: true }, select: { id: true }, take: 1 } },
    }),
    prisma.workOkrCycle.findUnique({ where: { id: normalized.okrCycleId }, select: { id: true } }),
    prisma.hrPerformanceReview.findUnique({
      where: { employeeId_okrCycleId: { employeeId: normalized.employeeId, okrCycleId: normalized.okrCycleId } },
      select: { id: true },
    }),
  ]);
  if (!employee) return serviceError("员工不存在", 404);
  if (!employee.userId) return serviceError("员工未绑定登录用户，不能发起自评", 400);
  if (employee.employments.length === 0) return serviceError("仅在职员工可发起绩效流程", 400);
  if (!cycle) return serviceError("OKR 周期不存在", 404);
  if (duplicate) return serviceError("该员工在当前周期已有正式绩效记录", 409);
  const stage = resolvePerformanceEditStage(input.request);
  const payload = lockPayloadByStage({
    actorUserId: input.actorUserId,
    employeeUserId: employee.userId,
    stage,
    previous: input.request?.latestPayload ?? null,
    next: normalized,
  });
  if (!payload.ok) return payload;
  return serviceOk({
    resourceKey: HR_PERFORMANCE_RESOURCE_KEY,
    scopeId: null,
    subjectId: `${payload.data.employeeId}:${payload.data.okrCycleId}`,
    businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
    workflowScopeType: "global",
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    workflowMode: "required" as const,
    workflowHandlerSource: "direct_manager" as const,
    workflowHandlerCanRevise: true,
    workflowRequestCanWithdraw: true,
    workflowRequestCanResubmit: true,
    workflowRequestCanCancel: true,
    workflowRequestCanRevise: true,
    payload: payload.data,
  });
}

function normalizeReviewPayloadSeed(payload: unknown): HrPerformanceReviewPayload {
  const input = payload && typeof payload === "object" ? payload as Partial<HrPerformanceReviewPayload> & { data?: unknown } : {};
  const data = input.data && typeof input.data === "object" ? input.data as Record<string, unknown> : {};
  return {
    entityType: "performance_review",
    employeeId: positiveNumber(input.employeeId) ?? 0,
    okrCycleId: positiveNumber(input.okrCycleId) ?? 0,
    data: {
      selfScore: scoreOrNull(data.selfScore),
      selfComment: text(data.selfComment),
      managerScore: scoreOrNull(data.managerScore),
      managerComment: text(data.managerComment),
      finalScore: scoreOrNull(data.finalScore),
      finalGrade: gradeOrEmpty(data.finalGrade),
      hrComment: text(data.hrComment),
    },
  };
}

function lockPayloadByStage(input: {
  actorUserId: number;
  employeeUserId: number;
  stage: "self" | "manager" | "hr";
  previous: HrPerformanceReviewPayload | null;
  next: HrPerformanceReviewPayload;
}) {
  const previous = input.previous ?? {
    entityType: "performance_review" as const,
    employeeId: input.next.employeeId,
    okrCycleId: input.next.okrCycleId,
    data: {
      selfScore: null,
      selfComment: "",
      managerScore: null,
      managerComment: "",
      finalScore: null,
      finalGrade: "",
      hrComment: "",
    },
  };
  if (input.stage === "self") {
    if (input.actorUserId !== input.employeeUserId) return serviceError("只能为本人发起绩效自评", 403);
    return serviceOk({
      ...previous,
      employeeId: input.next.employeeId,
      okrCycleId: input.next.okrCycleId,
      data: {
        ...previous.data,
        selfScore: input.next.data.selfScore,
        selfComment: input.next.data.selfComment,
      },
    });
  }
  if (input.stage === "manager") {
    return serviceOk({
      ...previous,
      data: {
        ...previous.data,
        managerScore: input.next.data.managerScore,
        managerComment: input.next.data.managerComment,
      },
    });
  }
  if (!isGrade(input.next.data.finalGrade) && input.next.data.finalGrade) return serviceError("绩效等级必须为 S/A/B/C/D", 400);
  return serviceOk({
    ...previous,
    data: {
      ...previous.data,
      finalScore: input.next.data.finalScore,
      finalGrade: input.next.data.finalGrade,
      hrComment: input.next.data.hrComment,
    },
  });
}

function resolvePerformanceEditStage(request?: ApprovalRequestRecord<HrPerformanceReviewPayload>) {
  if (!request || request.status !== "submitted") return "self" as const;
  if (request.activeWorkflowNodeKey === "hr-final-review") return "hr" as const;
  return "manager" as const;
}

async function canSubmitHrPerformance(userId: number) {
  return evaluatePermissionAction(userId, HR_PERFORMANCE_RESOURCE_KEY, "submit");
}

async function canApproveHrPerformance(userId: number) {
  return evaluatePermissionAction(userId, HR_PERFORMANCE_RESOURCE_KEY, "approve");
}

async function isSelfPerformancePayload(userId: number, payload: HrPerformanceReviewPayload) {
  const employee = await prisma.employee.findUnique({
    where: { id: payload.employeeId },
    select: { userId: true },
  });
  return employee?.userId === userId;
}

async function canProcessHrPerformanceRequest(
  actorUserId: number,
  request: ApprovalRequestRecord<HrPerformanceReviewPayload>,
) {
  const handlers = await resolveHrPerformanceHandlerUserIds(request.handlerSource, request);
  return handlers.includes(actorUserId);
}

async function resolveHrPerformanceHandlerUserIds(
  handlerSource: ApprovalHandlerSource,
  request: ApprovalRequestRecord<HrPerformanceReviewPayload>,
  excludeUserId: number | null = null,
): Promise<number[]> {
  if (request.activeWorkflowNodeKey) {
    return resolveWorkflowNodeHandlerUserIds(request, {
      excludeUserId,
      resolveRelationship: (source): Promise<number[]> => resolveHrPerformanceHandlerUserIds(source, { ...request, activeWorkflowNodeKey: null }, excludeUserId),
      resolvePermission: () => listHrPerformanceApproverUserIds(excludeUserId),
    });
  }
  if (handlerSource === "direct_manager") return filterUserIds(await listDirectManagerUserIds(request.submitterUserId), excludeUserId);
  return listHrPerformanceApproverUserIds(excludeUserId);
}

async function listHrPerformanceApproverUserIds(excludeUserId: number | null) {
  const users = await prisma.user.findMany({
    where: { canLogin: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  const allowed = await Promise.all(users.map(async (user) => (
    await canApproveHrPerformance(user.id) ? user.id : null
  )));
  return allowed.filter((id): id is number => id !== null);
}

async function buildEmployeeWorkEvidenceSnapshot(employeeId: number, okrCycleId: number) {
  const employee = await getHrPerformanceEmployeeIdentity(employeeId);
  if (!employee) return { schemaVersion: 2, employeeId, okrCycleId, work: { plans: [], personalPlans: [], contributions: [], summary: emptyOkrSummary() }, kpi: { results: [], weightedScore: null } };
  const plans = await prisma.workPlan.findMany({
    where: {
      okrCycleId,
      kind: "okr",
      isArchived: false,
      OR: [
        { ownerEmployeeId: employeeId },
        ...(employee.userId ? [{ targetType: "personal", targetId: employee.userId }] : []),
      ],
    },
    include: { items: { where: { isArchived: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    orderBy: [{ id: "asc" }],
  });
  const planSnapshots = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    okrStage: plan.okrStage,
    objectives: plan.items.filter((item) => item.itemType === "objective").map((item) => item.content),
    keyResults: plan.items.filter((item) => item.itemType === "key_result").map((item) => ({
      id: item.id,
      content: item.content,
      status: item.status,
      start: item.krStartValue,
      target: item.krTargetValue,
      current: item.krCurrentValue,
      unit: item.krUnit,
      completion: krCompletion(item.krStartValue, item.krTargetValue, item.krCurrentValue),
    })),
  }));
  const [contributions, kpi] = await Promise.all([
    buildEmployeeContributionSnapshot(employeeId, okrCycleId),
    buildEmployeeKpiSnapshot(employeeId, okrCycleId),
  ]);
  return {
    schemaVersion: 2,
    employee,
    okrCycleId,
    capturedAt: new Date().toISOString(),
    work: {
      summary: summarizePlanSnapshots(planSnapshots),
      plans: planSnapshots,
      personalPlans: planSnapshots,
      contributions,
    },
    kpi,
  };
}

async function buildEmployeeKpiSnapshot(employeeId: number, okrCycleId: number) {
  const rows = await prisma.workKpiResultSnapshot.findMany({
    where: { assignment: { ownerEmployeeId: employeeId, workPlan: { okrCycleId } } },
    orderBy: [{ assignmentId: "asc" }, { version: "desc" }],
    select: {
      id: true,
      assignmentId: true,
      workReportId: true,
      version: true,
      actualValue: true,
      scoreBeforeAdjustment: true,
      confirmedScore: true,
      adjustmentReason: true,
      definitionSnapshotJson: true,
      assignmentSnapshotJson: true,
      scoringRuleSnapshotJson: true,
      evidenceSnapshotJson: true,
      approvedByUserId: true,
      approvedAt: true,
    },
  });
  const seen = new Set<number>();
  const latest = rows.filter((row) => {
    if (seen.has(row.assignmentId)) return false;
    seen.add(row.assignmentId);
    return true;
  }).map((row) => ({
    id: row.id,
    assignmentId: row.assignmentId,
    workReportId: row.workReportId,
    version: row.version,
    actualValue: Number(row.actualValue.toString()),
    scoreBeforeAdjustment: Number(row.scoreBeforeAdjustment.toString()),
    confirmedScore: Number(row.confirmedScore.toString()),
    adjustmentReason: row.adjustmentReason,
    definition: parseJson(row.definitionSnapshotJson),
    assignment: parseJson(row.assignmentSnapshotJson),
    scoringRule: parseJson(row.scoringRuleSnapshotJson),
    evidence: parseJson(row.evidenceSnapshotJson),
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt.toISOString(),
  }));
  const weightedScore = latest.length ? roundScore(latest.reduce((sum, result) => {
    const weight = Number((result.assignment as { weight?: unknown }).weight);
    return sum + result.confirmedScore * (Number.isFinite(weight) ? weight : 0) / 100;
  }, 0)) : null;
  return { results: latest, weightedScore };
}

function toAttendanceRow(employee: HrPerformanceAudienceEmployee) {
  const employment = employee.employments[0] ?? null;
  const primary = employee.positions.find((item) => item.isPrimary) ?? employee.positions[0] ?? null;
  return {
    id: employee.id,
    employeeId: employee.employeeId,
    name: employee.name,
    userId: employee.userId,
    company: primary?.reportingCompany?.name || employment?.currentCompany || "",
    department: primary?.department?.name || "",
    position: primary?.position?.name || "",
    attendanceType: employment?.attendanceType || "",
    personnelType: employment?.personnelType || "",
    joinDate: employment?.joinDate || "",
    status: employment?.isActive ? "在职" : "离职",
  };
}

function toWorkSourceRow(plan: Prisma.WorkPlanGetPayload<{ include: { owner: true; items: true } }>) {
  const objectives = plan.items.filter((item) => item.itemType === "objective");
  const keyResults = plan.items.filter((item) => item.itemType === "key_result");
  const completions = keyResults
    .map((item) => krCompletion(item.krStartValue, item.krTargetValue, item.krCurrentValue))
    .filter((value): value is number => value !== null);
  return {
    id: plan.id,
    employeeId: plan.ownerEmployeeId,
    employeeName: plan.owner?.name || "",
    planTitle: plan.title,
    kind: plan.kind,
    okrCycleId: plan.okrCycleId,
    stage: plan.okrStage,
    status: plan.status,
    objectiveCount: objectives.length,
    keyResultCount: keyResults.length,
    completionRate: completions.length ? Math.round(completions.reduce((sum, item) => sum + item, 0) / completions.length) : null,
  };
}

function toReviewRow(review: Prisma.HrPerformanceReviewGetPayload<{ include: { employee: true } }>) {
  return {
    id: review.id,
    employeeId: review.employeeId,
    employeeCode: review.employee.employeeId,
    employeeName: review.employee.name,
    okrCycleId: review.okrCycleId,
    approvalRequestId: review.approvalRequestId,
    selfScore: review.selfScore,
    managerScore: review.managerScore,
    finalScore: review.finalScore,
    finalGrade: review.finalGrade,
    archivedAt: review.archivedAt.toISOString(),
    version: review.version,
  };
}

function toReviewDetail(review: Prisma.HrPerformanceReviewGetPayload<{ include: { employee: true } }>) {
  return {
    ...toReviewRow(review),
    selfComment: review.selfComment,
    managerComment: review.managerComment,
    hrComment: review.hrComment,
    workEvidenceSnapshot: parseJson(review.workEvidenceSnapshotJson),
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

function toSubmissionRow(request: ApprovalRequestDto<HrPerformanceReviewPayload>, actorUserId: number) {
  return {
    id: request.id,
    status: request.status,
    employeeId: request.latestPayload.employeeId,
    okrCycleId: request.latestPayload.okrCycleId,
    selfScore: request.latestPayload.data.selfScore,
    selfComment: request.latestPayload.data.selfComment,
    managerScore: request.latestPayload.data.managerScore,
    managerComment: request.latestPayload.data.managerComment,
    finalScore: request.latestPayload.data.finalScore,
    finalGrade: request.latestPayload.data.finalGrade,
    hrComment: request.latestPayload.data.hrComment,
    activeWorkflowNodeKey: request.activeWorkflowNodeKey,
    submitterName: request.submitterName,
    canProcess: Boolean(request.canProcess),
    actionRuntime: resolveActionRuntime({
      businessActionKey: HR_PERFORMANCE_BUSINESS_ACTION_KEY,
      workflowPolicyMode: "required",
      workflowWhenDisabled: "unavailable",
      actor: {
        userId: actorUserId,
        canProcessWorkflow: Boolean(request.canProcess),
      },
      request,
    }),
    version: request.version,
    updatedAt: request.updatedAt,
  };
}

function mergeHrPerformanceSubmissionPayload(
  request: ApprovalRequestDto<HrPerformanceReviewPayload>,
  nextData: Record<string, unknown>,
): HrPerformanceReviewPayload {
  return normalizeReviewPayloadSeed({
    ...request.latestPayload,
    data: {
      ...request.latestPayload.data,
      ...nextData,
    },
  });
}

function normalizePerformanceAudience(value: unknown): PerformanceAudience | null {
  return value === "personal" || value === "department" || value === "project" ? value : null;
}

function normalizePerformancePeriodType(value: unknown): PerformancePeriodType | null {
  return HR_PERFORMANCE_PERIOD_TYPES.includes(value as PerformancePeriodType)
    ? value as PerformancePeriodType
    : null;
}

function normalizeStatusFilter(status: string | null | undefined): ApprovalStatus[] | undefined {
  if (!status) return undefined;
  const values = status.split(",").map((item) => item.trim()).filter(Boolean);
  const allowed: ApprovalStatus[] = ["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled"];
  const statuses = values.filter((value): value is ApprovalStatus => allowed.includes(value as ApprovalStatus));
  return statuses.length ? statuses : undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function scoreOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return isScore(number) ? number : null;
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}

function gradeOrEmpty(value: unknown) {
  const grade = String(value || "").trim().toUpperCase();
  return isGrade(grade) ? grade : "";
}

function isGrade(value: unknown): value is typeof HR_PERFORMANCE_GRADES[number] {
  return typeof value === "string" && HR_PERFORMANCE_GRADES.includes(value as typeof HR_PERFORMANCE_GRADES[number]);
}

function text(value: unknown) {
  return String(value || "").trim();
}

function filterUserIds(userIds: number[], excludeUserId: number | null) {
  return Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0 && id !== excludeUserId)));
}

function krCompletion(start: number | null, target: number | null, current: number | null) {
  if (target === null || current === null) return null;
  const base = start ?? 0;
  const distance = target - base;
  if (distance === 0) return current >= target ? 100 : 0;
  return Math.max(0, Math.min(100, ((current - base) / distance) * 100));
}

function summarizePlanSnapshots(plans: Array<{ objectives: unknown[]; keyResults: Array<{ completion: number | null }> }>) {
  const keyResults = plans.flatMap((plan) => plan.keyResults);
  const completions = keyResults.map((kr) => kr.completion).filter((value): value is number => value !== null);
  return {
    planCount: plans.length,
    objectiveCount: plans.reduce((sum, plan) => sum + plan.objectives.length, 0),
    keyResultCount: keyResults.length,
    completionRate: completions.length ? Math.round(completions.reduce((sum, value) => sum + value, 0) / completions.length) : null,
  };
}

function emptyOkrSummary() {
  return { planCount: 0, objectiveCount: 0, keyResultCount: 0, completionRate: null };
}

function roundScore(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
