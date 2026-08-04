import type {
  ConsolidatedReportOutputPackage,
  ConsolidationBatchSnapshot,
} from "@workspace/finance/types";
import type { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateConsolidatedOutputSnapshotPersistence } from "../domain/consolidation-persistence-validation";

import { consolidationFingerprint } from "./consolidation-fingerprints";
import { immutableAuditSnapshot } from "./consolidation-mutations";

export const CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION = 2;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;
type SupportedConsolidatedOutputSnapshotVersion = 1 | 2;

export interface PreparedConsolidatedOutputSnapshot {
  report: ConsolidatedReportOutputPackage;
  inputBatch: ConsolidationBatchSnapshot;
  data: {
    batchId: number;
    version: number;
    inputFingerprint: string;
    outputFingerprint: string;
    reportPayload: Prisma.InputJsonValue;
    generatedAt: Date;
  };
}

export interface StoredConsolidatedOutputSnapshot {
  batchId: number;
  version: number;
  inputFingerprint: string;
  outputFingerprint: string;
  reportPayload: unknown;
  generatedAt: Date;
}

function isSupportedSnapshotVersion(value: number): value is SupportedConsolidatedOutputSnapshotVersion {
  return value === 1 || value === 2;
}

function orderById<T extends { id: number }>(rows: T[]) {
  return [...rows].sort((left, right) => left.id - right.id);
}

function reportInputFactsV2(batch: ConsolidationBatchSnapshot) {
  const {
    events: _events,
    // priorReferences 由上期已锁定批次派生,不属于本批次冻结输入,且读取冻结快照时不会重新加载,
    // 必须排除在输入指纹之外,否则冻结输出会因指纹不一致而不可读。
    priorReferences: _priorReferences,
    entities,
    sources,
    exchangeRates,
    entries,
    controlDecisions,
    ...batchHeader
  } = batch;
  return {
    ...batchHeader,
    entities: orderById(entities),
    sources: orderById(sources),
    exchangeRates: orderById(exchangeRates).map((rate) => ({
      ...rate,
      applications: [...rate.applications].sort((left, right) =>
        consolidationFingerprint(left).localeCompare(consolidationFingerprint(right)),
      ),
    })),
    entries: orderById(entries).map((entry) => {
      const {
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        lines,
        taxEffects,
        ...entryFacts
      } = entry;
      return {
        ...entryFacts,
        lines: orderById(lines),
        taxEffects: orderById(taxEffects).map((taxEffect) => {
          const {
            createdAt: _taxCreatedAt,
            updatedAt: _taxUpdatedAt,
            ...taxEffectFacts
          } = taxEffect;
          return taxEffectFacts;
        }),
      };
    }),
    controlDecisions: orderById(controlDecisions),
  };
}

function stableBatchHeader(batch: ConsolidationBatchSnapshot | ConsolidatedReportOutputPackage["batch"]) {
  return {
    id: batch.id,
    parentCompanyId: batch.parentCompanyId,
    parentCompanyCode: batch.parentCompanyCode,
    parentCompanyName: batch.parentCompanyName,
    year: batch.year,
    month: batch.month,
    periodKind: batch.periodKind ?? "month",
    version: batch.version,
    baseBatchId: batch.baseBatchId,
    scopeFingerprint: batch.scopeFingerprint,
    sourceFingerprint: batch.sourceFingerprint,
    rateFingerprint: batch.rateFingerprint,
  };
}

function reportInputFingerprint(
  batch: ConsolidationBatchSnapshot,
  version: SupportedConsolidatedOutputSnapshotVersion,
) {
  const { events: _events, ...reportInputs } = batch;
  return consolidationFingerprint({
    outputSnapshotVersion: version,
    reportInputs: version === 1 ? reportInputs : reportInputFactsV2(batch),
  });
}

