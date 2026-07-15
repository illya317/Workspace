import type {
  ConsolidatedReportOutputPackage,
  ConsolidationBatchSnapshot,
} from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  failCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { buildConsolidatedReportOutput } from "./consolidated-output";
import {
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import {
  prepareConsolidatedOutputSnapshot,
  readConsolidatedOutputSnapshot,
  type PreparedConsolidatedOutputSnapshot,
} from "./consolidated-output-snapshots";
import { buildConsolidationReplayPackage } from "./consolidation-replay";

export type ConsolidatedOutputBuildMode = "official" | "lockCandidate";

export function buildConsolidatedOutputFromBatchSnapshot(
  batch: ConsolidationBatchSnapshot,
  mode: ConsolidatedOutputBuildMode = "official",
  generatedAt = new Date(),
): DomainValidationResult<ConsolidatedReportOutputPackage> {
  if (mode === "official" && batch.status !== "locked" && batch.status !== "published") {
    return failCommand("只有已锁定或已发布的合并批次可以生成正式报表", 409, "status");
  }
  if (mode === "lockCandidate" && batch.status !== "reviewed") {
    return failCommand("只有已复核的合并批次可以执行锁定前输出校验", 409, "status");
  }
  const replaySnapshot: ConsolidationBatchSnapshot = mode === "lockCandidate"
    ? { ...batch, status: "locked" }
    : batch;
  const functionalCurrencyByEntitySnapshotId = new Map<number, string>();
  for (const entity of batch.entities) {
    const functionalCurrency = entity.functionalCurrency?.trim();
    if (!functionalCurrency) {
      return failCommand(`合并实体 ${entity.companyCode} 缺少批次冻结的本位币`, 409, "functionalCurrency");
    }
    functionalCurrencyByEntitySnapshotId.set(entity.id, functionalCurrency);
  }
  const replay = buildConsolidationReplayPackage(replaySnapshot);
  if (!replay.ok) return replay;
  return buildConsolidatedReportOutput(replay.data, functionalCurrencyByEntitySnapshotId, generatedAt);
}

export function prepareLockedConsolidatedOutputSnapshot(
  batch: ConsolidationBatchSnapshot,
  lockedBy: number,
  generatedAt: Date,
): DomainValidationResult<PreparedConsolidatedOutputSnapshot> {
  const lockedBatch: ConsolidationBatchSnapshot = {
    ...batch,
    revision: batch.revision + 1,
    status: "locked",
    lockedBy,
    lockedAt: generatedAt.toISOString(),
  };
  const output = buildConsolidatedOutputFromBatchSnapshot(lockedBatch, "official", generatedAt);
  return output.ok
    ? { ok: true, data: prepareConsolidatedOutputSnapshot(lockedBatch, output.data, generatedAt) }
    : output;
}

export async function loadConsolidatedReportOutput(batchId: number) {
  if (!Number.isInteger(batchId) || batchId <= 0) return serviceError("合并批次 ID 无效", 400);
  const row = await loadConsolidationBatchRow(batchId);
  if (!row) return serviceError("合并批次不存在", 404);
  if (row.status !== "locked" && row.status !== "published") {
    return serviceError("只有已锁定或已发布的合并批次可以查看正式报表", 409);
  }
  const output = readConsolidatedOutputSnapshot(
    row.outputSnapshot,
    batchId,
    consolidationBatchSnapshot(row),
  );
  return output.ok
    ? serviceOk({
        report: output.data,
        lifecycle: {
          status: row.status as "locked" | "published",
          lockedBy: row.lockedBy,
          lockedAt: row.lockedAt?.toISOString() ?? null,
          publishedBy: row.publishedBy,
          publishedAt: row.publishedAt?.toISOString() ?? null,
        },
      })
    : serviceError(output.issue.message, output.issue.status);
}
