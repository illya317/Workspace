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

export const CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION = 1;
const SHA256_FINGERPRINT = /^[a-f0-9]{64}$/;
type SupportedConsolidatedOutputSnapshotVersion = 1;

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
  return value === 1;
}

function reportInputFingerprint(
  batch: ConsolidationBatchSnapshot,
  version: SupportedConsolidatedOutputSnapshotVersion,
) {
  const { events: _events, ...reportInputs } = batch;
  return consolidationFingerprint({ outputSnapshotVersion: version, reportInputs });
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
  const frozenInputBatch: ConsolidationBatchSnapshot = {
    ...currentBatch,
    ...snapshot.reportPayload.batch,
  };
  const recomputedInput = reportInputFingerprint(frozenInputBatch, snapshotVersion);
  if (recomputedInput !== snapshot.inputFingerprint) {
    return failCommand("合并输出快照输入指纹不一致", 409, "inputFingerprint");
  }
  const recomputed = consolidationFingerprint(snapshot.reportPayload);
  if (recomputed !== snapshot.outputFingerprint) {
    return failCommand("合并输出快照指纹不一致", 409, "outputFingerprint");
  }
  return okCommand(snapshot.reportPayload);
}
