import type {
  ConsolidatedReportOutputPackage,
  ConsolidationBatchSnapshot,
  ConsolidationRateReferenceSnapshot,
} from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
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
import {
  buildConsolidationPreviewPackage,
  buildConsolidationReplayPackage,
} from "./consolidation-replay";
import { loadConsolidationPriorReferences } from "./consolidation-prior-reference";

export type ConsolidatedOutputBuildMode = "official" | "lockCandidate";

export function validateNciWorkpaperForLock(report: ConsolidatedReportOutputPackage): DomainValidationResult<true> {
  const workpaper = report.nciEquityWorkpaper;
  return workpaper?.status === "difference"
    ? failCommand(
        `少数股东权益变动表未勾稽，差额 ${workpaper.rollforwardDifference.toFixed(2)} 元；必须补齐有证据的权益变动凭证后再锁定`,
        409,
        "nciEquityWorkpaper",
      )
    : { ok: true, data: true };
}

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

const SUPPORTED_PREVIEW_RATE_KINDS = new Set([
  "centralParity",
  "monthlyAverage",
  "historicalInvestment",
  "historicalCapitalAmount",
]);

export function hasSupportedConsolidationPreviewRates(rates: readonly Pick<ConsolidationRateReferenceSnapshot, "rateKind">[]) {
  return rates.every((rate) => SUPPORTED_PREVIEW_RATE_KINDS.has(rate.rateKind))
    && rates.some((rate) => rate.rateKind === "monthlyAverage");
}

export function buildConsolidatedPreviewFromBatchSnapshot(
  batch: ConsolidationBatchSnapshot,
  generatedAt = new Date(),
): DomainValidationResult<ConsolidatedReportOutputPackage> {
  const functionalCurrencyByEntitySnapshotId = new Map<number, string>();
  for (const entity of batch.entities) {
    const functionalCurrency = entity.functionalCurrency?.trim();
    if (!functionalCurrency) {
      return failCommand(`合并实体 ${entity.companyCode} 缺少 ERP 本位币主数据，不能生成合并报表`, 409, "functionalCurrency");
    }
    functionalCurrencyByEntitySnapshotId.set(entity.id, functionalCurrency);
  }
  if ([...functionalCurrencyByEntitySnapshotId.values()].some((currency) => currency.toUpperCase() === "CAD")
    && !hasSupportedConsolidationPreviewRates(batch.exchangeRates)) {
    return failCommand("当前草稿缺少逐月平均汇率证据，请重新生成合并工作底稿", 409, "exchangeRates");
  }
  return buildConsolidatedReportOutput(
    buildConsolidationPreviewPackage(batch),
    functionalCurrencyByEntitySnapshotId,
    generatedAt,
  );
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
  if (output.ok) {
    const nciValidation = validateNciWorkpaperForLock(output.data);
    if (!nciValidation.ok) return nciValidation;
  }
  return output.ok
    ? { ok: true, data: prepareConsolidatedOutputSnapshot(lockedBatch, output.data, generatedAt) }
    : output;
}

export async function loadConsolidatedReportOutput(batchId: number) {
  if (!Number.isInteger(batchId) || batchId <= 0) return serviceError("合并批次 ID 无效", 400);
  const row = await loadConsolidationBatchRow(batchId);
  if (!row) return serviceError("合并批次不存在", 404);
  const batch = consolidationBatchSnapshot(row);
  if (row.status !== "locked" && row.status !== "published") {
    batch.priorReferences = await loadConsolidationPriorReferences(batch);
    const preview = buildConsolidatedPreviewFromBatchSnapshot(batch);
    return preview.ok
      ? serviceOk({ report: preview.data, lifecycle: { status: row.status } })
      : serviceError(preview.issue.message, preview.issue.status);
  }
  const output = readConsolidatedOutputSnapshot(
    row.outputSnapshot,
    batchId,
    batch,
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
