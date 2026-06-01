/**
 * Phase 4: 凭证明细层重分类引擎
 *
 * 入口: buildReclassResults(periodId, opts?)
 *   - 读取 posted 凭证分录
 *   - 加载 period 对应的 FinanceReclassRule（Batch 4：替代旧 FinanceAccount.reclassTargetCode）
 *   - 逐条 classifyItem → 按 status 分组统计
 *   - dryRun (默认): 仅返回 ReclassifySummary，不写库
 *   - dryRun=false: upsert matched 到 ReclassResult（含 ruleId），返回 ReclassifyExecutionResult
 */

import { prisma } from "@/lib/prisma";
import { classifyItem } from "./rules";
import type { VoucherItemInput } from "./rules";
import { aggregateResults } from "./rules";
import { ItemStatus } from "./types";
import type { RuleEntry } from "./types";
import type {
  ReclassifyItemResult,
  ReclassifySummary,
  ReclassifyExecutionResult,
  BuildReclassResultsOptions,
} from "./types";

// ─── 查询 ─────────────────────────────────────────────────

interface RawItem {
  id: number;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity: string | null;
  account: {
    code: string;
    balanceDirection: string;
  };
}

async function fetchItems(periodId: number): Promise<RawItem[]> {
  return prisma.financeVoucherItem.findMany({
    where: {
      voucher: { periodId, status: "posted" },
      OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }],
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      description: true,
      relatedEntity: true,
      account: {
        select: {
          code: true,
          balanceDirection: true,
        },
      },
    },
  });
}

/** 加载公司级所有 enabled 规则（不再限定 year） */
async function fetchRules(
  companyCode: string,
): Promise<Map<string, RuleEntry>> {
  const rules = await prisma.financeReclassRule.findMany({
    where: { companyCode, enabled: true },
    select: { id: true, sourceAccountCode: true, abnormalSide: true, targetAccountCode: true },
  });
  const map = new Map<string, RuleEntry>();
  for (const r of rules) {
    map.set(`${r.sourceAccountCode}::${r.abnormalSide}`, {
      id: r.id,
      targetAccountCode: r.targetAccountCode,
    });
  }
  return map;
}

/** 收集所有规则 targetAccountCode，验证在 (companyCode, year) 范围内科目存在 */
async function buildTargetExistenceSet(
  rules: Map<string, RuleEntry>,
  companyCode: string,
  year: number,
): Promise<Set<string>> {
  const codes = new Set<string>();
  for (const r of rules.values()) codes.add(r.targetAccountCode);
  if (codes.size === 0) return new Set();

  const existing = await prisma.financeAccount.findMany({
    where: {
      code: { in: [...codes] },
      companyCode,
      year,
    },
    select: { code: true },
  });

  return new Set(existing.map((a) => a.code));
}

// ─── 写入 ─────────────────────────────────────────────────

async function upsertResults(
  periodId: number,
  matched: ReclassifyItemResult[],
): Promise<{ written: number; skippedAdjusted: number }> {
  const existing = await prisma.reclassResult.findMany({
    where: { periodId, voucherItemId: { in: matched.map((r) => r.voucherItemId) } },
    select: { voucherItemId: true, status: true },
  });
  // 只保护人工调整过的记录，自动 approved/pending 允许被规则刷新覆盖
  const protectedIds = new Set(
    existing.filter((e) => e.status === "adjusted" || e.status === "rejected").map((e) => e.voucherItemId),
  );
  const writable = matched.filter((r) => !protectedIds.has(r.voucherItemId));

  let written = 0;
  for (let i = 0; i < writable.length; i += 500) {
    const batch = writable.slice(i, i + 500);
    const ops = batch.map((r) =>
      prisma.reclassResult.upsert({
        where: {
          periodId_voucherItemId: { periodId, voucherItemId: r.voucherItemId },
        },
        create: {
          periodId,
          voucherItemId: r.voucherItemId,
          ruleId: r.ruleId,
          sourceAccount: r.sourceAccount,
          targetAccount: r.targetAccount!,
          amount: r.amount,
          status: "approved",
        },
        update: {
          ruleId: r.ruleId,
          sourceAccount: r.sourceAccount,
          targetAccount: r.targetAccount!,
          amount: r.amount,
          status: "approved",
        },
      }),
    );
    await prisma.$transaction(ops);
    written += batch.length;
  }

  return { written, skippedAdjusted: protectedIds.size };
}

// ─── 入口 ─────────────────────────────────────────────────

export async function buildReclassResults(
  periodId: number,
  opts: BuildReclassResultsOptions = {},
): Promise<ReclassifySummary | ReclassifyExecutionResult> {
  const { dryRun = true } = opts;

  // 0. 查 period 以锁定 (companyCode, year) 范围
  const period = await prisma.financePeriod.findUnique({
    where: { id: periodId },
    select: { companyCode: true, year: true },
  });
  if (!period) throw new Error(`Period ${periodId} not found`);
  if (!period.companyCode) throw new Error(`Period ${periodId} has no companyCode — reclass engine requires company-scoped rules`);

  // 1. 查询 items + rules（规则公司级，不再限定 year）
  const items = await fetchItems(periodId);
  const rules = await fetchRules(period.companyCode);
  const targetExists = await buildTargetExistenceSet(rules, period.companyCode, period.year);

  // 2. 逐条分类
  const results: ReclassifyItemResult[] = items.map((item) =>
    classifyItem(item as VoucherItemInput, rules, targetExists),
  );

  // 3. 聚合
  const { counts, samples } = aggregateResults(results);

  const summary: ReclassifySummary = {
    periodId,
    total: results.length,
    matched: counts.matched,
    skipped: counts.skipped,
    noRule: counts.no_rule,
    noEntity: counts.no_entity,
    invalidTarget: counts.invalid_target,
    samples,
  };

  // 4. dry-run → 仅返回统计
  if (dryRun) return summary;

  // 5. 只写入 matched（异常方向命中规则）到 ReclassResult
  const matched = results.filter((r) => r.status === ItemStatus.MATCHED);
  const { written, skippedAdjusted } =
    matched.length > 0
      ? await upsertResults(periodId, matched)
      : { written: 0, skippedAdjusted: 0 };

  const execResult: ReclassifyExecutionResult = { ...summary, written, skippedAdjusted };
  if (skippedAdjusted > 0) {
    console.log(
      `[buildReclassResults] 保护 ${skippedAdjusted} 条人工调整记录，未被覆盖`,
    );
  }
  return execResult;
}
