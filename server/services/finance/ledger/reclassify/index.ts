/**
 * Phase 4: 凭证明细层重分类引擎
 *
 * 入口: buildReclassResults(periodId, opts?)
 *   - 读取 posted 凭证分录 + 科目 reclassTargetCode 规则
 *   - 逐条 classifyItem → 按 status 分组统计
 *   - dryRun (默认): 仅返回 ReclassifySummary，不写库
 *   - dryRun=false: upsert matched 到 ReclassResult，返回 ReclassifyExecutionResult
 *
 * 与后端 balance 层重分类 (computeReclassification) 的区别：
 *   - buildReclassResults: 凭证明细层，规则来自 FinanceAccount.reclassTargetCode
 *   - computeReclassification: 余额层，硬编码 startsWith("1"/"2") 兜底
 */

import { prisma } from "@/lib/prisma";
import { classifyItem } from "./rules";
import type { VoucherItemInput } from "./rules";
import { aggregateResults } from "./rules";
import { ItemStatus } from "./types";
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
  relatedEntity: string | null;
  account: {
    code: string;
    balanceDirection: string;
    reclassTargetCode: string | null;
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
      relatedEntity: true,
      account: {
        select: {
          code: true,
          balanceDirection: true,
          reclassTargetCode: true,
        },
      },
    },
  });
}

/** 收集所有 reclassTargetCode，批量查 FinanceAccount 确认存在性 */
async function buildTargetExistenceSet(
  items: RawItem[],
): Promise<Set<string>> {
  const codes = new Set<string>();
  for (const item of items) {
    if (item.account.reclassTargetCode) {
      codes.add(item.account.reclassTargetCode);
    }
  }
  if (codes.size === 0) return new Set();

  const existing = await prisma.financeAccount.findMany({
    where: { code: { in: [...codes] } },
    select: { code: true },
  });

  return new Set(existing.map((a) => a.code));
}

// ─── 写入 ─────────────────────────────────────────────────

async function upsertResults(
  periodId: number,
  matched: ReclassifyItemResult[],
): Promise<number> {
  let written = 0;

  for (let i = 0; i < matched.length; i += 500) {
    const batch = matched.slice(i, i + 500);

    // 逐条 upsert 以确保幂等 (@@unique periodId+voucherItemId)
    const ops = batch.map((r) =>
      prisma.reclassResult.upsert({
        where: {
          periodId_voucherItemId: {
            periodId,
            voucherItemId: r.voucherItemId,
          },
        },
        create: {
          periodId,
          voucherItemId: r.voucherItemId,
          sourceAccount: r.sourceAccount,
          targetAccount: r.targetAccount!,
          amount: r.amount,
          status: "pending",
        },
        update: {
          sourceAccount: r.sourceAccount,
          targetAccount: r.targetAccount!,
          amount: r.amount,
          // status 保持 "pending" —— 新一次引擎运行不覆盖已审核的结果
        },
      }),
    );

    await prisma.$transaction(ops);
    written += batch.length;
  }

  return written;
}

// ─── 入口 ─────────────────────────────────────────────────

export async function buildReclassResults(
  periodId: number,
  opts: BuildReclassResultsOptions = {},
): Promise<ReclassifySummary | ReclassifyExecutionResult> {
  const { dryRun = true } = opts;

  // 1. 查询
  const items = await fetchItems(periodId);
  const targetExists = await buildTargetExistenceSet(items);

  // 2. 逐条分类
  const results: ReclassifyItemResult[] = items.map((item) =>
    classifyItem(item as VoucherItemInput, targetExists),
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

  // 5. 写入 matched 到 ReclassResult
  const matched = results.filter((r) => r.status === ItemStatus.MATCHED);
  const written = matched.length > 0 ? await upsertResults(periodId, matched) : 0;

  return { ...summary, written } satisfies ReclassifyExecutionResult;
}
