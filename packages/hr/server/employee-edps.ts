import { serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { buildSaveEmployeeEdpsCommand } from "./domain/employee-edp-validation";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";

export async function updateEmployeeProfileEdps(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<DomainServiceResult<{ success: true; ids: number[] }>> {
  const command = mapValidationToServiceResult(await buildSaveEmployeeEdpsCommand(employeeId, rows));
  if (!command.ok) return command;

  const changedIds: number[] = [];
  const { rows: normalizedRows } = command.data;

  const persisted = await prisma.$transaction(async (tx) => {
    for (const row of normalizedRows) {
      const { id: rowId, ...data } = row;
      if (rowId) {
        await ensureEditHistoryBaseline("EDP", rowId, userId, tx);
        await tx.eDP.update({
          where: { id: rowId },
          data: { ...data, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory("EDP", rowId, userId, tx);
        changedIds.push(rowId);
      } else {
        const created = await tx.eDP.create({
          data: { ...data, editedBy: userId },
          select: { id: true },
        });
        await snapshotHistory("EDP", created.id, userId, tx);
        changedIds.push(created.id);
      }
    }
    return serviceOk({ success: true as const, ids: changedIds });
  });
  if (persisted.ok) await queueHrDataQualityEvaluation("Employee", [employeeId]);
  return persisted;
}
