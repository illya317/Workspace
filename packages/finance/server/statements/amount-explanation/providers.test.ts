import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@workspace/platform/server/prisma";

import type { AmountExplanationDb } from "./db";
import { normalizeQuery } from "./input";
import { consolidationMatchProvider } from "./providers/consolidation-matches";
import { fxTraceProvider } from "./providers/fx-trace";
import { reclassLineageProvider } from "./providers/reclass-lineage";
import { voucherLineProvider } from "./providers/voucher-lines";
import { workbookCellProvider } from "./providers/workbook-cells";
import type { ProviderContext } from "./providers/types";
import type { ExplanationScope } from "./scope";

// 匿名化公开夹具：通用公司/科目/凭证号；真实私有夹具（ voucher 2022-12-记-0098 ）
// 属于 Package 8 私有验收，不进仓库。

const COMPANY = { id: 1, code: "C001", description: "示例公司甲" };

function makeScope(overrides: Partial<ExplanationScope> = {}): ExplanationScope {
  return {
    companies: [{ id: COMPANY.id, code: COMPANY.code, name: COMPANY.description }],
    companyCodes: [COMPANY.code],
    companyIds: [COMPANY.id],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    batchIds: [],
    batchPeriod: null,
    outputSnapshotByBatch: new Map(),
    periods: [{ id: 101, year: 2024, month: 6, companyCode: COMPANY.code }],
    queryCount: 1,
    ...overrides,
  };
}

function makeContext(overrides: {
  db: AmountExplanationDb;
  scope?: ExplanationScope;
  queryText?: string;
  candidateLimit?: number;
  target?: Parameters<typeof normalizeQuery>[0]["reportContext"];
}): ProviderContext {
  return {
    db: overrides.db,
    query: normalizeQuery({
      targetAmount: overrides.queryText ?? "9,876.54",
      currencyCode: "CNY",
      companyIds: [COMPANY.id],
      dateFrom: "2024-01-01",
      dateTo: "2024-12-31",
      reportContext: overrides.target,
    }),
    scope: overrides.scope ?? makeScope(),
    windowUpperMinor: 987654n,
    candidateLimit: overrides.candidateLimit ?? 200,
  };
}

function fakeDb(overrides: Partial<Record<string, unknown>>): AmountExplanationDb {
  return {
    $queryRaw: async () => [],
    company: { findMany: async () => [] },
    financePeriod: { findMany: async () => [] },
    financeConsolidationBatch: { findFirst: async () => null, findMany: async () => [] },
    financeConsolidationOutputSnapshot: { findFirst: async () => null, findMany: async () => [] },
    financeConsolidationMatchSource: { findMany: async () => [] },
    reclassResult: { findMany: async () => [] },
    ...overrides,
  } as unknown as AmountExplanationDb;
}

function sqlText(sql: unknown): string {
  const typed = sql as { strings: readonly string[]; values: readonly unknown[] };
  return typed.strings.join("?");
}

const voucherRow = {
  itemId: 9001,
  voucherId: 900,
  accountId: 55,
  debit: -9876.54, // 来源借方为负：符号必须原样保留
  credit: 0,
  description: "测试凭证明细",
  sortOrder: 1,
  currencyCode: null,
  importFingerprint: "fp-item-9001",
  sourceSystem: "erp",
  sourceDatabase: "ledger",
  sourceKey: "key-9001",
  voucherNo: "2024-01-记-0001",
  voucherDate: "2024-01-15",
  companyCode: COMPANY.code,
  voucherSourceSystem: "erp",
  voucherSourceDatabase: "ledger",
  voucherSourceKey: "vkey-900",
  accountCode: "151101",
  accountName: "测试科目A",
};

