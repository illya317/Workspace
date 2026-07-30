import { serviceError, serviceOk } from "@workspace/platform/server/api";
import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  validateCompleteFinanceClosePersistenceCommand,
  validateOpenFinanceClosePersistenceCommand,
  validateRefreshFinanceClosePersistenceCommand,
} from "../domain/close-persistence-validation";
import type { FinanceCloseBlockerDto, FinanceCloseTaskStatus, FinanceCloseWorkspaceDto } from "../../types/close";
import { FINANCE_CLOSE_TASK_CATALOG, financeCloseDeepLink } from "./catalog";
import { buildDefaultFinanceCloseProviderRegistry } from "./default-providers";
import {
  createOrReadFinanceCloseEvidenceSnapshot,
  FinanceCloseEvidenceSnapshotConflict,
} from "./evidence-snapshot-store";
import { inspectFinanceCloseContributors, planFinanceCloseRefresh, type FinanceCloseProviderRegistry } from "./providers";
import { deriveCloseProcessReviewPlan } from "./process-review-plan";
import type { CompleteFinanceCloseCommand, OpenFinanceCloseCommand, RefreshFinanceCloseCommand, ResolvedFinanceCloseScope } from "./validation";
import { applyHistoricalCutoverEvidencePolicy } from "./historical-cutover-evidence-policy";

class CloseConflict extends Error {}
type CloseTransactionClient = Pick<
  Prisma.TransactionClient,
  "financeCloseEvent" | "financeCloseRun" | "financeCloseTask" | "financeCloseEvidenceSnapshot" | "financePeriod"
>;
type CloseReplayEvent = {
  runId: number;
  eventKind: string;
  requestFingerprint: string | null;
  run: { id: number; companyId: number; periodId: number };
};
export type FinanceCloseServiceDependencies = {
  transaction<T>(operation: (tx: CloseTransactionClient) => Promise<T>): Promise<T>;
  findEvent(idempotencyKey: string): Promise<CloseReplayEvent | null>;
  loadWorkspace(scope: ResolvedFinanceCloseScope): Promise<FinanceCloseWorkspaceDto>;
};
export type RefreshFinanceCloseRuntime = {
  inventoryClosingContract?: InventoryClosingContract;
  providerRegistry?: FinanceCloseProviderRegistry;
  persistence?: FinanceCloseServiceDependencies;
};
const statuses: FinanceCloseTaskStatus[] = ["pending", "ready", "blocked", "unavailable"];
const status = (value: string): FinanceCloseTaskStatus => statuses.includes(value as FinanceCloseTaskStatus) ? value as FinanceCloseTaskStatus : "pending";
const date = (value: Date | null | undefined) => value?.toISOString() ?? null;

function snapshotProjection(payload: unknown, scope: ResolvedFinanceCloseScope) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const blockers = Array.isArray(row.blockers) ? row.blockers.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    return typeof value.code === "string" && typeof value.message === "string" && typeof value.deepLink === "string"
      ? [{ code: value.code, message: value.message, deepLink: financeCloseDeepLink(value.deepLink, scope) } satisfies FinanceCloseBlockerDto] : [];
  }) : [];
  return { blockers, evidenceRefs: strings(row.evidenceRefs), voucherRefs: strings(row.voucherRefs) };
}

