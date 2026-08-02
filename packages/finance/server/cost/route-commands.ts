import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/service-result";
import { okCommand } from "@workspace/platform/server/domain-validation";

import { buildFinanceIdCommand } from "../domain/shared-validation";
import { deleteImportById, getImportById, listImports } from "./import";

export function buildFinanceRouteIdCommand(id: unknown) {
  return buildFinanceIdCommand(id);
}

export function buildFinanceActorRouteIdCommand(id: unknown, userId: number) {
  const command = buildFinanceIdCommand(id);
  return command.ok ? okCommand({ ...command.data, userId }) : command;
}

export async function executeGetCostImportCommand(
  command: { id: number },
): Promise<ServiceResult<{ success: true; data: Awaited<ReturnType<typeof getImportById>> }>> {
  const data = await getImportById(command.id);
  if (!data) return serviceError("记录不存在", 404);
  return serviceOk({ success: true, data });
}

export async function executeDeleteCostImportCommand(command: { id: number; userId: number }) {
  const existing = await getImportById(command.id);
  if (!existing) return serviceError("记录不存在", 404);
  const result = await deleteImportById(command.id, command.userId);
  if (!result.success) return serviceError(result.error, result.status);
  return serviceOk({ success: true });
}

export async function executeListCostImportsCommand(command: { importId?: number; page?: number; pageSize?: number }) {
  const result = await listImports(command);
  return { success: true, ...result };
}

export function executeUnsupportedCostImportCommand() {
  return serviceError("请使用导入脚本: node --import tsx scripts/import/import-finance-cost-json.mjs", 400);
}
