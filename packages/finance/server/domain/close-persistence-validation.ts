import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import {
  FINANCE_CLOSE_WORKPAPER_TASK_KEYS,
  financeCloseWorkpaperReviewIdempotencyKey,
} from "../../types/close";
import { sha256CanonicalJson } from "../close/canonical-json";
import type { CompleteFinanceCloseCommand, OpenFinanceCloseCommand, RefreshFinanceCloseCommand } from "../close/command-types";
import type {
  ReviewFinanceCloseWorkpaperCommand,
  SaveFinanceCloseWorkpaperCommand,
} from "../close/workpaper-validation";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const WORKPAPER_TASK_KEYS = new Set<string>(FINANCE_CLOSE_WORKPAPER_TASK_KEYS);

export type FinanceCloseEvidenceSnapshotPersistenceInput<TPayload = unknown> = {
  taskId: number;
  taskKey: string;
  inputFingerprint: string;
  contributorVersion: string;
  payloadSha256: string;
  payload: TPayload;
};

function positiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

function validScope(command: {
  companyCode: string;
  year: number;
  month: number;
  companyId: number;
  periodId: number;
}) {
  return Boolean(command.companyCode.trim())
    && Number.isInteger(command.year) && command.year >= 2000 && command.year <= 2100
    && Number.isInteger(command.month) && command.month >= 1 && command.month <= 12
    && positiveInteger(command.companyId)
    && positiveInteger(command.periodId);
}

export function validateFinanceCloseEvidenceSnapshotPersistence<TPayload>(
  input: FinanceCloseEvidenceSnapshotPersistenceInput<TPayload>,
) {
  if (!positiveInteger(input.taskId)) return failCommand("关账任务标识无效", 400, "taskId");
  if (!input.taskKey.trim()) return failCommand("关账任务键为空", 400, "taskKey");
  if (!SHA256_PATTERN.test(input.inputFingerprint)) return failCommand("关账输入指纹无效", 400, "inputFingerprint");
  if (!input.contributorVersion.trim()) return failCommand("关账贡献器版本为空", 400, "contributorVersion");
  if (!SHA256_PATTERN.test(input.payloadSha256)) return failCommand("关账证据指纹无效", 400, "payloadSha256");
  if (sha256CanonicalJson(input.payload) !== input.payloadSha256) {
    return failCommand("关账证据内容与指纹不一致", 409, "payloadSha256");
  }
  return okCommand(input);
}

export function validateOpenFinanceClosePersistenceCommand(command: OpenFinanceCloseCommand) {
  if (!validScope(command) || !positiveInteger(command.actorUserId)) {
    return failCommand("关账开启命令的公司、期间或操作人无效", 400);
  }
  if (!command.idempotencyKey.trim()) return failCommand("关账开启幂等键为空", 400, "idempotencyKey");
  if (command.idempotentRunId !== null && !positiveInteger(command.idempotentRunId)) {
    return failCommand("关账幂等运行标识无效", 400, "idempotentRunId");
  }
  const expectedFingerprint = sha256CanonicalJson({
    kind: "finance_close_open",
    scope: {
      companyCode: command.companyCode,
      year: command.year,
      month: command.month,
      companyId: command.companyId,
      periodId: command.periodId,
    },
    actorUserId: command.actorUserId,
  });
  if (command.requestFingerprint !== expectedFingerprint) {
    return failCommand("关账开启命令指纹与已解析范围不一致", 409, "requestFingerprint");
  }
  if (command.isPeriodClosed && command.idempotentRunId === null) {
    return failCommand("会计期间已关闭，不能开启新的关账运行", 409, "month");
  }
  return okCommand(command);
}

export function validateRefreshFinanceClosePersistenceCommand(command: RefreshFinanceCloseCommand) {
  if (!validScope(command) || !positiveInteger(command.actorUserId) || !positiveInteger(command.runId)) {
    return failCommand("关账刷新命令的运行、公司、期间或操作人无效", 400);
  }
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion <= 0) {
    return failCommand("关账运行版本无效", 400, "expectedVersion");
  }
  if (!command.idempotencyKey.trim()) return failCommand("关账刷新幂等键为空", 400, "idempotencyKey");
  if (command.idempotentRunId !== null && command.idempotentRunId !== command.runId) {
    return failCommand("关账刷新幂等运行与目标运行不一致", 409, "idempotentRunId");
  }
  const expectedFingerprint = sha256CanonicalJson({
    kind: "finance_close_refresh",
    runId: command.runId,
    expectedVersion: command.expectedVersion,
    actorUserId: command.actorUserId,
  });
  if (command.requestFingerprint !== expectedFingerprint) {
    return failCommand("关账刷新命令指纹与目标运行不一致", 409, "requestFingerprint");
  }
  if (command.isPeriodClosed && command.idempotentRunId === null) {
    return failCommand("会计期间已关闭，不能刷新关账运行", 409, "runId");
  }
  return okCommand(command);
}

