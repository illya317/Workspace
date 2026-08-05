import { Prisma } from "@workspace/platform/server/prisma";

import type { EvidenceRef } from "@workspace/finance/types/statement-explanation";

import {
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
  numberToMinorUnits,
} from "../decimal";
import { buildEvidenceId, completenessScore, fingerprintSource } from "../evidence";
import type { ScopeCompany } from "../scope";
import { diagnostics, type AmountEvidenceProvider, type EvidenceCandidate } from "./types";

/**
 * 专用凭证明细行 provider（计划 §4.4 v1 清单第 1 条）。
 *
 * 直接查询 FinanceVoucherItem 行级事实，强制谓词全部下推到 SQL：
 * 公司（companyCode IN）、期间（voucher.date 窗口）、币种、科目前缀提示、
 * 非零 + 金额窗口（|debit - credit| ≤ |target| + tolerance）、显式 LIMIT。
 * 刻意不复用 header 关键字凭证列表查询（它会按凭证头全量加载后在内存过滤）。
 * 单页有界：取 limit+1 行判定截断，诊断上报 fetched/capped；不做深分页。
 */

interface VoucherLineRow {
  itemId: number;
  voucherId: number;
  accountId: number;
  debit: number;
  credit: number;
  description: string | null;
  sortOrder: number;
  currencyCode: string | null;
  importFingerprint: string | null;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceKey: string | null;
  voucherNo: string;
  voucherDate: string;
  companyCode: string;
  voucherSourceSystem: string | null;
  voucherSourceDatabase: string | null;
  voucherSourceKey: string | null;
  accountCode: string;
  accountName: string;
}

interface CounterpartRow {
  voucherId: number;
  itemId: number;
  accountCode: string;
  accountName: string;
}

