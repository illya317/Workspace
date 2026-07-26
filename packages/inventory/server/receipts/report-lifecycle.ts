import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { getUserBusinessActorIdentity } from "@workspace/platform/server/user-identity";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import { defineBusinessActionCommandAdapter } from "@workspace/platform/server/business-action-executor";
import {
  buildReceiptReportConfirmCommand,
  buildReceiptReportReviewCommand,
  type ReceiptReportActionCommand,
} from "../domain/inventory-receipts-validation";
import type { InventoryReceiptReportActionInput } from "./schemas";
import { buildReceiptReportSnapshot, isLegacyReceiptSnapshotCurrent } from "./report-summary";

type ReportActionInput = { reportId: number; body: InventoryReceiptReportActionInput; userId: number };

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

async function actor(userId: number) {
  const identity = await getUserBusinessActorIdentity(userId);
  if (!identity) return null;
  return {
    userId,
    displayName: identity.actorName,
    comparableNames: new Set([identity.actorName.replace(/\s+/g, "")]),
  };
}

export async function commitReceiptReportConfirmCommand(command: ReceiptReportActionCommand) {
  const signer = await actor(command.userId);
  if (!signer) return serviceError("操作账号未关联员工且不是管理员，不能确认月度汇总", 403);
  try {
    const result = await runSerializableTransaction(async (tx) => {
      const built = await buildReceiptReportSnapshot(tx, command.reportId);
      if (!built) return { ok: false as const, status: 404, message: "月度汇总不存在" };
      if (built.report.version !== command.expectedVersion) return { ok: false as const, status: 409, message: "月度汇总已被其他人修改，请刷新后重试" };
      if (built.report.status !== "draft") return { ok: false as const, status: 409, message: "该月度汇总已确认，不能重复确认" };
      if (built.rows.length === 0) return { ok: false as const, status: 400, message: "空月报不能确认" };
      if (built.rows.some((row) => row.productId === null)) {
        return { ok: false as const, status: 400, message: "请先为本月全部产品关联产品主数据" };
      }
      if (built.rows.some((row) => row.productWorkPointId === null || row.workPoints === null)) {
        return { ok: false as const, status: 400, message: "请先为本月全部产品填写工分" };
      }
      const preparedAt = new Date();
      const nextVersion = built.report.version + 1;
      const updated = await tx.inventoryReceiptReport.updateMany({
        where: { id: command.reportId, version: command.expectedVersion, status: "draft" },
        data: {
          status: "submitted",
          preparedBy: signer.displayName,
          preparedByUserId: signer.userId,
          preparedAt,
          reviewedBy: null,
          reviewedByUserId: null,
          reviewedAt: null,
          confirmedSnapshot: built.snapshot as Prisma.InputJsonValue,
          confirmedSnapshotHash: built.hash,
          confirmationSource: "system",
          updatedByUserId: signer.userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return { ok: false as const, status: 409, message: "月度汇总已被其他人修改，请刷新后重试" };
      await tx.inventoryReceiptReportEvent.create({ data: {
        reportId: command.reportId,
        eventType: "confirmed",
        actorUserId: signer.userId,
        actorName: signer.displayName,
        reportVersion: nextVersion,
        snapshotHash: built.hash,
        payload: { preparedAt: preparedAt.toISOString(), source: "system" },
      } });
      return { ok: true as const, version: nextVersion };
    });
    return result.ok ? serviceOk({ success: true, status: "submitted", version: result.version }) : serviceError(result.message, result.status);
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    throw error;
  }
}

export async function commitReceiptReportReviewCommand(command: ReceiptReportActionCommand) {
  const reviewer = await actor(command.userId);
  if (!reviewer) return serviceError("操作账号未关联员工且不是管理员，不能复核月度汇总", 403);
  try {
    const result = await runSerializableTransaction(async (tx) => {
      const built = await buildReceiptReportSnapshot(tx, command.reportId);
      if (!built) return { ok: false as const, status: 404, message: "月度汇总不存在" };
      if (built.report.version !== command.expectedVersion) return { ok: false as const, status: 409, message: "月度汇总已被其他人修改，请刷新后重试" };
      if (built.report.status !== "submitted") return { ok: false as const, status: 409, message: built.report.status === "approved" ? "该月度汇总已复核" : "请先确认月度汇总" };
      const preparerName = built.report.preparedBy?.replace(/\s+/g, "") ?? "";
      if (built.report.preparedByUserId === reviewer.userId || (preparerName && reviewer.comparableNames.has(preparerName))) {
        return { ok: false as const, status: 403, message: "制表人与复核人必须为不同人员" };
      }
      const upgradesLegacySnapshot = built.report.confirmedSnapshotHash !== built.hash
        && isLegacyReceiptSnapshotCurrent(built);
      if (!built.report.confirmedSnapshotHash || (built.report.confirmedSnapshotHash !== built.hash && !upgradesLegacySnapshot)) {
        return { ok: false as const, status: 409, message: "确认后的汇总数据已变化，不能复核" };
      }
      const reviewedAt = new Date();
      const nextVersion = built.report.version + 1;
      const updated = await tx.inventoryReceiptReport.updateMany({
        where: { id: command.reportId, version: command.expectedVersion, status: "submitted" },
        data: {
          status: "approved",
          reviewedBy: reviewer.displayName,
          reviewedByUserId: reviewer.userId,
          reviewedAt,
          ...(upgradesLegacySnapshot ? {
            confirmedSnapshot: built.snapshot as Prisma.InputJsonValue,
            confirmedSnapshotHash: built.hash,
          } : {}),
          updatedByUserId: reviewer.userId,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return { ok: false as const, status: 409, message: "月度汇总已被其他人修改，请刷新后重试" };
      if (upgradesLegacySnapshot) {
        await tx.inventoryReceiptReportEvent.create({ data: {
          reportId: command.reportId,
          eventType: "confirmation_recalculated",
          actorUserId: reviewer.userId,
          actorName: reviewer.displayName,
          reportVersion: nextVersion,
          snapshotHash: built.hash,
          payload: {
            previousSnapshotHash: built.report.confirmedSnapshotHash,
            source: "legacy_workbook",
            reason: "product_master_reference_backfill",
          },
        } });
      }
      await tx.inventoryReceiptReportEvent.create({ data: {
        reportId: command.reportId,
        eventType: "reviewed",
        actorUserId: reviewer.userId,
        actorName: reviewer.displayName,
        reportVersion: nextVersion,
        snapshotHash: built.hash,
        payload: { reviewedAt: reviewedAt.toISOString(), preparedBy: built.report.preparedBy },
      } });
      return { ok: true as const, version: nextVersion };
    });
    return result.ok ? serviceOk({ success: true, status: "approved", version: result.version }) : serviceError(result.message, result.status);
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    throw error;
  }
}

const confirmAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "inventory.receipts.report.confirm",
  validatorKey: "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptReportConfirmCommand",
  commitKey: "packages/inventory/server/receipts/report-lifecycle.commitReceiptReportConfirmCommand",
  validate: (input: ReportActionInput) => {
    const command = buildReceiptReportConfirmCommand(input.reportId, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitReceiptReportConfirmCommand,
});

const reviewAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "inventory.receipts.report.review",
  validatorKey: "packages/inventory/server/domain/inventory-receipts-validation.buildReceiptReportReviewCommand",
  commitKey: "packages/inventory/server/receipts/report-lifecycle.commitReceiptReportReviewCommand",
  validate: (input: ReportActionInput) => {
    const command = buildReceiptReportReviewCommand(input.reportId, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitReceiptReportReviewCommand,
});

export async function executeReceiptReportConfirmCommand(input: ReportActionInput) {
  const command = await confirmAdapter.validate(input, undefined);
  return command.ok ? confirmAdapter.commit(command.data, undefined) : command;
}

export async function executeReceiptReportReviewCommand(input: ReportActionInput) {
  const command = await reviewAdapter.validate(input, undefined);
  return command.ok ? reviewAdapter.commit(command.data, undefined) : command;
}