test("voucher-line provider pushes every mandatory predicate into SQL with explicit LIMIT", async () => {
  const captured: unknown[] = [];
  const db = fakeDb({
    $queryRaw: async (sql: unknown) => {
      captured.push(sql);
      return captured.length === 1 ? [voucherRow] : [];
    },
  });
  const provider = voucherLineProvider();
  await provider.collect(makeContext({ db, candidateLimit: 50 }));

  const text = sqlText(captured[0]);
  for (const predicate of [
    `"FinanceVoucherItem"`,
    `v."status" = 'posted'`,
    `v."companyCode" IN`,
    `v."date" <=`,
    `v."date" >=`,
    `ABS(i.debit - i.credit) > 0`,
    `ABS(i.debit - i.credit) <= CAST`,
    `LIMIT`,
  ]) {
    assert.ok(text.includes(predicate), `missing SQL predicate: ${predicate}`);
  }
  const limit = (captured[0] as { values: readonly unknown[] }).values.at(-1);
  assert.equal(limit, 51);
});

test("voucher-line provider applies account hints as code-prefix predicates", async () => {
  const captured: unknown[] = [];
  const db = fakeDb({
    $queryRaw: async (sql: unknown) => {
      captured.push(sql);
      return [];
    },
  });
  const provider = voucherLineProvider();
  const ctx = makeContext({ db });
  ctx.query = normalizeQuery({
    targetAmount: "100.00",
    currencyCode: "CNY",
    companyIds: [COMPANY.id],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    accountHints: ["1511", "6603"],
  });
  await provider.collect(ctx);
  const text = sqlText(captured[0]);
  assert.ok(text.includes(`a."code" LIKE`));
  const values = (captured[0] as { values: readonly unknown[] }).values;
  assert.ok(values.includes("1511%") && values.includes("6603%"));
});

test("voucher-line provider preserves source sign and extracts counterparts with stable fingerprint", async () => {
  const counterpartRow = {
    voucherId: 900,
    itemId: 9002,
    accountCode: "660101",
    accountName: "测试对方科目",
  };
  const db = fakeDb({
    $queryRaw: async (sql: unknown) => {
      const text = sqlText(sql);
      // 主查询 join FinanceVoucher（v），对方科目查询只 join FinanceAccount。
      return text.includes(`"FinanceVoucher" AS v`) ? [voucherRow] : [counterpartRow];
    },
  });
  const provider = voucherLineProvider();
  const first = await provider.collect(makeContext({ db }));
  const second = await provider.collect(makeContext({ db }));

  assert.equal(first.candidates.length, 1);
  const candidate = first.candidates[0]!;
  assert.equal(candidate.amountMinor, -987654n);
  assert.equal(candidate.evidence.amount, "-9876.54");
  assert.equal(candidate.evidence.voucher?.voucherNo, "2024-01-记-0001");
  assert.equal(candidate.evidence.account?.code, "151101");
  assert.deepEqual(
    candidate.evidence.voucher?.counterpartAccounts.map((account) => account.code),
    ["660101"],
  );
  assert.equal(candidate.evidence.company.code, "C001");
  assert.equal(candidate.evidence.deepLink, null);
  // 稳定指纹：同一源事实两次查询得到同一 evidenceId；金额变化则指纹变化。
  assert.equal(candidate.evidence.evidenceId, second.candidates[0]!.evidence.evidenceId);
  const changed = await provider.collect(makeContext({
    db: fakeDb({
      $queryRaw: async (sql: unknown) => sqlText(sql).includes(`"FinanceVoucher" AS v`)
        ? [{ ...voucherRow, debit: -1000 }]
        : [counterpartRow],
    }),
  }));
  assert.notEqual(changed.candidates[0]!.evidence.evidenceId, candidate.evidence.evidenceId);
});

test("voucher-line provider reports capping instead of silently scanning on", async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({ ...voucherRow, itemId: 9001 + index }));
  const db = fakeDb({ $queryRaw: async () => rows });
  const provider = voucherLineProvider();
  const outcome = await provider.collect(makeContext({ db, candidateLimit: 3 }));
  assert.equal(outcome.diagnostics.status, "capped");
  assert.equal(outcome.diagnostics.fetchedCount, 4);
  assert.equal(outcome.candidates.length, 3);
  assert.ok(outcome.diagnostics.queryCount >= 1);
});

