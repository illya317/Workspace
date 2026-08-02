import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  validateReviewFinanceCloseWorkpaperPersistenceCommand,
  validateSaveFinanceCloseWorkpaperPersistenceCommand,
} from "../domain/close-persistence-validation";
import type { FinanceCloseWorkpaperDto, FinanceCloseWorkpaperTaskKey } from "../../types/close";
import type { ResolvedFinanceCloseScope } from "./validation";
import type { ReviewFinanceCloseWorkpaperCommand, SaveFinanceCloseWorkpaperCommand } from "./workpaper-validation";
import { stringArray } from "./workpaper-validation";
import { financeCloseReviewedWorkpaperSnapshot } from "./workpaper-event-snapshot";

type WorkpaperRow = {
  id: number;
  companyId: number;
  periodId: number;
  taskKey: string;
  status: string;
  conclusion: string | null;
  evidenceRefs: unknown;
  voucherRefs: unknown;
  preparedByUserId: number | null;
  preparedAt: Date | null;
  reviewedByUserId: number | null;
  reviewedAt: Date | null;
  version: number;
  updatedAt: Date;
};

type WorkpaperTransactionClient = Pick<Prisma.TransactionClient, "financeCloseWorkpaper" | "financeCloseWorkpaperEvent">;
type ReplayEvent = {
  workpaperId: number;
  eventKind: string;
  requestFingerprint: string;
  workpaper: WorkpaperRow;
};

export type FinanceCloseWorkpaperServiceDependencies = {
  transaction<T>(operation: (tx: WorkpaperTransactionClient) => Promise<T>): Promise<T>;
  findWorkpaper(id: number): Promise<WorkpaperRow | null>;
  findEvent(idempotencyKey: string): Promise<ReplayEvent | null>;
};

const defaultDependencies: FinanceCloseWorkpaperServiceDependencies = {
  transaction: (operation) => prisma.$transaction((tx) => operation(tx)),
  findWorkpaper: (id) => prisma.financeCloseWorkpaper.findUnique({ where: { id } }),
  findEvent: (idempotencyKey) => prisma.financeCloseWorkpaperEvent.findUnique({
    where: { idempotencyKey },
    select: {
      workpaperId: true, eventKind: true, requestFingerprint: true,
      workpaper: true,
    },
  }),
};

