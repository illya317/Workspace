import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import type { FinanceCloseScope, OpenFinanceCloseInput, RefreshFinanceCloseInput } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";
import { closeValidationDependencies } from "./reference-adapter";
import type { CloseValidationDependencies } from "./validation-dependencies";

export type { CloseValidationDependencies } from "./validation-dependencies";

export type ResolvedFinanceCloseScope = FinanceCloseScope & {
  companyId: number;
  periodId: number;
  isPeriodClosed: boolean;
};

export type OpenFinanceCloseCommand = ResolvedFinanceCloseScope & {
  actorUserId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  idempotentRunId: number | null;
};

export type RefreshFinanceCloseCommand = ResolvedFinanceCloseScope & {
  runId: number;
  expectedVersion: number;
  actorUserId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  idempotentRunId: number | null;
};

async function validateUser(userId: number, deps: CloseValidationDependencies) {
  const user = await deps.findUser(userId);
  return user?.canLogin ? null : failCommand("当前用户不存在或不可登录", 403);
}

async function resolveScope(scope: FinanceCloseScope, deps: CloseValidationDependencies) {
  const company = await deps.findCompanyByCode(scope.companyCode);
  if (!company?.isActive) return failCommand("公司不存在或未启用", 400, "companyCode");
  const period = await deps.findPeriod(scope);
  if (!period || period.companyCode !== company.code || period.year !== scope.year || period.month !== scope.month) {
    return failCommand("会计期间不存在或不属于当前公司和年月", 400, "month");
  }
  return okCommand<ResolvedFinanceCloseScope>({ ...scope, companyId: company.id, periodId: period.id, isPeriodClosed: period.isClosed });
}

export async function buildReadFinanceCloseCommand(scope: FinanceCloseScope, deps = closeValidationDependencies) {
  return resolveScope(scope, deps);
}

export async function buildOpenFinanceCloseCommand(input: OpenFinanceCloseInput, userId: number, deps = closeValidationDependencies) {
  const invalidUser = await validateUser(userId, deps);
  if (invalidUser) return invalidUser;
  const scope = await resolveScope(input, deps);
  if (!scope.ok) return scope;
  const requestFingerprint = sha256CanonicalJson({
    kind: "finance_close_open",
    scope: {
      companyCode: scope.data.companyCode,
      year: scope.data.year,
      month: scope.data.month,
      companyId: scope.data.companyId,
      periodId: scope.data.periodId,
    },
    actorUserId: userId,
  });
  const existing = await deps.findEvent(input.idempotencyKey);
  if (existing) {
    const same = existing.eventKind === "opened" && existing.requestFingerprint === requestFingerprint
      && existing.run.companyId === scope.data.companyId && existing.run.periodId === scope.data.periodId;
    if (!same) return failCommand("幂等键已用于不同的关账命令", 409, "idempotencyKey");
  } else if (scope.data.isPeriodClosed) {
    return failCommand("会计期间已关闭，不能开启新的关账运行", 409, "month");
  }
  return okCommand<OpenFinanceCloseCommand>({
    ...scope.data, actorUserId: userId, idempotencyKey: input.idempotencyKey,
    requestFingerprint, idempotentRunId: existing?.run.id ?? null,
  });
}

export async function buildRefreshFinanceCloseCommand(input: RefreshFinanceCloseInput, userId: number, deps = closeValidationDependencies) {
  const invalidUser = await validateUser(userId, deps);
  if (invalidUser) return invalidUser;
  const run = await deps.findRun(input.runId);
  if (!run) return failCommand("关账运行不存在", 404, "runId");
  if (!run.company.isActive) return failCommand("关账运行所属公司未启用", 409, "runId");
  if (run.period.companyCode !== run.company.code || run.periodId !== run.period.id) return failCommand("关账运行的公司与期间不一致", 409, "runId");
  if (run.status !== "open") return failCommand("仅开放中的关账运行可以刷新", 409, "runId");
  const scope = { companyCode: run.company.code, year: run.period.year, month: run.period.month };
  const requestFingerprint = sha256CanonicalJson({ kind: "finance_close_refresh", runId: input.runId, expectedVersion: input.expectedVersion, actorUserId: userId });
  const existing = await deps.findEvent(input.idempotencyKey);
  if (existing) {
    const same = existing.eventKind === "refreshed" && existing.requestFingerprint === requestFingerprint && existing.run.id === run.id;
    if (!same) return failCommand("幂等键已用于不同的关账命令", 409, "idempotencyKey");
  } else if (run.period.isClosed) {
    return failCommand("会计期间已关闭，不能刷新关账运行", 409, "runId");
  } else if (run.version !== input.expectedVersion) {
    return failCommand("关账运行版本已变化，请刷新后重试", 409, "expectedVersion");
  }
  return okCommand<RefreshFinanceCloseCommand>({
    ...scope, companyId: run.companyId, periodId: run.periodId, isPeriodClosed: run.period.isClosed,
    runId: run.id, expectedVersion: input.expectedVersion, actorUserId: userId,
    idempotencyKey: input.idempotencyKey, requestFingerprint, idempotentRunId: existing?.run.id ?? null,
  });
}
