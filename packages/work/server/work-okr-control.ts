import {
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { validateWorkOkrControlCommand } from "./domain/work-okr-control-validation";
import { workTaskScopeId } from "./task-spaces";
import { getWorkOkrCycleOrNull, listWorkOkrCycleOptions } from "./work-okr-cycles";

export type WorkOkrControlScopeType = "global" | "company" | "committee" | "department";
type WorkOkrControlRuleAnchor = "periodStart" | "periodEnd";
type WorkOkrControlRule = { anchor: WorkOkrControlRuleAnchor; offsetDays: number };
type WorkOkrPeriodType = "yearly" | "half_year" | "quarterly" | "monthly" | "weekly";
type WorkOkrPeriodTypeRule = {
  mode: "inherit" | "custom" | "disabled" | "report_only";
  objectiveOpensAt?: WorkOkrControlRule;
  objectiveSubmitDeadline?: WorkOkrControlRule;
  krReviewOpensAt?: WorkOkrControlRule;
  krSubmitDeadline?: WorkOkrControlRule;
};
export type WorkOkrControlSettings = {
  enabled: boolean;
  objectiveOpensAt: WorkOkrControlRule;
  objectiveSubmitDeadline: WorkOkrControlRule;
  krReviewOpensAt: WorkOkrControlRule;
  krSubmitDeadline: WorkOkrControlRule;
  autoLock: "off" | "afterObjectiveDeadline" | "afterKrDeadline";
  periodTypes: Record<WorkOkrPeriodType, WorkOkrPeriodTypeRule>;
};

const WORK_OKR_CONTROL_SETTINGS_KEY = "work.okr.control.settings";
const WORK_OKR_PERIOD_TYPES: WorkOkrPeriodType[] = ["yearly", "half_year", "quarterly", "monthly", "weekly"];
const DEFAULT_WORK_OKR_CONTROL_SETTINGS: WorkOkrControlSettings = {
  enabled: true,
  objectiveOpensAt: { anchor: "periodStart", offsetDays: -7 },
  objectiveSubmitDeadline: { anchor: "periodStart", offsetDays: 0 },
  krReviewOpensAt: { anchor: "periodEnd", offsetDays: 0 },
  krSubmitDeadline: { anchor: "periodEnd", offsetDays: 14 },
  autoLock: "afterKrDeadline",
  periodTypes: {
    yearly: { mode: "inherit" },
    half_year: { mode: "inherit" },
    quarterly: { mode: "inherit" },
    monthly: { mode: "inherit" },
    weekly: { mode: "report_only" },
  },
};

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
};

