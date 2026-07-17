import {
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { resolveWorkflowPolicy } from "@workspace/platform/server/workflows";
import { normalizeStoredWorkOkrControlScope } from "./domain/work-okr-control-scope";
import { workOkrWorkflowBusinessActionKey } from "./task-approval-helpers";
import { workTaskScopeId } from "./task-spaces";
import {
  getWorkOkrControlSettings,
  normalizeWorkOkrControlSettings,
  WORK_OKR_PERIOD_TYPES,
  type WorkOkrControlRule,
  type WorkOkrControlSettings,
  type WorkOkrPeriodType,
} from "./work-okr-control-config";
import { getWorkOkrCycleOrNull } from "./work-okr-cycles";

export type WorkOkrControlScopeType = "global" | "company" | "committee" | "department";

export type { WorkOkrControlSettings } from "./work-okr-control-config";

export type WorkOkrControlScope = {
  type: WorkOkrControlScopeType;
  id: string;
  targetType?: Exclude<WorkOkrControlScopeType, "global">;
  targetId?: number;
};

export type WorkOkrPlanScopeInput = {
  id?: number;
  targetType: string;
  targetId: number;
  okrCycleId?: number | null;
  okrControlScopeType?: string | null;
  okrControlScopeId?: string | null;
  governanceSnapshotJson?: string | null;
  periodType?: string | null;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
};

export async function resolveWorkOkrControlScopeForPlan(
  plan: WorkOkrPlanScopeInput,
  opts: { requirePersonalDepartment?: boolean } = {},
): Promise<ServiceResult<WorkOkrControlScope>> {
  const stored = normalizeStoredWorkOkrControlScope(plan.okrControlScopeType, plan.okrControlScopeId);
  if (stored) return serviceOk(stored);
  if (plan.targetType === "department" || plan.targetType === "company" || plan.targetType === "committee") {
    return serviceOk({
      type: plan.targetType,
      id: String(plan.targetId),
      targetType: plan.targetType,
      targetId: plan.targetId,
    });
  }
  if (plan.targetType === "project") return resolveProjectControlScope(plan.targetId);
  if (plan.targetType !== "personal") return serviceError("OKR 管控归属无效", 400);
  const department = await resolveUserPrimaryDepartment(plan.targetId);
  if (!department.ok) {
    return opts.requirePersonalDepartment
      ? department
      : serviceOk({ type: "global", id: "" });
  }
  return serviceOk({
    type: "department",
    id: String(department.data.departmentId),
    targetType: "department",
    targetId: department.data.departmentId,
  });
}

export async function resolveUserPrimaryDepartment(userId: number): Promise<ServiceResult<{ departmentId: number }>> {
  const employees = await prisma.employee.findMany({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null } }) },
    },
    select: {
      positions: {
        where: currentOpenEndedDateWhere({ departmentId: { not: null } }),
        select: { departmentId: true, isPrimary: true, id: true },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { employeeId: "asc" },
  });
  const positions = employees.flatMap((employee) => employee.positions);
  const primaryDepartmentIds = Array.from(new Set(positions.filter((position) => position.isPrimary).flatMap((position) => position.departmentId ? [position.departmentId] : [])));
  if (primaryDepartmentIds.length === 1) return serviceOk({ departmentId: primaryDepartmentIds[0] });
  if (primaryDepartmentIds.length > 1) return serviceError("当前员工存在多个主部门，无法确定个人 OKR 所属部门", 409);
  const departmentIds = Array.from(new Set(positions.flatMap((position) => position.departmentId ? [position.departmentId] : [])));
  if (departmentIds.length === 1) return serviceOk({ departmentId: departmentIds[0] });
  if (departmentIds.length > 1) return serviceError("当前员工存在多个有效部门，请先设置主部门后再提交 OKR", 409);
  return serviceError("当前员工没有有效所属部门，不能提交个人 OKR 绩效", 409);
}

async function resolveProjectControlScope(projectId: number): Promise<ServiceResult<WorkOkrControlScope>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectType: true, leadingDepartmentId: true },
  });
  if (!project) return serviceError("项目不存在", 404);
  if (project.projectType === "department") {
    if (!project.leadingDepartmentId) return serviceError("项目缺少归口部门，不能提交项目 OKR 绩效", 409);
    return serviceOk({
      type: "department",
      id: String(project.leadingDepartmentId),
      targetType: "department",
      targetId: project.leadingDepartmentId,
    });
  }
  if (project.projectType === "company") {
    const committee = await getOperatingCommitteeDepartmentContext();
    if (!committee) return serviceError("运营委员会空间未配置，不能提交项目 OKR 绩效", 409);
    return serviceOk({
      type: "committee",
      id: String(committee.id),
      targetType: "committee",
      targetId: committee.id,
    });
  }
  const company = await getGroupCompanyContext();
  if (!company) return serviceError("公司空间未配置，不能提交项目 OKR 绩效", 409);
  return serviceOk({
    type: "company",
    id: String(company.id),
    targetType: "company",
    targetId: company.id,
  });
}