async function loadFinanceCloseWorkspace(scope: ResolvedFinanceCloseScope): Promise<FinanceCloseWorkspaceDto> {
  const publicScope: ResolvedFinanceCloseScope = {
    companyCode: scope.companyCode,
    year: scope.year,
    month: scope.month,
    companyId: scope.companyId,
    periodId: scope.periodId,
    isPeriodClosed: scope.isPeriodClosed,
  };
  const run = await prisma.financeCloseRun.findUnique({
    where: { companyId_periodId: { companyId: scope.companyId, periodId: scope.periodId } },
    include: {
      tasks: {
        include: { events: { where: { eventKind: "task_refreshed" }, orderBy: { recordedAt: "desc" }, take: 1, include: { evidenceSnapshot: true } } },
      },
    },
  });
  const taskRows = new Map(run?.tasks.map((task) => [task.taskKey, task]) ?? []);
  const tasks = FINANCE_CLOSE_TASK_CATALOG.map((catalog) => {
    const row = taskRows.get(catalog.taskKey);
    const projection = snapshotProjection(row?.events[0]?.evidenceSnapshot?.payload, publicScope);
    return {
      ...catalog,
      deepLink: financeCloseDeepLink(row?.deepLink || catalog.deepLink, publicScope),
      id: row?.id ?? null,
      status: status(row?.status ?? "pending"),
      contributorVersion: row?.contributorVersion ?? null,
      inputFingerprint: row?.inputFingerprint ?? null,
      blockers: projection?.blockers ?? [], evidenceRefs: projection?.evidenceRefs ?? [], voucherRefs: projection?.voucherRefs ?? [],
      inspectedAt: date(row?.inspectedAt), version: row?.version ?? null,
    };
  });
  const statusCounts = { pending: 0, ready: 0, blocked: 0, unavailable: 0 };
  for (const task of tasks) statusCounts[task.status] += 1;
  return {
    scope: publicScope,
    run: run ? {
      id: run.id, companyId: run.companyId, periodId: run.periodId, startedByUserId: run.startedByUserId,
      status: run.status, version: run.version, openedAt: run.openedAt.toISOString(), completedAt: date(run.completedAt),
      createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString(),
    } : null,
    tasks,
    statusCounts,
  };
}

const defaultDependencies: FinanceCloseServiceDependencies = {
  transaction: (operation) => prisma.$transaction((tx) => operation(tx)),
  findEvent: (idempotencyKey) => prisma.financeCloseEvent.findUnique({
    where: { idempotencyKey },
    select: {
      runId: true, eventKind: true, requestFingerprint: true,
      run: { select: { id: true, companyId: true, periodId: true } },
    },
  }),
  loadWorkspace: loadFinanceCloseWorkspace,
};

export function listFinanceCloseWorkspace(scope: ResolvedFinanceCloseScope) {
  return loadFinanceCloseWorkspace(scope);
}

export async function openFinanceClose(
  command: OpenFinanceCloseCommand,
  deps: FinanceCloseServiceDependencies = defaultDependencies,
) {
  const validated = validateOpenFinanceClosePersistenceCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  command = validated.data;
  try {
    if (!command.idempotentRunId) {
      await deps.transaction(async (tx) => {
        const existingEvent = await tx.financeCloseEvent.findUnique({
          where: { idempotencyKey: command.idempotencyKey },
          select: {
            runId: true, eventKind: true, requestFingerprint: true,
            run: { select: { id: true, companyId: true, periodId: true } },
          },
        });
        if (existingEvent) {
          if (!closeEventMatches(existingEvent, command, "opened")) throw new CloseConflict("幂等键冲突");
          return;
        }
        const run = await tx.financeCloseRun.upsert({
          where: { companyId_periodId: { companyId: command.companyId, periodId: command.periodId } },
          create: { companyId: command.companyId, periodId: command.periodId, startedByUserId: command.actorUserId },
          update: {},
        });
        if (run.status !== "open") throw new CloseConflict("关账运行不是开放状态");
        for (const item of FINANCE_CLOSE_TASK_CATALOG) {
          await tx.financeCloseTask.upsert({
            where: { runId_taskKey: { runId: run.id, taskKey: item.taskKey } },
            create: { runId: run.id, taskKey: item.taskKey, contributorKey: item.contributorKey, ownerResourceKey: item.ownerResourceKey, label: item.label, deepLink: item.deepLink },
            update: { contributorKey: item.contributorKey, ownerResourceKey: item.ownerResourceKey, label: item.label, deepLink: item.deepLink },
          });
        }
        await tx.financeCloseEvent.create({ data: {
          runId: run.id, actorUserId: command.actorUserId, eventKind: "opened", toStatus: "open",
          idempotencyKey: command.idempotencyKey, requestFingerprint: command.requestFingerprint,
        } });
      });
    }
    return serviceOk(await deps.loadWorkspace(command));
  } catch (error) {
    if (error instanceof CloseConflict || prismaUniqueConflict(error)) {
      const replay = await deps.findEvent(command.idempotencyKey);
      if (closeEventMatches(replay, command, "opened")) return serviceOk(await deps.loadWorkspace(command));
      return serviceError(error instanceof CloseConflict ? error.message : "关账运行幂等冲突", 409);
    }
    throw error;
  }
}