function dto(row: WorkpaperRow): FinanceCloseWorkpaperDto {
  return {
    id: row.id,
    taskKey: row.taskKey as FinanceCloseWorkpaperTaskKey,
    status: row.status as FinanceCloseWorkpaperDto["status"],
    conclusion: row.conclusion,
    evidenceRefs: stringArray(row.evidenceRefs),
    voucherRefs: stringArray(row.voucherRefs),
    preparedByUserId: row.preparedByUserId,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFinanceCloseWorkpapers(
  scope: ResolvedFinanceCloseScope,
  taskKey?: FinanceCloseWorkpaperTaskKey,
) {
  const rows = await prisma.financeCloseWorkpaper.findMany({
    where: { companyId: scope.companyId, periodId: scope.periodId, ...(taskKey ? { taskKey } : {}) },
    orderBy: [{ taskKey: "asc" }],
  });
  return { scope, workpapers: rows.map(dto) };
}

function snapshot(input: SaveFinanceCloseWorkpaperCommand["input"]) {
  return {
    taskKey: input.taskKey,
    status: input.status,
    conclusion: input.conclusion,
    evidenceRefs: input.evidenceRefs,
    voucherRefs: input.voucherRefs,
  };
}

export async function saveFinanceCloseWorkpaper(
  command: SaveFinanceCloseWorkpaperCommand,
  deps: FinanceCloseWorkpaperServiceDependencies = defaultDependencies,
) {
  const validated = validateSaveFinanceCloseWorkpaperPersistenceCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  command = validated.data;
  if (command.idempotentWorkpaperId) {
    const existing = await deps.findWorkpaper(command.idempotentWorkpaperId);
    return existing ? serviceOk(dto(existing)) : serviceError("幂等底稿不存在", 409);
  }
  try {
    const row = await deps.transaction(async (tx) => {
      const now = new Date();
      const prepared = command.input.status === "prepared" || command.input.status === "blocked";
      const data = {
        status: command.input.status,
        conclusion: command.input.conclusion,
        evidenceRefs: command.input.evidenceRefs as Prisma.InputJsonValue,
        voucherRefs: command.input.voucherRefs as Prisma.InputJsonValue,
        preparedByUserId: prepared ? command.actorUserId : null,
        preparedAt: prepared ? now : null,
        reviewedByUserId: null,
        reviewedAt: null,
      };
      let workpaper;
      if (command.existing) {
        const updated = await tx.financeCloseWorkpaper.updateMany({
          where: { id: command.existing.id, version: command.existing.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new CloseWorkpaperConflict("关账底稿版本已变化，请刷新后重试");
        workpaper = await tx.financeCloseWorkpaper.findUniqueOrThrow({ where: { id: command.existing.id } });
      } else {
        workpaper = await tx.financeCloseWorkpaper.create({
          data: { companyId: command.companyId, periodId: command.periodId, taskKey: command.input.taskKey, ...data },
        });
      }
      await tx.financeCloseWorkpaperEvent.create({ data: {
        workpaperId: workpaper.id,
        actorUserId: command.actorUserId,
        eventKind: "saved",
        fromStatus: command.existing?.status ?? null,
        toStatus: command.input.status,
        snapshot: snapshot(command.input) as Prisma.InputJsonValue,
        idempotencyKey: command.input.idempotencyKey,
        requestFingerprint: command.requestFingerprint,
      } });
      return workpaper;
    });
    return serviceOk(dto(row));
  } catch (error) {
    if (error instanceof CloseWorkpaperConflict || prismaUniqueConflict(error)) {
      const replay = await findConcurrentReplay(deps, {
        idempotencyKey: command.input.idempotencyKey,
        eventKind: "saved",
        requestFingerprint: command.requestFingerprint,
        companyId: command.companyId,
        periodId: command.periodId,
        taskKey: command.input.taskKey,
        workpaperId: command.existing?.id,
      });
      if (replay) return serviceOk(dto(replay));
      return serviceError(error instanceof Error ? error.message : "关账底稿并发冲突", 409);
    }
    throw error;
  }
}

export async function reviewFinanceCloseWorkpaper(
  command: ReviewFinanceCloseWorkpaperCommand,
  deps: FinanceCloseWorkpaperServiceDependencies = defaultDependencies,
) {
  const validated = validateReviewFinanceCloseWorkpaperPersistenceCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  command = validated.data;
  if (command.idempotentWorkpaperId) {
    const existing = await deps.findWorkpaper(command.idempotentWorkpaperId);
    return existing ? serviceOk(dto(existing)) : serviceError("幂等底稿不存在", 409);
  }
  try {
    const row = await deps.transaction(async (tx) => {
      const updated = await tx.financeCloseWorkpaper.updateMany({
        where: { id: command.existing.id, version: command.existing.version, status: "prepared" },
        data: { status: "reviewed", reviewedByUserId: command.actorUserId, reviewedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new CloseWorkpaperConflict("关账底稿版本或状态已变化，请刷新后重试");
      const workpaper = await tx.financeCloseWorkpaper.findUniqueOrThrow({ where: { id: command.existing.id } });
      await tx.financeCloseWorkpaperEvent.create({ data: {
        workpaperId: workpaper.id,
        actorUserId: command.actorUserId,
        eventKind: "reviewed",
        fromStatus: command.existing.status,
        toStatus: "reviewed",
        snapshot: financeCloseReviewedWorkpaperSnapshot(workpaper) as Prisma.InputJsonValue,
        idempotencyKey: command.input.idempotencyKey,
        requestFingerprint: command.requestFingerprint,
      } });
      return workpaper;
    });
    return serviceOk(dto(row));
  } catch (error) {
    if (error instanceof CloseWorkpaperConflict || prismaUniqueConflict(error)) {
      const replay = await findConcurrentReplay(deps, {
        idempotencyKey: command.input.idempotencyKey,
        eventKind: "reviewed",
        requestFingerprint: command.requestFingerprint,
        companyId: command.companyId,
        periodId: command.periodId,
        taskKey: command.input.taskKey,
        workpaperId: command.existing.id,
      });
      if (replay) return serviceOk(dto(replay));
      return serviceError(error instanceof Error ? error.message : "关账底稿并发冲突", 409);
    }
    throw error;
  }
}

class CloseWorkpaperConflict extends Error {}

function prismaUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

async function findConcurrentReplay(
  deps: FinanceCloseWorkpaperServiceDependencies,
  expected: {
    idempotencyKey: string;
    eventKind: "saved" | "reviewed";
    requestFingerprint: string;
    companyId: number;
    periodId: number;
    taskKey: string;
    workpaperId?: number;
  },
) {
  const event = await deps.findEvent(expected.idempotencyKey);
  if (!event
    || event.eventKind !== expected.eventKind
    || event.requestFingerprint !== expected.requestFingerprint
    || event.workpaperId !== event.workpaper.id
    || expected.workpaperId !== undefined && event.workpaperId !== expected.workpaperId
    || event.workpaper.companyId !== expected.companyId
    || event.workpaper.periodId !== expected.periodId
    || event.workpaper.taskKey !== expected.taskKey) return null;
  return event.workpaper;
}