export function voucherLineProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "voucherLine",
    async collect(ctx) {
      const { db, query, scope, windowUpperMinor, candidateLimit } = ctx;
      const windowUpper = formatMinorUnits(windowUpperMinor, LEDGER_MONEY_SCALE);

      const predicates: Prisma.Sql[] = [
        Prisma.sql`v."status" = 'posted'`,
        Prisma.sql`(v."sourceInvalid" IS NULL OR v."sourceInvalid" = false)`,
        Prisma.sql`v."companyCode" IN (${Prisma.join(scope.companyCodes.map((code) => Prisma.sql`${code}`))})`,
        Prisma.sql`v."date" <= ${scope.dateTo}`,
        Prisma.sql`(i."currencyCode" IS NULL OR i."currencyCode" = ${query.currencyCode})`,
        Prisma.sql`ABS(i.debit - i.credit) > 0`,
        Prisma.sql`ABS(i.debit - i.credit) <= CAST(${windowUpper} AS numeric)`,
      ];
      if (scope.dateFrom) predicates.push(Prisma.sql`v."date" >= ${scope.dateFrom}`);
      if (query.accountHints.length > 0) {
        predicates.push(Prisma.sql`(${Prisma.join(
          query.accountHints.map((hint) => Prisma.sql`a."code" LIKE ${`${hint}%`}`),
          " OR ",
        )})`);
      }

      const rows = await db.$queryRaw<VoucherLineRow[]>(Prisma.sql`
        SELECT
          i.id AS "itemId",
          i."voucherId",
          i."accountId",
          i.debit,
          i.credit,
          i.description,
          i."sortOrder",
          i."currencyCode",
          i."importFingerprint",
          i."sourceSystem",
          i."sourceDatabase",
          i."sourceKey",
          v."voucherNo",
          v.date AS "voucherDate",
          v."companyCode",
          v."sourceSystem" AS "voucherSourceSystem",
          v."sourceDatabase" AS "voucherSourceDatabase",
          v."sourceKey" AS "voucherSourceKey",
          a.code AS "accountCode",
          a.name AS "accountName"
        FROM "FinanceVoucherItem" AS i
        INNER JOIN "FinanceVoucher" AS v ON v.id = i."voucherId"
        INNER JOIN "FinanceAccount" AS a ON a.id = i."accountId"
        WHERE ${Prisma.join(predicates, " AND ")}
        ORDER BY v."date" ASC, v."id" ASC, i."sortOrder" ASC, i."id" ASC
        LIMIT ${candidateLimit + 1}
      `);

      const capped = rows.length > candidateLimit;
      const accepted = capped ? rows.slice(0, candidateLimit) : rows;
      let queryCount = 1;
      let skippedNonClean = 0;

      const companyByCode = new Map<string, ScopeCompany>(scope.companies.map((company) => [company.code, company]));

      // 对方科目提取：只查已接受候选所在凭证的分录（有界第二个查询）。
      const counterpartByVoucher = new Map<number, CounterpartRow[]>();
      const voucherIds = [...new Set(accepted.map((row) => row.voucherId))];
      if (voucherIds.length > 0) {
        queryCount += 1;
        const counterpartRows = await db.$queryRaw<CounterpartRow[]>(Prisma.sql`
          SELECT
            i."voucherId",
            i.id AS "itemId",
            a.code AS "accountCode",
            a.name AS "accountName"
          FROM "FinanceVoucherItem" AS i
          INNER JOIN "FinanceAccount" AS a ON a.id = i."accountId"
          WHERE i."voucherId" IN (${Prisma.join(voucherIds.map((id) => Prisma.sql`${id}`))})
          ORDER BY i."voucherId" ASC, i."sortOrder" ASC, i.id ASC
        `);
        for (const row of counterpartRows) {
          const list = counterpartByVoucher.get(row.voucherId);
          if (list) list.push(row);
          else counterpartByVoucher.set(row.voucherId, [row]);
        }
      }

      const candidates: EvidenceCandidate[] = [];
      for (const [index, row] of accepted.entries()) {
        let debitMinor: bigint;
        let creditMinor: bigint;
        try {
          debitMinor = numberToMinorUnits(row.debit, LEDGER_MONEY_SCALE);
          creditMinor = numberToMinorUnits(row.credit, LEDGER_MONEY_SCALE);
        } catch {
          skippedNonClean += 1;
          continue;
        }
        const signedMinor = debitMinor - creditMinor;
        if (signedMinor === 0n) continue;

        const sourceFingerprint = fingerprintSource({
          itemId: row.itemId,
          voucherId: row.voucherId,
          importFingerprint: row.importFingerprint,
          source: [row.sourceSystem, row.sourceDatabase, row.sourceKey],
          voucherSource: [row.voucherSourceSystem, row.voucherSourceDatabase, row.voucherSourceKey],
          companyCode: row.companyCode,
          voucherNo: row.voucherNo,
          voucherDate: row.voucherDate,
          accountCode: row.accountCode,
          debit: formatMinorUnits(debitMinor, LEDGER_MONEY_SCALE),
          credit: formatMinorUnits(creditMinor, LEDGER_MONEY_SCALE),
        });
        const company = companyByCode.get(row.companyCode);
        const currencyCode = row.currencyCode ?? query.currencyCode;
        const amount = formatMinorUnits(signedMinor, LEDGER_MONEY_SCALE);
        const counterpartAccounts = (counterpartByVoucher.get(row.voucherId) ?? [])
          .filter((counterpart) => counterpart.itemId !== row.itemId)
          .map((counterpart) => ({ id: null, code: counterpart.accountCode, name: counterpart.accountName }));

        const evidence: EvidenceRef = {
          evidenceId: buildEvidenceId("voucherLine", sourceFingerprint),
          sourceKind: "voucherLine",
          sourceRecordId: `voucherItem:${row.itemId}`,
          sourceFingerprint,
          amount,
          currencyCode,
          company: {
            id: company?.id ?? null,
            code: row.companyCode,
            name: company?.name ?? null,
          },
          date: row.voucherDate,
          period: {
            year: Number(row.voucherDate.slice(0, 4)),
            month: Number(row.voucherDate.slice(5, 7)),
          },
          account: { id: row.accountId, code: row.accountCode, name: row.accountName },
          voucher: {
            voucherId: row.voucherId,
            voucherNo: row.voucherNo,
            voucherDate: row.voucherDate,
            itemId: row.itemId,
            sortOrder: row.sortOrder,
            counterpartAccounts,
          },
          consolidation: null,
          workbook: null,
          translation: null,
          label: `${row.voucherDate} ${row.voucherNo} · ${row.accountCode} ${row.accountName} · ${amount} ${currencyCode}`,
          deepLink: null,
        };
        candidates.push({
          evidence,
          amountMinor: signedMinor,
          companyId: company?.id ?? null,
          accountCode: row.accountCode,
          periodKey: row.voucherDate.slice(0, 7),
          lineCode: null,
          completeness: completenessScore(evidence),
          providerOrder: index,
        });
      }

      return {
        candidates,
        diagnostics: diagnostics("voucherLine", capped ? "capped" : "ok", {
          queryCount,
          fetchedCount: rows.length,
          candidateCount: candidates.length,
          ...(skippedNonClean > 0 ? { note: `skipped ${skippedNonClean} non-clean money row(s)` } : {}),
        }),
      };
    },
  };
}