export function validateCompleteFinanceClosePersistenceCommand(command: CompleteFinanceCloseCommand) {
  if (!validScope(command) || !positiveInteger(command.actorUserId) || !positiveInteger(command.runId)) {
    return failCommand("关账完成命令的运行、公司、期间或操作人无效", 400);
  }
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion <= 0) {
    return failCommand("关账运行版本无效", 400, "expectedVersion");
  }
  if (!command.idempotencyKey.trim()) return failCommand("关账完成幂等键为空", 400, "idempotencyKey");
  if (command.idempotentRunId !== null && command.idempotentRunId !== command.runId) {
    return failCommand("关账完成幂等运行与目标运行不一致", 409, "idempotentRunId");
  }
  const expectedFingerprint = sha256CanonicalJson({
    kind: "finance_close_complete",
    runId: command.runId,
    expectedVersion: command.expectedVersion,
    actorUserId: command.actorUserId,
  });
  if (command.requestFingerprint !== expectedFingerprint) {
    return failCommand("关账完成命令指纹与目标运行不一致", 409, "requestFingerprint");
  }
  if (command.isPeriodClosed && command.idempotentRunId === null) {
    return failCommand("会计期间已关闭，不能重复完成关账", 409, "runId");
  }
  return okCommand(command);
}

function validWorkpaperScope(command: SaveFinanceCloseWorkpaperCommand | ReviewFinanceCloseWorkpaperCommand) {
  return validScope(command)
    && command.input.companyCode === command.companyCode
    && command.input.year === command.year
    && command.input.month === command.month
    && WORKPAPER_TASK_KEYS.has(command.input.taskKey)
    && positiveInteger(command.actorUserId)
    && Boolean(command.input.idempotencyKey.trim());
}

function canonicalStringArray(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function validateSaveFinanceCloseWorkpaperPersistenceCommand(command: SaveFinanceCloseWorkpaperCommand) {
  if (!validWorkpaperScope(command)) return failCommand("关账底稿保存命令的范围、任务或操作人无效", 400);
  const expectedFingerprint = sha256CanonicalJson({
    kind: "finance_close_workpaper_save",
    input: command.input,
    actorUserId: command.actorUserId,
  });
  if (command.requestFingerprint !== expectedFingerprint) {
    return failCommand("关账底稿保存命令指纹不一致", 409, "requestFingerprint");
  }
  if (JSON.stringify(command.input.evidenceRefs) !== JSON.stringify(canonicalStringArray(command.input.evidenceRefs))
    || JSON.stringify(command.input.voucherRefs) !== JSON.stringify(canonicalStringArray(command.input.voucherRefs))) {
    return failCommand("关账底稿证据引用未规范化", 400, "evidenceRefs");
  }
  if (command.input.status !== "draft" && !command.input.conclusion?.trim()) {
    return failCommand("提交或阻断底稿必须填写结论", 400, "conclusion");
  }
  if (command.idempotentWorkpaperId !== null) {
    return positiveInteger(command.idempotentWorkpaperId)
      ? okCommand(command)
      : failCommand("关账底稿幂等记录标识无效", 400, "idempotentWorkpaperId");
  }
  if (command.isPeriodClosed) return failCommand("会计期间已关闭，不能修改关账底稿", 409, "month");
  if (command.existing) {
    if (command.existing.companyId !== command.companyId
      || command.existing.periodId !== command.periodId
      || command.existing.taskKey !== command.input.taskKey
      || command.input.expectedVersion !== command.existing.version) {
      return failCommand("关账底稿写入目标与已验证记录不一致", 409, "expectedVersion");
    }
  } else if (command.input.expectedVersion !== null) {
    return failCommand("新建关账底稿不得携带版本", 409, "expectedVersion");
  }
  return okCommand(command);
}

export function validateReviewFinanceCloseWorkpaperPersistenceCommand(command: ReviewFinanceCloseWorkpaperCommand) {
  if (!validWorkpaperScope(command)) return failCommand("关账底稿复核命令的范围、任务或操作人无效", 400);
  const expectedFingerprint = sha256CanonicalJson({
    kind: "finance_close_workpaper_review",
    input: command.input,
    actorUserId: command.actorUserId,
  });
  if (command.requestFingerprint !== expectedFingerprint) {
    return failCommand("关账底稿复核命令指纹不一致", 409, "requestFingerprint");
  }
  if (command.idempotentWorkpaperId !== null) {
    return positiveInteger(command.idempotentWorkpaperId)
      ? okCommand(command)
      : failCommand("关账底稿幂等记录标识无效", 400, "idempotentWorkpaperId");
  }
  if (command.isPeriodClosed) return failCommand("会计期间已关闭，不能复核关账底稿", 409, "month");
  if (command.existing.companyId !== command.companyId
    || command.existing.periodId !== command.periodId
    || command.existing.taskKey !== command.input.taskKey
    || command.existing.version !== command.input.expectedVersion
    || command.existing.status !== "prepared") {
    return failCommand("关账底稿复核目标的范围、版本或状态不一致", 409, "expectedVersion");
  }
  if (command.existing.preparedByUserId === command.actorUserId) {
    return failCommand("复核人不能与编制人相同", 409, "actorUserId");
  }
  if (!command.existing.conclusion?.trim()) return failCommand("关账底稿缺少结论", 409, "conclusion");
  const expectedIdempotencyKey = financeCloseWorkpaperReviewIdempotencyKey(
    command.existing.id,
    command.input.expectedVersion,
    command.actorUserId,
  );
  if (command.input.idempotencyKey !== expectedIdempotencyKey) {
    return failCommand("复核幂等键未绑定当前底稿、版本和复核人", 400, "idempotencyKey");
  }
  return okCommand(command);
}
