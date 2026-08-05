import type { EvidenceRef } from "@workspace/finance/types/statement-explanation";

import {
  absMinor,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
  numberToMinorUnits,
} from "../decimal";
import { buildEvidenceId, completenessScore, fingerprintSource } from "../evidence";
import { diagnostics, type AmountEvidenceProvider, type EvidenceCandidate } from "./provider";

/**
 * 重分类血缘 provider（计划 §4.4 v1 清单第 3 条）。
 *
 * 复用 Finance 已有的 ReclassResult 事实（重分类结果 → 来源凭证明细血缘），
 * 只纳入已生效状态（approved/adjusted）。金额保留来源符号原样，不做方向重解释。
 * 强制谓词：期间范围（公司 × 月）、状态、金额窗口、显式 take 上限。
 */
export function reclassLineageProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "reclassLineage",
    async collect(ctx) {
      const { db, scope, windowUpperMinor, candidateLimit } = ctx;
      if (scope.periods.length === 0) {
        return {
          candidates: [],
          diagnostics: diagnostics("reclassLineage", "skipped", {
            queryCount: 0,
            fetchedCount: 0,
            candidateCount: 0,
            note: "no finance periods inside the resolved window",
          }),
        };
      }

      const upper = Number(windowUpperMinor) / 10 ** LEDGER_MONEY_SCALE;
      const rows = await db.reclassResult.findMany({
        where: {
          periodId: { in: scope.periods.map((period) => period.id) },
          status: { in: ["approved", "adjusted"] },
          OR: [
            { amount: { gte: 0.005, lte: upper } },
            { amount: { lte: -0.005, gte: -upper } },
          ],
        },
        select: {
          id: true,
          periodId: true,
          sourceAccount: true,
          targetAccount: true,
          amount: true,
          status: true,
          ruleIdSnapshot: true,
          voucherItemIdSnapshot: true,
          voucherItem: {
            select: {
              id: true,
              voucherId: true,
              sortOrder: true,
              account: { select: { id: true, code: true, name: true } },
              voucher: {
                select: { voucherNo: true, date: true, companyCode: true, companyId: true },
              },
            },
          },
        },
        orderBy: [{ periodId: "asc" }, { id: "asc" }],
        take: candidateLimit + 1,
      });

      const capped = rows.length > candidateLimit;
      const accepted = capped ? rows.slice(0, candidateLimit) : rows;
      const periodById = new Map(scope.periods.map((period) => [period.id, period]));
      const companyByCode = new Map(scope.companies.map((company) => [company.code, company]));
      let skippedNonClean = 0;
      const candidates: EvidenceCandidate[] = [];

      for (const [index, row] of accepted.entries()) {
        let amountMinor: bigint;
        try {
          amountMinor = numberToMinorUnits(row.amount, LEDGER_MONEY_SCALE);
        } catch {
          skippedNonClean += 1;
          continue;
        }
        if (amountMinor === 0n || absMinor(amountMinor) > windowUpperMinor) continue;

        const period = periodById.get(row.periodId);
        const voucher = row.voucherItem;
        const companyCode = voucher?.voucher.companyCode ?? period?.companyCode ?? null;
        const company = companyCode ? companyByCode.get(companyCode) : undefined;
        const amount = formatMinorUnits(amountMinor, LEDGER_MONEY_SCALE);
        const currencyCode = ctx.query.currencyCode;
        const sourceFingerprint = fingerprintSource({
          reclassResultId: row.id,
          periodId: row.periodId,
          ruleIdSnapshot: row.ruleIdSnapshot,
          voucherItemIdSnapshot: row.voucherItemIdSnapshot,
          sourceAccount: row.sourceAccount,
          targetAccount: row.targetAccount,
          amount,
          status: row.status,
        });
        const evidence: EvidenceRef = {
          evidenceId: buildEvidenceId("reclassLineage", sourceFingerprint),
          sourceKind: "reclassLineage",
          sourceRecordId: `reclassResult:${row.id}`,
          sourceFingerprint,
          amount,
          currencyCode,
          company: {
            id: voucher?.voucher.companyId ?? company?.id ?? null,
            code: companyCode ?? "unknown",
            name: company?.name ?? null,
          },
          date: voucher?.voucher.date ?? null,
          period: period ? { year: period.year, month: period.month } : null,
          account: {
            id: voucher?.account.id ?? null,
            code: row.sourceAccount,
            name: voucher?.account.name ?? row.sourceAccount,
          },
          voucher: voucher ? {
            voucherId: voucher.voucherId,
            voucherNo: voucher.voucher.voucherNo,
            voucherDate: voucher.voucher.date,
            itemId: voucher.id,
            sortOrder: voucher.sortOrder,
            counterpartAccounts: [{ id: null, code: row.targetAccount, name: row.targetAccount }],
          } : null,
          consolidation: null,
          workbook: null,
          translation: null,
          label: `重分类 ${row.sourceAccount} → ${row.targetAccount} · ${amount} ${currencyCode}`,
          deepLink: null,
        };
        candidates.push({
          evidence,
          amountMinor,
          companyId: evidence.company.id,
          accountCode: row.sourceAccount,
          periodKey: period ? `${period.year}-${String(period.month).padStart(2, "0")}` : null,
          lineCode: null,
          completeness: completenessScore(evidence),
          providerOrder: index,
        });
      }

      return {
        candidates,
        diagnostics: diagnostics("reclassLineage", capped ? "capped" : "ok", {
          queryCount: 1,
          fetchedCount: rows.length,
          candidateCount: candidates.length,
          ...(skippedNonClean > 0 ? { note: `skipped ${skippedNonClean} non-clean money row(s)` } : {}),
        }),
      };
    },
  };
}