function derivedTaskEventKey(root: string, taskKey: string) {
  return `${root}:task:${taskKey}`;
}

export async function refreshFinanceClose(
  command: RefreshFinanceCloseCommand,
  runtime: RefreshFinanceCloseRuntime = {},
) {
  const validated = validateRefreshFinanceClosePersistenceCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  command = validated.data;
  const registry = runtime.providerRegistry
    ?? buildDefaultFinanceCloseProviderRegistry(runtime.inventoryClosingContract);
  const deps = runtime.persistence ?? defaultDependencies;
  if (command.idempotentRunId) return serviceOk(await deps.loadWorkspace(command));

  // Contributor inspection is deliberately complete before the transaction begins.
  const inspections = await inspectFinanceCloseContributors(command, registry);
  const historicalFacts = await prisma.financePeriod.findUnique({
    where: { id: command.periodId },
    select: {
      sourceClosed: true,
      _count: { select: { balances: true } },
      vouchers: { where: { status: "posted" }, select: { id: true }, orderBy: { id: "asc" } },
    },
  });
  const governedInspections = applyHistoricalCutoverEvidencePolicy(inspections, {
    enabled: command.year === 2026 && command.month === 6 && historicalFacts?.sourceClosed === true
      && historicalFacts._count.balances > 0 && historicalFacts.vouchers.length > 0,
    periodRef: `finance-period:${command.periodId}`,
    voucherRefs: historicalFacts?.vouchers.map((row) => `finance-voucher:${row.id}`) ?? [],
  });
  const plan = deriveCloseProcessReviewPlan(planFinanceCloseRefresh(governedInspections));
  try {
    await deps.transaction(async (tx) => {
      const existingEvent = await tx.financeCloseEvent.findUnique({
        where: { idempotencyKey: command.idempotencyKey },
        select: {
          runId: true, eventKind: true, requestFingerprint: true,
          run: { select: { id: true, companyId: true, periodId: true } },
        },
      });
      if (existingEvent) {
        if (!closeEventMatches(existingEvent, command, "refreshed")) throw new CloseConflict("幂等键冲突");
        return;
      }
      const claimed = await tx.financeCloseRun.updateMany({
        where: { id: command.runId, companyId: command.companyId, periodId: command.periodId, status: "open", version: command.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new CloseConflict("关账运行版本已变化，请刷新后重试");
      const inspectedAt = new Date();
      for (const planned of plan) {
        const catalog = FINANCE_CLOSE_TASK_CATALOG.find((item) => item.taskKey === planned.taskKey)!;
        const task = await tx.financeCloseTask.upsert({
          where: { runId_taskKey: { runId: command.runId, taskKey: catalog.taskKey } },
          create: { runId: command.runId, taskKey: catalog.taskKey, contributorKey: catalog.contributorKey, ownerResourceKey: catalog.ownerResourceKey, label: catalog.label, deepLink: catalog.deepLink },
          update: { contributorKey: catalog.contributorKey, ownerResourceKey: catalog.ownerResourceKey, label: catalog.label, deepLink: catalog.deepLink },
        });
        const evidence = await createOrReadFinanceCloseEvidenceSnapshot(tx, {
          taskId: task.id,
          taskKey: task.taskKey,
          inputFingerprint: planned.inspection.inputFingerprint,
          contributorVersion: planned.inspection.contributorVersion,
          payloadSha256: planned.payloadSha256,
          payload: planned.snapshotPayload as Prisma.InputJsonValue,
        });
        await tx.financeCloseTask.update({ where: { id: task.id }, data: {
          status: planned.inspection.status, contributorVersion: planned.inspection.contributorVersion,
          inputFingerprint: planned.inspection.inputFingerprint, inspectedAt, version: { increment: 1 },
        } });
        await tx.financeCloseEvent.create({ data: {
          runId: command.runId, taskId: task.id, evidenceSnapshotId: evidence.id, actorUserId: command.actorUserId,
          eventKind: "task_refreshed", fromStatus: task.status, toStatus: planned.inspection.status,
          idempotencyKey: derivedTaskEventKey(command.idempotencyKey, task.taskKey), requestFingerprint: command.requestFingerprint,
        } });
      }
      await tx.financeCloseEvent.create({ data: {
        runId: command.runId, actorUserId: command.actorUserId, eventKind: "refreshed", fromStatus: "open", toStatus: "open",
        idempotencyKey: command.idempotencyKey, requestFingerprint: command.requestFingerprint,
      } });
    });
    return serviceOk(await deps.loadWorkspace(command));
  } catch (error) {
    if (error instanceof CloseConflict || prismaUniqueConflict(error)) {
      const replay = await deps.findEvent(command.idempotencyKey);
      if (closeEventMatches(replay, command, "refreshed")) return serviceOk(await deps.loadWorkspace(command));
      return serviceError(error instanceof CloseConflict ? error.message : "关账刷新幂等冲突", 409);
    }
    if (error instanceof FinanceCloseEvidenceSnapshotConflict) return serviceError(error.message, 409);
    throw error;
  }
}

export async function completeFinanceClose(
  command: CompleteFinanceCloseCommand,
  deps: FinanceCloseServiceDependencies = defaultDependencies,
) {
  const validated = validateCompleteFinanceClosePersistenceCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  command = validated.data;
  if (command.idempotentRunId) {
    return serviceOk(await deps.loadWorkspace({ ...command, isPeriodClosed: true }));
  }
  try {
    await deps.transaction(async (tx) => {
      const existingEvent = await tx.financeCloseEvent.findUnique({
        where: { idempotencyKey: command.idempotencyKey },
        select: {
          runId: true, eventKind: true, requestFingerprint: true,
          run: { select: { id: true, companyId: true, periodId: true } },
        },
      });
      if (existingEvent) {
        if (!closeEventMatches(existingEvent, command, "completed")) throw new CloseConflict("幂等键冲突");
        return;
      }
      const tasks = await tx.financeCloseTask.findMany({
        where: { runId: command.runId },
        select: { taskKey: true, status: true },
      });
      const taskByKey = new Map(tasks.map((task) => [task.taskKey, task.status]));
      const notReady = FINANCE_CLOSE_TASK_CATALOG.filter((task) => taskByKey.get(task.taskKey) !== "ready");
      if (notReady.length > 0 || tasks.length !== FINANCE_CLOSE_TASK_CATALOG.length) {
        throw new CloseConflict(`仍有 ${notReady.length} 项关账任务未就绪，不能完成关账`);
      }
      const claimedRun = await tx.financeCloseRun.updateMany({
        where: {
          id: command.runId,
          companyId: command.companyId,
          periodId: command.periodId,
          status: "open",
          version: command.expectedVersion,
        },
        data: { status: "completed", completedAt: new Date(), version: { increment: 1 } },
      });
      if (claimedRun.count !== 1) throw new CloseConflict("关账运行版本已变化，请刷新后重试");
      const closedPeriod = await tx.financePeriod.updateMany({
        where: { id: command.periodId, companyCode: command.companyCode, isClosed: false },
        data: { isClosed: true },
      });
      if (closedPeriod.count !== 1) throw new CloseConflict("会计期间状态已变化，请刷新后重试");
      await tx.financeCloseEvent.create({ data: {
        runId: command.runId,
        actorUserId: command.actorUserId,
        eventKind: "completed",
        fromStatus: "open",
        toStatus: "completed",
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: command.requestFingerprint,
      } });
    });
    return serviceOk(await deps.loadWorkspace({ ...command, isPeriodClosed: true }));
  } catch (error) {
    if (error instanceof CloseConflict || prismaUniqueConflict(error)) {
      const replay = await deps.findEvent(command.idempotencyKey);
      if (closeEventMatches(replay, command, "completed")) {
        return serviceOk(await deps.loadWorkspace({ ...command, isPeriodClosed: true }));
      }
      return serviceError(error instanceof CloseConflict ? error.message : "关账完成幂等冲突", 409);
    }
    throw error;
  }
}

function closeEventMatches(
  event: CloseReplayEvent | null,
  command: OpenFinanceCloseCommand | RefreshFinanceCloseCommand | CompleteFinanceCloseCommand,
  eventKind: "opened" | "refreshed" | "completed",
) {
  return Boolean(event
    && event.eventKind === eventKind
    && event.requestFingerprint === command.requestFingerprint
    && event.runId === event.run.id
    && event.run.companyId === command.companyId
    && event.run.periodId === command.periodId
    && (!("runId" in command) || event.runId === command.runId));
}

function prismaUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}