export function prepareConsolidatedOutputSnapshot(
  batch: ConsolidationBatchSnapshot,
  report: ConsolidatedReportOutputPackage,
  generatedAt: Date,
): PreparedConsolidatedOutputSnapshot {
  return {
    report,
    inputBatch: batch,
    data: {
      batchId: batch.id,
      version: CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION,
      inputFingerprint: reportInputFingerprint(batch, CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION),
      outputFingerprint: consolidationFingerprint(report),
      reportPayload: immutableAuditSnapshot(report),
      generatedAt,
    },
  };
}

export function persistConsolidatedOutputSnapshot(
  tx: Prisma.TransactionClient,
  snapshot: Pick<PreparedConsolidatedOutputSnapshot, "data">,
) {
  const validation = validateConsolidatedOutputSnapshotPersistence(snapshot.data);
  if (!validation.ok) throw new Error(`合并输出快照持久化参数无效：${validation.issue.message}`);
  return tx.financeConsolidationOutputSnapshot.create({ data: snapshot.data });
}

function isConsolidatedReportPayload(value: unknown): value is ConsolidatedReportOutputPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.generatedAt !== "string" || !Array.isArray(record.statements)) return false;
  if (!record.batch || typeof record.batch !== "object" || Array.isArray(record.batch)) return false;
  return Number.isInteger((record.batch as Record<string, unknown>).id);
}

export function readConsolidatedOutputSnapshot(
  snapshot: StoredConsolidatedOutputSnapshot | null,
  expectedBatchId: number,
  currentBatch: ConsolidationBatchSnapshot,
): DomainValidationResult<ConsolidatedReportOutputPackage> {
  if (!snapshot) return failCommand("合并批次尚未生成锁定输出快照", 409, "outputSnapshot");
  if (snapshot.batchId !== expectedBatchId) {
    return failCommand("合并输出快照与批次不匹配", 409, "outputSnapshot");
  }
  const snapshotVersion = snapshot.version;
  if (!isSupportedSnapshotVersion(snapshotVersion)) {
    return failCommand("合并输出快照版本不受支持", 409, "outputSnapshot");
  }
  if (!SHA256_FINGERPRINT.test(snapshot.inputFingerprint)) {
    return failCommand("合并输出快照输入指纹无效", 409, "inputFingerprint");
  }
  if (!SHA256_FINGERPRINT.test(snapshot.outputFingerprint)) {
    return failCommand("合并输出快照输出指纹无效", 409, "outputFingerprint");
  }
  if (!isConsolidatedReportPayload(snapshot.reportPayload)) {
    return failCommand("合并输出快照内容无效", 409, "reportPayload");
  }
  if (snapshot.reportPayload.batch.id !== expectedBatchId) {
    return failCommand("合并输出快照正文与批次不匹配", 409, "reportPayload");
  }
  if (snapshot.reportPayload.generatedAt !== snapshot.generatedAt.toISOString()) {
    return failCommand("合并输出快照生成时间不一致", 409, "generatedAt");
  }
  if (currentBatch.id !== expectedBatchId) {
    return failCommand("合并输出快照的输入批次不匹配", 409, "inputFingerprint");
  }
  if (consolidationFingerprint(stableBatchHeader(currentBatch))
    !== consolidationFingerprint(stableBatchHeader(snapshot.reportPayload.batch))) {
    return failCommand("合并输出快照输入指纹不一致", 409, "inputFingerprint");
  }
  if (snapshotVersion === 2) {
    const { presentationCurrency: _presentationCurrency, ...reportBatch } = snapshot.reportPayload.batch;
    const frozenInputBatch: ConsolidationBatchSnapshot = {
      ...currentBatch,
      ...reportBatch,
    };
    const recomputedInput = reportInputFingerprint(frozenInputBatch, snapshotVersion);
    if (recomputedInput !== snapshot.inputFingerprint) {
      return failCommand("合并输出快照输入指纹不一致", 409, "inputFingerprint");
    }
  }
  const recomputed = consolidationFingerprint(snapshot.reportPayload);
  if (recomputed !== snapshot.outputFingerprint) {
    return failCommand("合并输出快照指纹不一致", 409, "outputFingerprint");
  }
  return okCommand(snapshot.reportPayload);
}
