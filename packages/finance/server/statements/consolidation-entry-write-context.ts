import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";

import { loadConsolidationBatchRow } from "./consolidation-dto";

export class ConsolidationEntryError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function directAction(
  actionKey: string,
  userId: number,
  blockedMessage: string,
) {
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey: actionKey,
    actorUserId: userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage,
  });
}

export async function loadDraftBatch(batchId: number) {
  const batch = await loadConsolidationBatchRow(batchId);
  if (!batch) throw new ConsolidationEntryError("合并批次不存在", 404);
  if (batch.status !== "draft") {
    throw new ConsolidationEntryError("只有草稿批次允许编制抵销和税务底稿", 409);
  }
  return batch;
}
