import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function nonEmptyText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateConsolidationRevisionClaim(input: {
  batchId: number;
  status: string;
  expectedRevision: number;
}): DomainValidationResult<{ valid: true }> {
  if (!positiveInteger(input.batchId)) return failCommand("合并批次ID无效", 400, "batchId");
  if (!nonEmptyText(input.status)) return failCommand("合并批次状态无效", 400, "status");
  if (!positiveInteger(input.expectedRevision)) return failCommand("合并批次修订号无效", 400, "expectedRevision");
  return okCommand({ valid: true });
}

export function validateConsolidationBatchEventPersistence(input: {
  batchId: number;
  eventType: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorUserId: number;
  actorName: string;
  batchRevision: number;
  targetId?: number | null;
}): DomainValidationResult<{ valid: true }> {
  if (!positiveInteger(input.batchId)) return failCommand("合并批次ID无效", 400, "batchId");
  if (input.eventType !== "lifecycle" && input.eventType !== "mutation") {
    return failCommand("合并批次事件类型无效", 400, "eventType");
  }
  if (!nonEmptyText(input.action)) return failCommand("合并批次事件动作无效", 400, "action");
  if (!nonEmptyText(input.fromStatus) || !nonEmptyText(input.toStatus)) {
    return failCommand("合并批次事件状态无效", 400, "status");
  }
  if (!positiveInteger(input.actorUserId)) return failCommand("合并批次事件操作人无效", 400, "actorUserId");
  if (!nonEmptyText(input.actorName)) return failCommand("合并批次事件操作人姓名无效", 400, "actorName");
  if (!positiveInteger(input.batchRevision)) return failCommand("合并批次事件修订号无效", 400, "batchRevision");
  if (input.targetId != null && !positiveInteger(input.targetId)) {
    return failCommand("合并批次事件目标ID无效", 400, "targetId");
  }
  return okCommand({ valid: true });
}

export function validateConsolidatedOutputSnapshotPersistence(input: {
  batchId: number;
  version: number;
  inputFingerprint: string;
  outputFingerprint: string;
  reportPayload: unknown;
  generatedAt: Date;
}): DomainValidationResult<{ valid: true }> {
  if (!positiveInteger(input.batchId)) return failCommand("合并输出快照批次ID无效", 400, "batchId");
  if (input.version !== 1) return failCommand("合并输出快照版本无效", 400, "version");
  if (!SHA256_FINGERPRINT.test(input.inputFingerprint)) return failCommand("合并输出输入指纹无效", 400, "inputFingerprint");
  if (!SHA256_FINGERPRINT.test(input.outputFingerprint)) return failCommand("合并输出结果指纹无效", 400, "outputFingerprint");
  if (!input.reportPayload || typeof input.reportPayload !== "object" || Array.isArray(input.reportPayload)) {
    return failCommand("合并输出快照正文无效", 400, "reportPayload");
  }
  if (!(input.generatedAt instanceof Date) || !Number.isFinite(input.generatedAt.getTime())) {
    return failCommand("合并输出快照生成时间无效", 400, "generatedAt");
  }
  return okCommand({ valid: true });
}
