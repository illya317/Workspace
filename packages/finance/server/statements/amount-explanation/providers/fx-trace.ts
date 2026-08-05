import type { EvidenceRef, StatementTargetRef } from "@workspace/finance/types/statement-explanation";

import {
  absMinor,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
  numberToMinorUnits,
} from "../decimal";
import { buildEvidenceId, completenessScore, fingerprintSource } from "../evidence";
import { diagnostics, type AmountEvidenceProvider, type EvidenceCandidate } from "./provider";

/**
 * 外币折算血缘 provider（计划 §4.4 v1 清单第 5 条）。
 *
 * 只接入已有稳定合同：不可变的 FinanceConsolidationOutputSnapshot.reportPayload 中
 * 逐主体 translationTrace（折算依据/汇率/原币金额）。无锁定输出快照或非合并目标时跳过。
 * 实体级 FX 事实目前由 voucherLine provider 的币种字段承载，不重复造合同。
 */

const REPORT_TYPE_MAP: Record<StatementTargetRef["reportType"], string> = {
  balance: "balanceSheet",
  income: "incomeStatement",
  cashflow: "cashFlow",
};

interface PayloadTranslationTrace {
  sourceCurrency?: unknown;
  presentationCurrency?: unknown;
  current?: { sourceAmount?: unknown; translatedAmount?: unknown; basis?: unknown; rate?: unknown };
}

interface PayloadEntityAmount {
  entitySnapshotId?: unknown;
  companyCode?: unknown;
  companyName?: unknown;
  amount?: unknown;
  translationTrace?: PayloadTranslationTrace;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function fxTraceProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "fxTrace",
    async collect(ctx) {
      const { db, query, windowUpperMinor, candidateLimit } = ctx;
      const target = query.reportContext?.target ?? null;
      if (target?.kind !== "consolidated") {
        return {
          candidates: [],
          diagnostics: diagnostics("fxTrace", "skipped", {
            queryCount: 0,
            fetchedCount: 0,
            candidateCount: 0,
            note: "fx trace evidence requires a consolidated report context",
          }),
        };
      }

      const snapshot = await db.financeConsolidationOutputSnapshot.findFirst({
        where: { batchId: target.batchId },
        select: {
          id: true,
          batchId: true,
          outputFingerprint: true,
          reportPayload: true,
          batch: { select: { year: true, month: true } },
        },
      });
      if (!snapshot) {
        return {
          candidates: [],
          diagnostics: diagnostics("fxTrace", "skipped", {
            queryCount: 1,
            fetchedCount: 0,
            candidateCount: 0,
            note: "no locked consolidation output snapshot for this batch",
          }),
        };
      }

      const payload = asRecord(snapshot.reportPayload);
      const statements = Array.isArray(payload?.statements) ? payload.statements : [];
      const wantedReportType = REPORT_TYPE_MAP[target.reportType];
      const period = { year: snapshot.batch.year, month: snapshot.batch.month };
      const periodKey = `${period.year}-${String(period.month).padStart(2, "0")}`;

      let fetchedCount = 0;
      let skippedNonClean = 0;
      const candidates: EvidenceCandidate[] = [];

      for (const statementValue of statements) {
        const statement = asRecord(statementValue);
        if (!statement || statement.reportType !== wantedReportType) continue;
        const lines = Array.isArray(statement.lines) ? statement.lines : [];
        for (const lineValue of lines) {
          const line = asRecord(lineValue);
          if (!line || typeof line.lineCode !== "string") continue;
          const entityAmounts = Array.isArray(line.entityAmounts) ? line.entityAmounts : [];
          for (const entityAmountValue of entityAmounts) {
            const entityAmount = asRecord(entityAmountValue) as PayloadEntityAmount | null;
            if (!entityAmount || typeof entityAmount.companyCode !== "string") continue;
            fetchedCount += 1;
            if (candidates.length >= candidateLimit) continue;

            let amountMinor: bigint;
            try {
              amountMinor = numberToMinorUnits(Number(entityAmount.amount), LEDGER_MONEY_SCALE);
            } catch {
              skippedNonClean += 1;
              continue;
            }
            if (amountMinor === 0n || absMinor(amountMinor) > windowUpperMinor) continue;

            const trace = entityAmount.translationTrace;
            const current = trace?.current;
            let sourceAmountText: string | null = null;
            try {
              sourceAmountText = current?.sourceAmount === undefined || current?.sourceAmount === null
                ? null
                : formatMinorUnits(numberToMinorUnits(Number(current.sourceAmount), LEDGER_MONEY_SCALE), LEDGER_MONEY_SCALE);
            } catch {
              sourceAmountText = null;
            }

            const amount = formatMinorUnits(amountMinor, LEDGER_MONEY_SCALE);
            const companyName = typeof entityAmount.companyName === "string" ? entityAmount.companyName : null;
            const sourceFingerprint = fingerprintSource({
              outputSnapshotId: snapshot.id,
              outputFingerprint: snapshot.outputFingerprint,
              reportType: wantedReportType,
              lineCode: line.lineCode,
              entitySnapshotId: entityAmount.entitySnapshotId ?? null,
              companyCode: entityAmount.companyCode,
              amount,
            });
            const evidence: EvidenceRef = {
              evidenceId: buildEvidenceId("fxTrace", sourceFingerprint),
              sourceKind: "fxTrace",
              sourceRecordId: `consolidatedOutput:${snapshot.id}:${wantedReportType}:${line.lineCode}:${String(entityAmount.entitySnapshotId ?? "unknown")}`,
              sourceFingerprint,
              amount,
              currencyCode: query.currencyCode,
              company: { id: null, code: entityAmount.companyCode, name: companyName },
              date: null,
              period,
              account: null,
              voucher: null,
              consolidation: {
                batchId: snapshot.batchId,
                matchGroupId: null,
                matchSourceId: null,
                outputSnapshotId: snapshot.id,
                matchingRule: null,
                matchingVersion: null,
              },
              workbook: null,
              translation: trace && current ? {
                sourceCurrency: String(trace.sourceCurrency ?? ""),
                presentationCurrency: String(trace.presentationCurrency ?? ""),
                basis: String(current.basis ?? ""),
                rate: typeof current.rate === "number" ? current.rate : null,
                sourceAmount: sourceAmountText ?? "",
              } : null,
              label: `折算血缘 ${entityAmount.companyCode} · ${String(line.label ?? line.lineCode)} · ${amount} ${query.currencyCode}`,
              deepLink: null,
            };
            candidates.push({
              evidence,
              amountMinor,
              companyId: null,
              accountCode: null,
              periodKey,
              lineCode: line.lineCode,
              completeness: completenessScore(evidence),
              providerOrder: candidates.length,
            });
          }
        }
      }

      const capped = fetchedCount > candidates.length && candidates.length >= candidateLimit;
      return {
        candidates,
        diagnostics: diagnostics("fxTrace", capped ? "capped" : "ok", {
          queryCount: 1,
          fetchedCount,
          candidateCount: candidates.length,
          ...(skippedNonClean > 0 ? { note: `skipped ${skippedNonClean} non-clean money row(s)` } : {}),
        }),
      };
    },
  };
}
