import { getActionContractMetadata } from "@workspace/platform/action-contract-registry";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { resolveWorkflowPolicy } from "@workspace/platform/server/workflows";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "@workspace/platform/work-reporting-policy";
import { validateWorkOkrControlCommand } from "./domain/work-okr-control-validation";
import {
  workOkrBusinessActionLabel,
  workOkrWorkflowBusinessActionKey,
  type WorkOkrWorkflowActionKind,
} from "./task-approval-helpers";
import {
  getWorkOkrControlSettingsState,
  normalizeWorkOkrControlSettings,
  WORK_OKR_CONTROL_SETTINGS_KEY,
} from "./work-okr-control-config";
import type { WorkOkrControlScope, WorkOkrControlScopeType } from "./work-okr-control";
import { listWorkOkrCycleOptions } from "./work-okr-cycles";

const WORK_OKR_WORKFLOW_ACTION_KINDS: WorkOkrWorkflowActionKind[] = [
  "objective_submit",
  "objective_revise",
  "report_submit",
  "report_correct",
];

export async function listWorkOkrControlPolicies() {
  const command = validateWorkOkrControlCommand("listWorkOkrControlPolicies");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const [settingsState, cycleOptions, workflowActions, governance] = await Promise.all([
    getWorkOkrControlSettingsState(),
    listWorkOkrCycleOptions({ keyword: "", limit: 240 }),
    listWorkOkrWorkflowActions(),
    loadWorkPlanGovernanceSummary(),
  ]);
  const cycleIds = cycleOptions.map((cycle) => cycle.id);
  const policies = cycleIds.length ? await prisma.workOkrControlPolicy.findMany({
    where: { cycleId: { in: cycleIds } },
    orderBy: [{ cycleId: "desc" }, { scopeType: "asc" }, { scopeId: "asc" }],
  }) : [];
  return serviceOk({
    settings: settingsState.settings,
    settingsVersion: settingsState.version,
    workflowActions,
    governance,
    cycles: cycleOptions,
    policies: policies.map(serializeControlPolicy),
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
  if (!(await canManageWorkOkrControlSettings(input.actorUserId))) return serviceError("无权限管理周期与流程", 403);
  if (input.settings === undefined) {
    const policyCommand = validateWorkOkrControlCommand("upsertWorkOkrControlPolicy");
    if (!policyCommand.ok) return serviceError(policyCommand.issue.message, policyCommand.issue.status || 400);
    return upsertAuthorizedWorkOkrControlPolicy(input as Parameters<typeof upsertWorkOkrControlPolicy>[0]);
  }
  const command = validateWorkOkrControlCommand("updateWorkOkrControlSettings");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const settings = normalizeWorkOkrControlSettings(input.settings);
  const exception = await normalizeExceptionMutation(input.exception, input.actorUserId);
  if (!exception.ok) return exception;
  const result = await prisma.$transaction(async (tx) => {
    await tx.systemConfig.upsert({
      where: { key: WORK_OKR_CONTROL_SETTINGS_KEY },
      create: { key: WORK_OKR_CONTROL_SETTINGS_KEY, value: JSON.stringify(settings) },
      update: { value: JSON.stringify(settings) },
    });
    const latestRevision = await tx.workOkrControlRevision.findFirst({
      select: { version: true },
      orderBy: { version: "desc" },
    });
    const settingsVersion = (latestRevision?.version ?? 0) + 1;
    await tx.workOkrControlRevision.create({
      data: {
        version: settingsVersion,
        settingsJson: JSON.stringify(settings),
        actorUserId: input.actorUserId ?? null,
      },
    });
    if (exception.data.kind === "none") return { settingsVersion, policy: null, deletedPolicyKey: null };
    if (exception.data.kind === "delete") {
      const existing = await tx.workOkrControlPolicy.findUnique({ where: { cycleId_scopeType_scopeId: exception.data.key } });
      if (!existing) return { settingsVersion, policy: null, deletedPolicyKey: exception.data.key };
      await createControlPolicyRevision(tx, existing, input.actorUserId, "delete");
      await tx.workOkrControlPolicy.delete({ where: { id: existing.id } });
      return { settingsVersion, policy: null, deletedPolicyKey: exception.data.key };
    }
    const policy = await upsertControlPolicy(tx, exception.data.data, input.actorUserId);
    return { settingsVersion, policy, deletedPolicyKey: null };
  });
  return serviceOk({
    settings,
    settingsVersion: result.settingsVersion,
    policy: result.policy ? serializeControlPolicy(result.policy) : null,
    deletedPolicyKey: result.deletedPolicyKey,
  });
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
  if (!(await canManageWorkOkrControlSettings(input.actorUserId))) return serviceError("无权限管理周期与流程", 403);
  return upsertAuthorizedWorkOkrControlPolicy(input);
}

async function upsertAuthorizedWorkOkrControlPolicy(input: {
  cycleId: number;
  scopeType?: string | null;
  scopeId?: string | number | null;
  isLocked?: boolean | null;
  objectiveSubmitDeadline?: string | Date | null;
  krReviewOpensAt?: string | Date | null;
  krSubmitDeadline?: string | Date | null;
  actorUserId?: number | null;
}) {
  if (!Number.isInteger(input.cycleId) || input.cycleId <= 0) return serviceError("OKR 周期无效", 400);
  const scope = normalizeControlPolicyScope(input.scopeType, input.scopeId);
  if (!scope.ok) return scope;
  const cycle = await prisma.workOkrCycle.findUnique({ where: { id: input.cycleId }, select: { id: true } });
  if (!cycle) return serviceError("OKR 周期不存在", 404);
  const data = {
    cycleId: input.cycleId,
    scopeType: scope.data.scopeType,
    scopeId: scope.data.scopeId,
    isLocked: Boolean(input.isLocked),
    objectiveSubmitDeadline: nullableDate(input.objectiveSubmitDeadline),
    krReviewOpensAt: nullableDate(input.krReviewOpensAt),
    krSubmitDeadline: nullableDate(input.krSubmitDeadline),
  };
  const policy = await prisma.$transaction((tx) => upsertControlPolicy(tx, data, input.actorUserId));
  return serviceOk({ policy: serializeControlPolicy(policy) });
}

async function canManageWorkOkrControlSettings(actorUserId: number | null | undefined) {
  return Number.isInteger(actorUserId)
    && Number(actorUserId) > 0
    && await evaluatePermissionAction(Number(actorUserId), WORK_OKR_CONTROL_CAPABILITY_KEY, "configure");
}

export async function upsertWorkOkrKrReviewOpenPolicy(input: {
  cycleId: number;
  scope: WorkOkrControlScope;
  krReviewOpensAt: Date;
  actorUserId?: number | null;
}) {
  const command = validateWorkOkrControlCommand("upsertWorkOkrKrReviewOpenPolicy");
  if (!command.ok) throw new Error(command.issue.message);
  return prisma.$transaction((tx) => upsertControlPolicy(tx, {
    cycleId: input.cycleId,
    scopeType: input.scope.type,
    scopeId: input.scope.id,
    krReviewOpensAt: input.krReviewOpensAt,
  }, input.actorUserId));
}

async function loadWorkPlanGovernanceSummary() {
  const [groups, inFlightRequests] = await Promise.all([
    prisma.workPlan.groupBy({
      by: ["governanceMode", "governanceBindingSource"],
      where: { kind: "okr", isArchived: false },
      _count: { _all: true },
      orderBy: [{ governanceMode: "asc" }, { governanceBindingSource: "asc" }],
    }),
    prisma.approvalRequest.count({
      where: {
        subjectType: "work.task",
        status: { in: ["draft", "submitted", "committing", "withdrawn", "rejected"] },
        businessActionKey: { startsWith: "work.tasks.goal." },
      },
    }),
  ]);
  return {
    groups: groups.map((group) => ({
      mode: group.governanceMode,
      source: group.governanceBindingSource,
      count: group._count._all,
    })),
    inFlightRequests,
  };
}

async function listWorkOkrWorkflowActions() {
  return Promise.all(["department", "personal"].flatMap((targetType) => (
    WORK_OKR_WORKFLOW_ACTION_KINDS.map(async (kind) => {
      const businessActionKey = workOkrWorkflowBusinessActionKey({ kind, workspaceTargetType: targetType });
      const [policy, contract] = await Promise.all([
        resolveWorkflowPolicy({ businessActionKey }),
        Promise.resolve(getActionContractMetadata(businessActionKey)),
      ]);
      return {
        businessActionKey,
        targetType,
        kind,
        label: workOkrBusinessActionLabel(kind, targetType),
        enabled: policy.mode !== "direct" && policy.mode !== "permission_only",
        mode: policy.mode,
        policyId: policy.policyId,
        policyVersion: policy.version,
        actionContractVersion: contract?.version ?? null,
        whenDisabled: contract?.workflow?.kind === "configurable" ? contract.workflow.whenDisabled : "unavailable",
      };
    })
  )));
}

function normalizeControlPolicyScope(scopeType: string | null | undefined, scopeId: string | number | null | undefined) {
  const type = scopeType || "global";
  if (type === "global") return serviceOk({ scopeType: "global", scopeId: "" });
  if (type !== "company" && type !== "committee" && type !== "department") return serviceError("OKR 管控范围无效", 400);
  const id = Number(scopeId);
  if (!Number.isInteger(id) || id <= 0) return serviceError("OKR 管控范围 ID 无效", 400);
  return serviceOk({ scopeType: type, scopeId: String(id) });
}

async function normalizeExceptionMutation(input: unknown, actorUserId?: number | null) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : null;
  if (!source) return serviceOk({ kind: "none" as const });
  const cycleId = Number(source.cycleId);
  if (!Number.isInteger(cycleId) || cycleId <= 0) {
    return source.enabled === true ? serviceError("OKR 周期无效", 400) : serviceOk({ kind: "none" as const });
  }
  const scope = normalizeControlPolicyScope(String(source.scopeType || "global"), source.scopeId as string | number | null | undefined);
  if (!scope.ok) return scope;
  const key = { cycleId, scopeType: scope.data.scopeType, scopeId: scope.data.scopeId };
  if (source.enabled !== true) return serviceOk({ kind: "delete" as const, key });
  const cycle = await prisma.workOkrCycle.findUnique({ where: { id: cycleId }, select: { id: true } });
  if (!cycle) return serviceError("OKR 周期不存在", 404);
  return serviceOk({
    kind: "upsert" as const,
    data: {
      ...key,
      isLocked: Boolean(source.isLocked),
      objectiveSubmitDeadline: nullableDate(source.objectiveSubmitDeadline as string | Date | null | undefined),
      krReviewOpensAt: nullableDate(source.krReviewOpensAt as string | Date | null | undefined),
      krSubmitDeadline: nullableDate(source.krSubmitDeadline as string | Date | null | undefined),
      createdByUserId: actorUserId ?? null,
      updatedByUserId: actorUserId ?? null,
    },
  });
}

type ControlPolicyUpsertData = {
  cycleId: number;
  scopeType: string;
  scopeId: string;
  isLocked?: boolean;
  objectiveSubmitDeadline?: Date | null;
  krReviewOpensAt?: Date | null;
  krSubmitDeadline?: Date | null;
};

async function upsertControlPolicy(
  tx: Prisma.TransactionClient,
  data: ControlPolicyUpsertData,
  actorUserId?: number | null,
) {
  const policy = await tx.workOkrControlPolicy.upsert({
    where: { cycleId_scopeType_scopeId: { cycleId: data.cycleId, scopeType: data.scopeType, scopeId: data.scopeId } },
    create: {
      ...data,
      isLocked: data.isLocked ?? false,
      version: 1,
      createdByUserId: actorUserId ?? null,
      updatedByUserId: actorUserId ?? null,
    },
    update: {
      ...(data.isLocked === undefined ? {} : { isLocked: data.isLocked }),
      ...(data.objectiveSubmitDeadline === undefined ? {} : { objectiveSubmitDeadline: data.objectiveSubmitDeadline }),
      ...(data.krReviewOpensAt === undefined ? {} : { krReviewOpensAt: data.krReviewOpensAt }),
      ...(data.krSubmitDeadline === undefined ? {} : { krSubmitDeadline: data.krSubmitDeadline }),
      updatedByUserId: actorUserId ?? null,
      version: { increment: 1 },
    },
  });
  await createControlPolicyRevision(tx, policy, actorUserId, "upsert");
  return policy;
}

async function createControlPolicyRevision(
  tx: Prisma.TransactionClient,
  policy: ControlPolicySnapshot,
  actorUserId: number | null | undefined,
  changeKind: "upsert" | "delete",
) {
  await tx.workOkrControlPolicyRevision.create({
    data: {
      policyId: policy.id,
      cycleId: policy.cycleId,
      scopeType: policy.scopeType,
      scopeId: policy.scopeId,
      version: policy.version,
      changeKind,
      snapshotJson: JSON.stringify({
        id: policy.id,
        cycleId: policy.cycleId,
        scopeType: policy.scopeType,
        scopeId: policy.scopeId,
        isLocked: policy.isLocked,
        objectiveSubmitDeadline: policy.objectiveSubmitDeadline?.toISOString() ?? null,
        krReviewOpensAt: policy.krReviewOpensAt?.toISOString() ?? null,
        krSubmitDeadline: policy.krSubmitDeadline?.toISOString() ?? null,
        version: policy.version,
      }),
      actorUserId: actorUserId ?? null,
    },
  });
}

type ControlPolicySnapshot = {
  id: number;
  cycleId: number;
  scopeType: string;
  scopeId: string;
  isLocked: boolean;
  objectiveSubmitDeadline: Date | null;
  krReviewOpensAt: Date | null;
  krSubmitDeadline: Date | null;
  version: number;
};

function serializeControlPolicy(policy: ControlPolicySnapshot & { updatedAt: Date }) {
  return {
    id: policy.id,
    cycleId: policy.cycleId,
    scopeType: policy.scopeType as WorkOkrControlScopeType,
    scopeId: policy.scopeId,
    isLocked: policy.isLocked,
    objectiveSubmitDeadline: formatDate(policy.objectiveSubmitDeadline),
    krReviewOpensAt: formatDate(policy.krReviewOpensAt),
    krSubmitDeadline: formatDate(policy.krSubmitDeadline),
    version: policy.version,
    updatedAt: policy.updatedAt.toISOString(),
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
