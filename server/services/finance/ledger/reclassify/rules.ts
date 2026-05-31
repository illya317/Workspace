/**
 * Phase 4: 凭证明细层重分类 — 规则匹配
 *
 * classifyItem 对每条凭证明细返回完整结果：
 *   - 资产类（借余）科目：贷方发生额 → 重分类
 *   - 负债/权益类（贷余）科目：借方发生额 → 重分类
 *   - 其他组合（顺向发生额 / 无规则 / 无实体 / 目标不存在）→ 对应 skip 状态
 */

import type { ReclassifyItemResult, ItemStatus } from "./types";
import { ItemStatus as S } from "./types";

// ─── 分录查询结果的最小投影 ──────────────────────────────

export interface VoucherItemInput {
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

// ─── classifyItem ─────────────────────────────────────────

export function classifyItem(
  item: VoucherItemInput,
  targetExists: ReadonlySet<string>,
): ReclassifyItemResult {
  const base = {
    voucherItemId: item.id,
    sourceAccount: item.account.code,
  };

  // 1. 无规则
  if (!item.account.reclassTargetCode) {
    return { ...base, targetAccount: null, amount: 0, status: S.NO_RULE };
  }

  // 2. 无关联实体
  if (!item.relatedEntity) {
    return { ...base, targetAccount: null, amount: 0, status: S.NO_ENTITY };
  }

  // 3. 目标科目不存在
  if (!targetExists.has(item.account.reclassTargetCode)) {
    return { ...base, targetAccount: item.account.reclassTargetCode, amount: 0, status: S.INVALID_TARGET };
  }

  // 4. 判断借贷方向是否需要重分类
  const dir = item.account.balanceDirection;
  const isDebitBalance = dir === "debit";

  // 借余科目（资产/成本/费用）：贷方发生额需重分类
  if (isDebitBalance && item.credit > 0) {
    return {
      ...base,
      targetAccount: item.account.reclassTargetCode,
      amount: item.credit,
      status: S.MATCHED,
    };
  }

  // 贷余科目（负债/权益/收入）：借方发生额需重分类
  if (!isDebitBalance && item.debit > 0) {
    return {
      ...base,
      targetAccount: item.account.reclassTargetCode,
      amount: item.debit,
      status: S.MATCHED,
    };
  }

  // 5. 借贷方向与自然余额方向一致 → 无需重分类
  return {
    ...base,
    targetAccount: item.account.reclassTargetCode,
    amount: 0,
    status: S.SKIPPED,
  };
}

// ─── 批量分类 ─────────────────────────────────────────────

export function classifyItems(
  items: VoucherItemInput[],
  targetExists: ReadonlySet<string>,
): ReclassifyItemResult[] {
  return items.map((item) => classifyItem(item, targetExists));
}

// ─── 聚合统计 ─────────────────────────────────────────────

export function aggregateResults(
  results: ReclassifyItemResult[],
  sampleSize = 5,
): {
  counts: Record<ItemStatus, number>;
  samples: Record<ItemStatus, ReclassifyItemResult[]>;
} {
  const counts: Record<ItemStatus, number> = {
    matched: 0,
    skipped: 0,
    no_rule: 0,
    no_entity: 0,
    invalid_target: 0,
  };

  const buckets: Record<ItemStatus, ReclassifyItemResult[]> = {
    matched: [],
    skipped: [],
    no_rule: [],
    no_entity: [],
    invalid_target: [],
  };

  for (const r of results) {
    counts[r.status]++;
    if (buckets[r.status].length < sampleSize) {
      buckets[r.status].push(r);
    }
  }

  return { counts, samples: buckets };
}
