import type { EvidenceRef } from "@workspace/finance/types/statement-explanation";

import {
  absMinor,
  decimalLikeToMinorUnits,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
} from "../decimal";
import { buildEvidenceId, completenessScore, fingerprintSource } from "../evidence";
import { diagnostics, type AmountEvidenceProvider, type EvidenceCandidate } from "./provider";

/**
 * 合并抵销匹配事实 provider（计划 §4.4 v1 清单第 2 条）。
 *
 * 只读适配持久化的 FinanceConsolidationMatchSource/MatchGroup 事实（含部分分摊
 * allocatedAmount），候选金额 = matchedSignedAmount 语义：
 * sign(sourceAmount) × allocatedAmount。只适配、不改变现有匹配/部分分摊算法。
 * 强制谓词：批次范围、主体公司、匹配状态、金额窗口、显式 take 上限。
 */
export function consolidationMatchProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "consolidationMatch",
    async collect(ctx) {
      const { db, scope, windowUpperMinor, candidateLimit } = ctx;
      if (scope.batchIds.length === 0 || scope.companyIds.length === 0) {
        return {
          candidates: [],
          diagnostics: diagnostics("consolidationMatch", "skipped", {
            queryCount: 0,
            fetchedCount: 0,
            candidateCount: 0,
            note: "no consolidation batch scope for this query",
          }),
        };
      }

      const upper = formatMinorUnits(windowUpperMinor, LEDGER_MONEY_SCALE);
      const lower = formatMinorUnits(-windowUpperMinor, LEDGER_MONEY_SCALE);
      const rows = await db.financeConsolidationMatchSource.findMany({
        where: {
          matchGroup: {
            batchId: { in: [...scope.batchIds] },
            status: { in: ["matched", "difference", "accepted"] },
          },
          entity: { companyId: { in: [...scope.companyIds] } },
          OR: [
            { sourceAmount: { gte: "0.01", lte: upper } },
            { sourceAmount: { lte: "-0.01", gte: lower } },
          ],
        },
        select: {
          id: true,
          matchGroupId: true,
          matchSide: true,
          sourceKind: true,
          sourceAmount: true,
          allocatedAmount: true,
          currencyCode: true,
          sourceFingerprint: true,
          entity: { select: { companyId: true, companyCode: true, companyName: true } },
          counterpartyEntity: { select: { companyId: true, companyCode: true, companyName: true } },
          matchGroup: {
            select: {
              id: true,
              batchId: true,
              category: true,
              status: true,
              matchingRule: true,
              matchingVersion: true,
              batch: { select: { year: true, month: true } },
            },
          },
          voucherItem: {
            select: {
              id: true,
              voucherId: true,
              sortOrder: true,
              account: { select: { id: true, code: true, name: true } },
              voucher: { select: { voucherNo: true, date: true } },
            },
          },
        },
        orderBy: [{ matchGroup: { batchId: "desc" } }, { id: "asc" }],
        take: candidateLimit + 1,
      });

      const capped = rows.length > candidateLimit;
      const accepted = capped ? rows.slice(0, candidateLimit) : rows;
      const candidates: EvidenceCandidate[] = [];

      for (const [index, row] of accepted.entries()) {
        const sourceMinor = decimalLikeToMinorUnits(row.sourceAmount, LEDGER_MONEY_SCALE);
        const allocatedMinor = decimalLikeToMinorUnits(row.allocatedAmount, LEDGER_MONEY_SCALE);
        if (allocatedMinor === 0n) continue;
        // matchedSignedAmount = sign(sourceAmount) × allocatedAmount（部分分摊语义保留）。
        const matchedMinor = sourceMinor < 0n ? -allocatedMinor : allocatedMinor;
        if (matchedMinor === 0n || absMinor(matchedMinor) > windowUpperMinor) continue;

        const amount = formatMinorUnits(matchedMinor, LEDGER_MONEY_SCALE);
        const sourceFingerprint = fingerprintSource({
          matchSourceId: row.id,
          persistedFingerprint: row.sourceFingerprint,
          matchGroupId: row.matchGroupId,
          matchSide: row.matchSide,
          sourceKind: row.sourceKind,
          matchedAmount: amount,
          currencyCode: row.currencyCode,
        });
        const voucher = row.voucherItem;
        const period = { year: row.matchGroup.batch.year, month: row.matchGroup.batch.month };
        const evidence: EvidenceRef = {
          evidenceId: buildEvidenceId("consolidationMatch", sourceFingerprint),
          sourceKind: "consolidationMatch",
          sourceRecordId: `consolidationMatchSource:${row.id}`,
          sourceFingerprint,
          amount,
          currencyCode: row.currencyCode,
          company: {
            id: row.entity.companyId,
            code: row.entity.companyCode,
            name: row.entity.companyName,
          },
          date: voucher?.voucher.date ?? null,
          period,
          account: voucher ? {
            id: voucher.account.id,
            code: voucher.account.code,
            name: voucher.account.name,
          } : null,
          voucher: voucher ? {
            voucherId: voucher.voucherId,
            voucherNo: voucher.voucher.voucherNo,
            voucherDate: voucher.voucher.date,
            itemId: voucher.id,
            sortOrder: voucher.sortOrder,
            counterpartAccounts: row.counterpartyEntity ? [{
              id: null,
              code: row.counterpartyEntity.companyCode,
              name: row.counterpartyEntity.companyName,
            }] : [],
          } : null,
          consolidation: {
            batchId: row.matchGroup.batchId,
            matchGroupId: row.matchGroupId,
            matchSourceId: row.id,
            outputSnapshotId: scope.outputSnapshotByBatch.get(row.matchGroup.batchId) ?? null,
            matchingRule: row.matchGroup.matchingRule,
            matchingVersion: row.matchGroup.matchingVersion,
          },
          workbook: null,
          translation: null,
          label: `合并抵销匹配 #${row.matchGroupId}（${row.matchGroup.category}）· ${row.entity.companyName} · ${amount} ${row.currencyCode}`,
          deepLink: null,
        };
        candidates.push({
          evidence,
          amountMinor: matchedMinor,
          companyId: row.entity.companyId,
          accountCode: voucher?.account.code ?? null,
          periodKey: `${period.year}-${String(period.month).padStart(2, "0")}`,
          lineCode: null,
          completeness: completenessScore(evidence),
          providerOrder: index,
        });
      }

      return {
        candidates,
        diagnostics: diagnostics("consolidationMatch", capped ? "capped" : "ok", {
          queryCount: 1,
          fetchedCount: rows.length,
          candidateCount: candidates.length,
        }),
      };
    },
  };
}