export async function getStoredWorkOkrControlPolicyForPlan(plan: WorkOkrPlanScopeInput) {
  if (!plan.okrCycleId) return null;
  const scope = await resolveWorkOkrControlScopeForPlan(plan);
  const scopeData = scope.ok ? scope.data : { type: "global" as const, id: "" };
  const scoped = await prisma.workOkrControlPolicy.findUnique({
    where: {
      cycleId_scopeType_scopeId: {
        cycleId: plan.okrCycleId,
        scopeType: scopeData.type,
        scopeId: scopeData.id,
      },
    },
  });
  if (scoped) return scoped;
  return prisma.workOkrControlPolicy.findUnique({
    where: {
      cycleId_scopeType_scopeId: {
        cycleId: plan.okrCycleId,
        scopeType: "global",
        scopeId: "",
      },
    },
  });
}

async function resolveEffectiveWorkOkrControl(
  plan: WorkOkrPlanScopeInput,
  actionKind: "objective_submit" | "report_submit",
) {
  const bound = parseBoundOkrControl(plan.governanceSnapshotJson, actionKind);
  if (!bound) throw new Error(`OKR 计划 ${plan.id ?? "unknown"} 缺少完整治理快照，不能读取当前全局日期规则补齐`);
  if (!bound.settings.enabled || !bound.workflowEnabled) return null;
  return { settings: bound.settings, policy: bound.policy };
}

function parseBoundOkrControl(
  snapshotJson: string | null | undefined,
  actionKind: "objective_submit" | "report_submit",
) {
  if (!snapshotJson) return null;
  try {
    const snapshot = JSON.parse(snapshotJson) as {
      version?: unknown;
      okrControl?: { version?: unknown; settings?: unknown; policy?: unknown };
      actions?: Record<string, {
        policy?: { mode?: unknown };
      }>;
    };
    const controlVersion = Number(snapshot.okrControl?.version);
    if (snapshot.version !== 1 || !Number.isInteger(controlVersion) || controlVersion <= 0 || !snapshot.okrControl?.settings) return null;
    const action = snapshot.actions?.[actionKind];
    const mode = action?.policy?.mode;
    if (mode !== "optional" && mode !== "required" && mode !== "direct" && mode !== "permission_only") return null;
    return {
      settings: normalizeWorkOkrControlSettings(snapshot.okrControl.settings),
      policy: normalizeBoundControlPolicy(snapshot.okrControl.policy),
      workflowEnabled: mode === "optional" || mode === "required",
    };
  } catch {
    return null;
  }
}

function normalizeBoundControlPolicy(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const cycleId = Number(source.cycleId);
  if (!Number.isInteger(cycleId) || cycleId <= 0) return null;
  return {
    id: Number(source.id) || 0,
    cycleId,
    scopeType: String(source.scopeType || "global"),
    scopeId: String(source.scopeId || ""),
    isLocked: source.isLocked === true,
    objectiveSubmitDeadline: nullableDate(source.objectiveSubmitDeadline as string | Date | null | undefined),
    krReviewOpensAt: nullableDate(source.krReviewOpensAt as string | Date | null | undefined),
    krSubmitDeadline: nullableDate(source.krSubmitDeadline as string | Date | null | undefined),
    version: Number(source.version) || 1,
  };
}

export async function resolveWorkOkrKrReviewOpensAt(plan: WorkOkrPlanScopeInput & {
  periodType?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  krReviewOpensAt?: Date | null;
}) {
  const control = await resolveEffectiveWorkOkrControl(plan, "report_submit");
  if (!control) return plan.krReviewOpensAt ?? plan.periodEnd ?? plan.plannedEndDate ?? null;
  const { settings, policy } = control;
  if (policy?.krReviewOpensAt) return policy.krReviewOpensAt;
  const configured = await resolveConfiguredKrOpenDate(plan, settings);
  return configured ?? plan.krReviewOpensAt ?? plan.periodEnd ?? plan.plannedEndDate ?? null;
}

export async function getWorkOkrCyclePlanningWindow(
  cycle: { periodType: string; startDate: Date; endDate: Date },
  workspaceTargetType?: string | null,
) {
  const settings = await getWorkOkrControlSettings();
  if (!settings.enabled || !isWorkOkrPeriodType(cycle.periodType)) return { enabled: true, opensAt: cycle.startDate };
  if (workspaceTargetType) {
    const businessActionKey = workOkrWorkflowBusinessActionKey({ kind: "objective_submit", workspaceTargetType });
    const workflow = await resolveWorkflowPolicy({ businessActionKey });
    if (workflow.mode === "direct" || workflow.mode === "permission_only") {
      return { enabled: true, opensAt: cycle.startDate };
    }
  }
  const periodRule = settings.periodTypes[cycle.periodType];
  if (periodRule?.mode === "disabled" || periodRule?.mode === "report_only") return { enabled: false, opensAt: null };
  const rule = resolvePeriodTypeControlRule(settings, cycle.periodType, "objectiveOpensAt");
  return { enabled: Boolean(rule), opensAt: rule ? applyControlRule({ periodStart: cycle.startDate, periodEnd: cycle.endDate }, rule) : null };
}

