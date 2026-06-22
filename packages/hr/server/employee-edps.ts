import { snapshotHistory } from "@workspace/platform/server/history";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { buildSaveEmployeeEdpsCommand } from "./domain/edp-validation";

export async function updateEmployeeProfileEdps(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<DomainServiceResult<{ success: true; ids: number[]; deletedIds: number[] }>> {
  const command = mapValidationToServiceResult(await buildSaveEmployeeEdpsCommand(employeeId, rows));
  if (!command.ok) return command;

  const changedIds: number[] = [];
  const { rows: normalizedRows, deletedIds } = command.data;

  await Promise.all(deletedIds.map((rowId) => snapshotHistory("EDP", rowId, userId)));
  await prisma.$transaction(async (tx) => {
    for (const rowId of deletedIds) {
      await tx.eDP.delete({ where: { id: rowId } });
    }
    for (const row of normalizedRows) {
      const { id: rowId, ...data } = row;
      if (rowId) {
        await tx.eDP.update({
          where: { id: rowId },
          data: { ...data, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
        });
        changedIds.push(rowId);
      } else {
        const created = await tx.eDP.create({
          data: { ...data, editedBy: userId },
          select: { id: true },
        });
        changedIds.push(created.id);
      }
    }
  });

  await Promise.all(changedIds.map((rowId) => snapshotHistory("EDP", rowId, userId)));
  return { ok: true, data: { success: true, ids: changedIds, deletedIds } };
}