test("consolidation match provider keeps partial-allocation (matchedSignedAmount) semantics", async () => {
  const matchRow = {
    id: 7001,
    matchGroupId: 700,
    matchSide: "left",
    sourceKind: "voucher",
    sourceAmount: "-100.00",
    allocatedAmount: "40.00",
    currencyCode: "CNY",
    sourceFingerprint: "persisted-fp",
    entity: { companyId: 1, companyCode: "C001", companyName: "示例公司甲" },
    counterpartyEntity: { companyId: 2, companyCode: "C002", companyName: "示例公司乙" },
    matchGroup: {
      id: 700,
      batchId: 60,
      category: "intercompanyBalance",
      status: "matched",
      matchingRule: "rule-a",
      matchingVersion: "policy-1:rule-1",
      batch: { year: 2024, month: 6 },
    },
    voucherItem: {
      id: 9001,
      voucherId: 900,
      sortOrder: 1,
      account: { id: 55, code: "151101", name: "测试科目A" },
      voucher: { voucherNo: "2024-01-记-0001", date: "2024-01-15" },
    },
  };
  let capturedWhere: unknown;
  let capturedTake: unknown;
  const db = fakeDb({
    financeConsolidationMatchSource: {
      findMany: async (args: { where: unknown; take: number }) => {
        capturedWhere = args.where;
        capturedTake = args.take;
        return [matchRow];
      },
    },
  });
  const provider = consolidationMatchProvider();
  const ctx = makeContext({
    db,
    scope: makeScope({ batchIds: [60], companyIds: [1], outputSnapshotByBatch: new Map([[60, 800]]) }),
  });
  const outcome = await provider.collect(ctx);

  const where = capturedWhere as {
    matchGroup: { batchId: { in: number[] } };
    entity: { companyId: { in: number[] } };
    OR: unknown[];
  };
  assert.deepEqual(where.matchGroup.batchId.in, [60]);
  assert.deepEqual(where.entity.companyId.in, [1]);
  assert.ok(Array.isArray(where.OR) && where.OR.length === 2, "amount window must be a two-sided OR");
  assert.equal(capturedTake, 201);

  assert.equal(outcome.candidates.length, 1);
  const candidate = outcome.candidates[0]!;
  // sign(sourceAmount) × allocatedAmount = -40.00，部分分摊语义原样保留
  assert.equal(candidate.amountMinor, -4000n);
  assert.equal(candidate.evidence.amount, "-40.00");
  assert.equal(candidate.evidence.consolidation?.batchId, 60);
  assert.equal(candidate.evidence.consolidation?.outputSnapshotId, 800);
  assert.equal(candidate.evidence.consolidation?.matchSourceId, 7001);
});

test("consolidation match provider skips without batch scope", async () => {
  const provider = consolidationMatchProvider();
  const outcome = await provider.collect(makeContext({ db: fakeDb({}) }));
  assert.equal(outcome.diagnostics.status, "skipped");
  assert.equal(outcome.candidates.length, 0);
});

test("reclass lineage provider reuses period/status/amount-window predicates and joins voucher lineage", async () => {
  const reclassRow = {
    id: 3001,
    periodId: 101,
    sourceAccount: "220201",
    targetAccount: "112301",
    amount: -500.5,
    status: "approved",
    ruleIdSnapshot: 9,
    voucherItemIdSnapshot: 9001,
    voucherItem: {
      id: 9001,
      voucherId: 900,
      sortOrder: 1,
      account: { id: 56, code: "220201", name: "测试科目B" },
      voucher: { voucherNo: "2024-06-记-0007", date: "2024-06-20", companyCode: "C001", companyId: 1 },
    },
  };
  let capturedWhere: unknown;
  const db = fakeDb({
    reclassResult: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return [reclassRow];
      },
    },
  });
  const provider = reclassLineageProvider();
  const outcome = await provider.collect(makeContext({ db }));

  const where = capturedWhere as {
    periodId: { in: number[] };
    status: { in: string[] };
    OR: unknown[];
  };
  assert.deepEqual(where.periodId.in, [101]);
  assert.deepEqual(where.status.in, ["approved", "adjusted"]);
  assert.ok(Array.isArray(where.OR) && where.OR.length === 2);

  assert.equal(outcome.candidates.length, 1);
  const candidate = outcome.candidates[0]!;
  assert.equal(candidate.amountMinor, -50050n);
  assert.equal(candidate.evidence.amount, "-500.50");
  assert.equal(candidate.evidence.sourceRecordId, "reclassResult:3001");
  assert.equal(candidate.evidence.voucher?.voucherNo, "2024-06-记-0007");
  assert.equal(candidate.evidence.account?.code, "220201");
  assert.deepEqual(candidate.periodKey, "2024-06");
});