export async function assertWorkOkrCycleUnlocked(plan: WorkOkrPlanScopeInput): Promise<ServiceResult<{ ok: true }>> {
  const policy = (await resolveEffectiveWorkOkrControl(plan, "objective_submit"))?.policy;
  if (policy?.isLocked) return serviceError("当前 OKR 周期已锁定", 409);
  return serviceOk({ ok: true as const });
}

export async function assertWorkOkrSubmissionAllowed(
  plan: WorkOkrPlanScopeInput,
  kind: "objective_plan" | "kr_review",
  now = new Date(),
): Promise<ServiceResult<{ ok: true }>> {
  const actionKind = kind === "objective_plan" ? "objective_submit" : "report_submit";
  const control = await resolveEffectiveWorkOkrControl(plan, actionKind);
  if (!control) return serviceOk({ ok: true as const });
  const policy = control.policy;
  if (policy?.isLocked) return serviceError("当前 OKR 周期已锁定", 409);
  const configuredDeadline = await resolveConfiguredSubmissionDeadline(
    plan,
    control.settings,
    kind === "objective_plan" ? "objectiveSubmitDeadline" : "krSubmitDeadline",
  );
  const deadline = kind === "objective_plan"
    ? policy?.objectiveSubmitDeadline ?? configuredDeadline
    : policy?.krSubmitDeadline ?? configuredDeadline;
  if (deadline && now > endOfDate(deadline)) {
    return serviceError(kind === "objective_plan" ? "目标提交已超过截止日" : "KR 提交已超过截止日", 409);
  }
  return serviceOk({ ok: true as const });
}

async function resolveConfiguredSubmissionDeadline(
  plan: WorkOkrPlanScopeInput,
  settings: WorkOkrControlSettings,
  key: "objectiveSubmitDeadline" | "krSubmitDeadline",
) {
  const period = await resolvePlanControlPeriod({
    ...plan,
    periodStart: plan.plannedStartDate,
    periodEnd: plan.plannedEndDate,
  });
  if (!period) return null;
  const rule = resolvePeriodTypeControlRule(settings, period.periodType, key);
  return rule ? applyControlRule(period, rule) : null;
}

export function controlScopeToWorkTaskScope(scope: WorkOkrControlScope) {
  return scope.targetType && scope.targetId ? workTaskScopeId(scope.targetType, scope.targetId) : null;
}

async function resolveConfiguredKrOpenDate(plan: WorkOkrPlanScopeInput & {
  periodType?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}, settings: WorkOkrControlSettings) {
  if (!plan.okrCycleId && (!plan.periodType || !plan.periodStart || !plan.periodEnd)) return null;
  const period = await resolvePlanControlPeriod(plan);
  if (!period) return null;
  const rule = resolvePeriodTypeControlRule(settings, period.periodType, "krReviewOpensAt");
  return rule ? applyControlRule(period, rule) : null;
}

async function resolvePlanControlPeriod(plan: WorkOkrPlanScopeInput & {
  periodType?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}) {
  if (plan.okrCycleId) {
    const cycle = await getWorkOkrCycleOrNull(plan.okrCycleId);
    if (cycle) return { periodType: cycle.periodType as WorkOkrPeriodType, periodStart: cycle.startDate, periodEnd: cycle.endDate };
  }
  const periodStart = plan.periodStart ?? plan.plannedStartDate ?? null;
  const periodEnd = plan.periodEnd ?? plan.plannedEndDate ?? null;
  if (!isWorkOkrPeriodType(plan.periodType) || !periodStart || !periodEnd) return null;
  return { periodType: plan.periodType, periodStart, periodEnd };
}

function resolvePeriodTypeControlRule(
  settings: WorkOkrControlSettings,
  periodType: WorkOkrPeriodType,
  key: keyof Omit<WorkOkrControlSettings, "enabled" | "autoLock" | "periodTypes">,
) {
  const periodRule = settings.periodTypes[periodType];
  if (periodRule?.mode === "disabled" || periodRule?.mode === "report_only") return null;
  if (periodRule?.mode === "custom") return periodRule[key] ?? settings[key];
  return settings[key];
}

function applyControlRule(period: { periodStart: Date; periodEnd: Date }, rule: WorkOkrControlRule) {
  const anchor = rule.anchor === "periodStart" ? period.periodStart : period.periodEnd;
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() + rule.offsetDays);
  return date;
}

function isWorkOkrPeriodType(value: string | null | undefined): value is WorkOkrPeriodType {
  return typeof value === "string" && WORK_OKR_PERIOD_TYPES.includes(value as WorkOkrPeriodType);
}

function nullableDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDate(value: Date) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
