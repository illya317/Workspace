import { serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { buildEmployeeProfileContractsCommand } from "./domain/contract-validation";

export async function updateEmployeeProfileContracts(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<ServiceResult<{ success: true }>> {
  const command = mapValidationToServiceResult(await buildEmployeeProfileContractsCommand(employeeId, rows));
  if (!command.ok) return command;

  await prisma.$transaction(async (tx) => {
    for (const employment of command.data.employments) {
      await ensureEditHistoryBaseline("Employment", employment.id, userId, tx);
      await tx.employment.update({
        where: { id: employment.id },
        data: {
          contracts: JSON.stringify(command.data.grouped.get(employment.id) ?? []),
          editedBy: userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await snapshotHistory("Employment", employment.id, userId, tx);
    }
  });

  return serviceOk({ success: true });
}