export async function resolveWorkOkrControlScopeForPlan(
  plan: WorkOkrPlanScopeInput,
  opts: { requirePersonalDepartment?: boolean } = {},
): Promise<ServiceResult<WorkOkrControlScope>> {
  const stored = normalizeStoredControlScope(plan.okrControlScopeType, plan.okrControlScopeId);
  if (stored && plan.targetType !== "personal") return serviceOk(stored);
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
    if (!project.leadingDepartmentId) return serviceError("项目缺少赋能部门，不能提交项目 OKR 绩效", 409);
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

export async function getWorkOkrControlPolicyForPlan(plan: WorkOkrPlanScopeInput) {
  if (!plan.okrCycleId) return null;
  const settings = await getWorkOkrControlSettings();
  if (!settings.enabled) return null;
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

export async function resolveWorkOkrKrReviewOpensAt(plan: WorkOkrPlanScopeInput & {
  periodType?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  krReviewOpensAt?: Date | null;
}) {
  const settings = await getWorkOkrControlSettings();
  if (!settings.enabled) return startOfUtcToday();
  const policy = await getWorkOkrControlPolicyForPlan(plan);
  if (policy?.krReviewOpensAt) return policy.krReviewOpensAt;
  const configured = await resolveConfiguredKrOpenDate(plan);
  return configured ?? plan.krReviewOpensAt ?? plan.periodEnd ?? null;
}

export async function getWorkOkrCyclePlanningWindow(cycle: { periodType: string; startDate: Date; endDate: Date }) {
  const settings = await getWorkOkrControlSettings();
  if (!settings.enabled || !isWorkOkrPeriodType(cycle.periodType)) return { enabled: true, opensAt: cycle.startDate };
  const periodRule = settings.periodTypes[cycle.periodType];
  if (periodRule?.mode === "disabled" || periodRule?.mode === "report_only") return { enabled: false, opensAt: null };
  const rule = resolvePeriodTypeControlRule(settings, cycle.periodType, "objectiveOpensAt");
  return { enabled: Boolean(rule), opensAt: rule ? applyControlRule({ periodStart: cycle.startDate, periodEnd: cycle.endDate }, rule) : null };
}

export async function assertWorkOkrCycleUnlocked(plan: WorkOkrPlanScopeInput): Promise<ServiceResult<{ ok: true }>> {
  const policy = await getWorkOkrControlPolicyForPlan(plan);
  if (policy?.isLocked) return serviceError("当前 OKR 周期已锁定", 409);
  return serviceOk({ ok: true as const });
}

export async function assertWorkOkrSubmissionAllowed(
  plan: WorkOkrPlanScopeInput,
  kind: "objective_plan" | "kr_review",
  now = new Date(),
): Promise<ServiceResult<{ ok: true }>> {
  const policy = await getWorkOkrControlPolicyForPlan(plan);
  if (policy?.isLocked) return serviceError("当前 OKR 周期已锁定", 409);
  const deadline = kind === "objective_plan" ? policy?.objectiveSubmitDeadline : policy?.krSubmitDeadline;
  if (deadline && now > endOfDate(deadline)) {
    return serviceError(kind === "objective_plan" ? "目标提交已超过截止日" : "KR 提交已超过截止日", 409);
  }
  return serviceOk({ ok: true as const });
}

export async function listWorkOkrControlPolicies() {
  const command = validateWorkOkrControlCommand("listWorkOkrControlPolicies");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const settings = await getWorkOkrControlSettings();
  const cycleOptions = await listWorkOkrCycleOptions({ keyword: "", limit: 240 });
  const cycleIds = cycleOptions.map((cycle) => cycle.id);
  const policies = cycleIds.length ? await prisma.workOkrControlPolicy.findMany({
    where: { cycleId: { in: cycleIds } },
    orderBy: [{ cycleId: "desc" }, { scopeType: "asc" }, { scopeId: "asc" }],
  }) : [];
  return serviceOk({
    settings,
    cycles: cycleOptions,
    policies: policies.map((policy) => ({
      id: policy.id,
      cycleId: policy.cycleId,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      isLocked: policy.isLocked,
      objectiveSubmitDeadline: formatDate(policy.objectiveSubmitDeadline),
      krReviewOpensAt: formatDate(policy.krReviewOpensAt),
      krSubmitDeadline: formatDate(policy.krSubmitDeadline),
      updatedAt: policy.updatedAt.toISOString(),
    })),
  });
}

export async function updateWorkOkrControlSettings(input: {
  settings?: unknown;
  exception?: unknown;
  cycleId?: number;
  scopeType?: string | null;
  scopeId?: string | number | null;
  isLocked?: boolean | null;
  objectiveSubmitDeadline?: string | Date | null;
  krReviewOpensAt?: string | Date | null;
  krSubmitDeadline?: string | Date | null;
  actorUserId?: number | null;
}) {
  if (input.settings === undefined) return upsertWorkOkrControlPolicy(input as Parameters<typeof upsertWorkOkrControlPolicy>[0]);
  const command = validateWorkOkrControlCommand("updateWorkOkrControlSettings");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const settings = normalizeWorkOkrControlSettings(input.settings);
  const exception = await normalizeSingleException(input.exception, input.actorUserId);
  if (!exception.ok) return exception;
  const policy = await prisma.$transaction(async (tx) => {
    await tx.systemConfig.upsert({
      where: { key: WORK_OKR_CONTROL_SETTINGS_KEY },
      create: { key: WORK_OKR_CONTROL_SETTINGS_KEY, value: JSON.stringify(settings) },
      update: { value: JSON.stringify(settings) },
    });
    await tx.workOkrControlPolicy.deleteMany();
    if (!exception.data) return null;
    return tx.workOkrControlPolicy.create({ data: exception.data });
  });
  return serviceOk({ settings, policy: policy ? serializeControlPolicy(policy) : null });
}

export async function upsertWorkOkrControlPolicy(input: {
  cycleId: number;
  scopeType?: string | null;
  scopeId?: string | number | null;
  isLocked?: boolean | null;
  objectiveSubmitDeadline?: string | Date | null;
  krReviewOpensAt?: string | Date | null;
  krSubmitDeadline?: string | Date | null;
  actorUserId?: number | null;
}) {
  const command = validateWorkOkrControlCommand("upsertWorkOkrControlPolicy");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  if (!Number.isInteger(input.cycleId) || input.cycleId <= 0) return serviceError("OKR 周期无效", 400);
  const scope = normalizeControlPolicyScope(input.scopeType, input.scopeId);
  if (!scope.ok) return scope;
  const cycle = await prisma.workOkrCycle.findUnique({ where: { id: input.cycleId }, select: { id: true } });
  if (!cycle) return serviceError("OKR 周期不存在", 404);
  const policy = await prisma.workOkrControlPolicy.upsert({
    where: {
      cycleId_scopeType_scopeId: {
        cycleId: input.cycleId,
        scopeType: scope.data.scopeType,
        scopeId: scope.data.scopeId,
      },
    },
    create: {
      cycleId: input.cycleId,
      scopeType: scope.data.scopeType,
      scopeId: scope.data.scopeId,
      isLocked: Boolean(input.isLocked),
      objectiveSubmitDeadline: nullableDate(input.objectiveSubmitDeadline),
      krReviewOpensAt: nullableDate(input.krReviewOpensAt),
      krSubmitDeadline: nullableDate(input.krSubmitDeadline),
      createdByUserId: input.actorUserId ?? null,
      updatedByUserId: input.actorUserId ?? null,
    },
    update: {
      isLocked: Boolean(input.isLocked),
      objectiveSubmitDeadline: nullableDate(input.objectiveSubmitDeadline),
      krReviewOpensAt: nullableDate(input.krReviewOpensAt),
      krSubmitDeadline: nullableDate(input.krSubmitDeadline),
      updatedByUserId: input.actorUserId ?? null,
    },
  });
  return serviceOk({
    policy: serializeControlPolicy(policy),
  });
}

export async function upsertWorkOkrKrReviewOpenPolicy(input: {
  cycleId: number;
  scope: WorkOkrControlScope;
  krReviewOpensAt: Date;
  actorUserId?: number | null;
}) {
  const command = validateWorkOkrControlCommand("upsertWorkOkrKrReviewOpenPolicy");
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.workOkrControlPolicy.upsert({
    where: {
      cycleId_scopeType_scopeId: {
        cycleId: input.cycleId,
        scopeType: input.scope.type,
        scopeId: input.scope.id,
      },
    },
    create: {
      cycleId: input.cycleId,
      scopeType: input.scope.type,
      scopeId: input.scope.id,
      krReviewOpensAt: input.krReviewOpensAt,
      createdByUserId: input.actorUserId ?? null,
      updatedByUserId: input.actorUserId ?? null,
    },
    update: {
      krReviewOpensAt: input.krReviewOpensAt,
      updatedByUserId: input.actorUserId ?? null,
    },
  });
}

export function controlScopeToWorkTaskScope(scope: WorkOkrControlScope) {
  return scope.targetType && scope.targetId ? workTaskScopeId(scope.targetType, scope.targetId) : null;
}

function normalizeStoredControlScope(scopeType: string | null | undefined, scopeId: string | null | undefined): WorkOkrControlScope | null {
  if (!scopeType || scopeType === "global") return null;
  if (scopeType !== "department" && scopeType !== "company" && scopeType !== "committee") return null;
  const id = Number(scopeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { type: scopeType, id: String(id), targetType: scopeType, targetId: id };
}

function normalizeControlPolicyScope(scopeType: string | null | undefined, scopeId: string | number | null | undefined) {
  const type = scopeType || "global";
  if (type === "global") return serviceOk({ scopeType: "global", scopeId: "" });
  if (type !== "company" && type !== "committee" && type !== "department") return serviceError("OKR 管控范围无效", 400);
  const id = Number(scopeId);
  if (!Number.isInteger(id) || id <= 0) return serviceError("OKR 管控范围 ID 无效", 400);
  return serviceOk({ scopeType: type, scopeId: String(id) });
}

async function normalizeSingleException(input: unknown, actorUserId?: number | null) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : null;
  if (!source || source.enabled !== true) return serviceOk(null);
  const cycleId = Number(source.cycleId);
  if (!Number.isInteger(cycleId) || cycleId <= 0) return serviceError("OKR 周期无效", 400);
  const scope = normalizeControlPolicyScope(String(source.scopeType || "global"), source.scopeId as string | number | null | undefined);
  if (!scope.ok) return scope;
  const cycle = await prisma.workOkrCycle.findUnique({ where: { id: cycleId }, select: { id: true } });
  if (!cycle) return serviceError("OKR 周期不存在", 404);
  return serviceOk({
    cycleId,
    scopeType: scope.data.scopeType,
    scopeId: scope.data.scopeId,
    isLocked: Boolean(source.isLocked),
    objectiveSubmitDeadline: nullableDate(source.objectiveSubmitDeadline as string | Date | null | undefined),
    krReviewOpensAt: nullableDate(source.krReviewOpensAt as string | Date | null | undefined),
    krSubmitDeadline: nullableDate(source.krSubmitDeadline as string | Date | null | undefined),
    createdByUserId: actorUserId ?? null,
    updatedByUserId: actorUserId ?? null,
  });
}

function serializeControlPolicy(policy: {
  id: number;
  cycleId: number;
  scopeType: string;
  scopeId: string;
  isLocked: boolean;
  objectiveSubmitDeadline: Date | null;
  krReviewOpensAt: Date | null;
  krSubmitDeadline: Date | null;
  updatedAt: Date;
}) {
  return {
    id: policy.id,
    cycleId: policy.cycleId,
    scopeType: policy.scopeType as WorkOkrControlScopeType,
    scopeId: policy.scopeId,
    isLocked: policy.isLocked,
    objectiveSubmitDeadline: formatDate(policy.objectiveSubmitDeadline),
    krReviewOpensAt: formatDate(policy.krReviewOpensAt),
    krSubmitDeadline: formatDate(policy.krSubmitDeadline),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

async function getWorkOkrControlSettings() {
  const row = await prisma.systemConfig.findUnique({ where: { key: WORK_OKR_CONTROL_SETTINGS_KEY } });
  if (!row) return DEFAULT_WORK_OKR_CONTROL_SETTINGS;
  try {
    return normalizeWorkOkrControlSettings(JSON.parse(row.value));
  } catch {
    return DEFAULT_WORK_OKR_CONTROL_SETTINGS;
  }
}

function normalizeWorkOkrControlSettings(value: unknown): WorkOkrControlSettings {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrControlSettings> : {};
  const periodSource = source.periodTypes && typeof source.periodTypes === "object" ? source.periodTypes : {};
  return {
    enabled: source.enabled !== false,
    objectiveOpensAt: normalizeRule(source.objectiveOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveOpensAt, "periodStart"),
    objectiveSubmitDeadline: normalizeRule(source.objectiveSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveSubmitDeadline, "periodStart"),
    krReviewOpensAt: normalizeRule(source.krReviewOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krReviewOpensAt, "periodEnd"),
    krSubmitDeadline: normalizeRule(source.krSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krSubmitDeadline, "periodEnd"),
    autoLock: source.autoLock === "off" || source.autoLock === "afterObjectiveDeadline" || source.autoLock === "afterKrDeadline" ? source.autoLock : DEFAULT_WORK_OKR_CONTROL_SETTINGS.autoLock,
    periodTypes: Object.fromEntries(WORK_OKR_PERIOD_TYPES.map((type) => {
      const item = (periodSource as Record<string, unknown>)[type];
      return [type, normalizePeriodTypeRule(item, DEFAULT_WORK_OKR_CONTROL_SETTINGS.periodTypes[type])];
    })) as WorkOkrControlSettings["periodTypes"],
  };
}

function normalizePeriodTypeRule(value: unknown, fallback: WorkOkrPeriodTypeRule): WorkOkrPeriodTypeRule {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrPeriodTypeRule> : {};
  const mode = source.mode === "inherit" || source.mode === "custom" || source.mode === "disabled" || source.mode === "report_only" ? source.mode : fallback.mode;
  return {
    mode,
    objectiveOpensAt: mode === "custom" ? normalizeRule(source.objectiveOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveOpensAt, "periodStart") : undefined,
    objectiveSubmitDeadline: mode === "custom" ? normalizeRule(source.objectiveSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.objectiveSubmitDeadline, "periodStart") : undefined,
    krReviewOpensAt: mode === "custom" ? normalizeRule(source.krReviewOpensAt, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krReviewOpensAt, "periodEnd") : undefined,
    krSubmitDeadline: mode === "custom" ? normalizeRule(source.krSubmitDeadline, DEFAULT_WORK_OKR_CONTROL_SETTINGS.krSubmitDeadline, "periodEnd") : undefined,
  };
}

async function resolveConfiguredKrOpenDate(plan: WorkOkrPlanScopeInput & {
  periodType?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}) {
  if (!plan.okrCycleId && (!plan.periodType || !plan.periodStart || !plan.periodEnd)) return null;
  const period = await resolvePlanControlPeriod(plan);
  if (!period) return null;
  const settings = await getWorkOkrControlSettings();
  if (!settings.enabled) return null;
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
  if (!isWorkOkrPeriodType(plan.periodType) || !plan.periodStart || !plan.periodEnd) return null;
  return { periodType: plan.periodType, periodStart: plan.periodStart, periodEnd: plan.periodEnd };
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

function normalizeRule(value: unknown, fallback: WorkOkrControlRule, fixedAnchor: WorkOkrControlRuleAnchor): WorkOkrControlRule {
  const source = value && typeof value === "object" ? value as Partial<WorkOkrControlRule> : {};
  if (source.anchor && source.anchor !== fixedAnchor) return fallback;
  const offsetDays = Number(source.offsetDays);
  return {
    anchor: fixedAnchor,
    offsetDays: Number.isInteger(offsetDays) && offsetDays >= -365 && offsetDays <= 365 ? offsetDays : fallback.offsetDays,
  };
}

function nullableDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function endOfDate(value: Date) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function startOfUtcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