test("fx trace provider reads locked output snapshot translation evidence", async () => {
  const snapshot = {
    id: 800,
    batchId: 60,
    outputFingerprint: "f".repeat(64),
    batch: { year: 2024, month: 6 },
    reportPayload: {
      statements: [
        {
          reportType: "balanceSheet",
          lines: [
            {
              lineCode: "longTermEquityInvestment",
              label: "长期股权投资",
              entityAmounts: [
                {
                  entitySnapshotId: 71,
                  companyCode: "C002",
                  companyName: "示例公司乙",
                  amount: 1234.56,
                  translationTrace: {
                    sourceCurrency: "CAD",
                    presentationCurrency: "CNY",
                    current: { sourceAmount: 240.0, translatedAmount: 1234.56, basis: "closing", rate: 5.144 },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const db = fakeDb({
    financeConsolidationOutputSnapshot: { findFirst: async () => snapshot },
  });
  const provider = fxTraceProvider();
  const ctx = makeContext({
    db,
    queryText: "1,234.56",
    target: {
      target: {
        kind: "consolidated",
        parentCompanyId: 1,
        batchId: 60,
        outputSnapshotId: 800,
        reportType: "balance",
        targetFingerprint: "a".repeat(64),
      },
    },
  });
  ctx.windowUpperMinor = 123456n;
  const outcome = await provider.collect(ctx);

  assert.equal(outcome.candidates.length, 1);
  const candidate = outcome.candidates[0]!;
  assert.equal(candidate.amountMinor, 123456n);
  assert.equal(candidate.evidence.translation?.basis, "closing");
  assert.equal(candidate.evidence.translation?.rate, 5.144);
  assert.equal(candidate.evidence.translation?.sourceAmount, "240.00");
  assert.equal(candidate.evidence.consolidation?.outputSnapshotId, 800);
  assert.equal(candidate.lineCode, "longTermEquityInvestment");
});

test("fx trace provider skips entity contexts", async () => {
  const provider = fxTraceProvider();
  const outcome = await provider.collect(makeContext({ db: fakeDb({}) }));
  assert.equal(outcome.diagnostics.status, "skipped");
});

test("workbook cell provider port stays unavailable in Package 3", async () => {
  const provider = workbookCellProvider();
  const outcome = await provider.collect(makeContext({ db: fakeDb({}) }));
  assert.equal(outcome.diagnostics.status, "unavailable");
  assert.equal(outcome.candidates.length, 0);
});

test("query normalization rejects LIKE wildcards and zero targets fail-closed", () => {
  assert.throws(() => normalizeQuery({
    targetAmount: "0.00",
    currencyCode: "CNY",
    companyIds: [1],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
  }), /non-zero/);
  assert.throws(() => normalizeQuery({
    targetAmount: "100.00",
    currencyCode: "CNY",
    companyIds: [1],
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    accountHints: ["1511%"],
  }), /invalid account hint/);
});

test("Prisma.sql composition sanity: sql template objects expose strings/values", () => {
  const sql = Prisma.sql`v."companyCode" IN (${Prisma.join([Prisma.sql`"C001"`])})`;
  assert.ok(sql.strings.join("?").includes(`v."companyCode" IN`));
});
