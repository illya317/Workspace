import type { DeleteConsolidationMutationInput } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface DeleteConsolidationBatchCommand {
  batchId: number;
  expectedRevision: number;
  note: string;
  userId: number;
}

export function buildDeleteConsolidationBatchCommand(
  batchIdValue: unknown,
  raw: DeleteConsolidationMutationInput,
  userId: number,
): DomainValidationResult<DeleteConsolidationBatchCommand> {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  const batchId = Number(batchIdValue);
  if (!Number.isInteger(batchId) || batchId <= 0) return failCommand("合并批次ID无效", 400, "batchId");
  const expectedRevision = Number(raw.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) {
    return failCommand("合并批次修订号无效", 400, "expectedRevision");
  }
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (!note) return failCommand("删除草稿批次必须填写原因", 400, "note");
  return okCommand({ batchId, expectedRevision, note, userId });
}
