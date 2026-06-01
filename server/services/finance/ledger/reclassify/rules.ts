/**
 * Phase 4: 凭证明细层重分类 — 规则匹配
 *
 * classifyItem 对每条凭证明细返回完整结果：
 *   - 资产类（借余）科目：贷方发生额 → 重分类
 *   - 负债/权益类（贷余）科目：借方发生额 → 重分类
 *   - 其他组合（顺向发生额 / 无规则 / 无实体 / 目标不存在）→ 对应 skip 状态
 *
 * Batch 4: 规则来源从 FinanceAccount.reclassTargetCode 切换到 FinanceReclassRule 表。
 *   rules map: key = "accountCode::abnormalSide" → value = { id, targetAccountCode }
 */

import type { ReclassifyItemResult, ItemStatus, RuleEntry } from "./types";
import { ItemStatus as S } from "./types";

// ─── 分录查询结果的最小投影 ──────────────────────────────

export interface VoucherItemInput {
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

// ─── helper ──────────────────────────────────────────────

function abnormalSide(balanceDirection: string): string {
  return balanceDirection === "debit" ? "credit" : "debit";
}

// ─── classifyItem ─────────────────────────────────────────

export function classifyItem(
  item: VoucherItemInput,
  rules: ReadonlyMap<string, RuleEntry>,
  targetExists: ReadonlySet<string>,
  itemRules?: ReadonlyMap<string, { id: number; targetAccountCode: string }>,
): ReclassifyItemResult {
  const base = {
    voucherItemId: item.id,
    sourceAccount: item.account.code,
    ruleId: null as number | null,
  };

  // 0. 优先：明细例外规则 (exact_description)
  if (itemRules && item.description) {
    const itemRule = itemRules.get(`${item.account.code}::${item.description}`);
    if (itemRule && targetExists.has(itemRule.targetAccountCode)) {
      const amount = item.debit > 0 ? item.debit : item.credit;
      return { ...base, targetAccount: itemRule.targetAccountCode, amount, status: S.MATCHED, ruleId: null };
    }
  }

  // 1. 查规则：先查定向 abnormalSide，再查 both（全部重分类）
  const normalRule = rules.get(`${item.account.code}::${abnormalSide(item.account.balanceDirection)}`);
  const bothRule = rules.get(`${item.account.code}::both`);
  const rule = normalRule || bothRule;
  if (!rule) {
    return { ...base, targetAccount: null, amount: 0, status: S.NO_RULE };
  }

  // 2. 无关联实体（仅记录状态，不阻止匹配——序时账导入暂不包含关联实体列）
  if (!item.relatedEntity) {
    // Fall through to match — relatedEntity is informational, not blocking
  }

  // 3. 目标科目不存在
  if (!targetExists.has(rule.targetAccountCode)) {
    return { ...base, targetAccount: rule.targetAccountCode, amount: 0, status: S.INVALID_TARGET };
  }

  const isBoth = !!bothRule;

  // 4. both 模式：借方/贷方任有发生额即重分类
  if (isBoth && item.debit > 0) {
    return { ...base, targetAccount: rule.targetAccountCode, amount: item.debit, status: S.MATCHED, ruleId: rule.id };
  }
  if (isBoth && item.credit > 0) {
    return { ...base, targetAccount: rule.targetAccountCode, amount: item.credit, status: S.MATCHED, ruleId: rule.id };
  }

  const dir = item.account.balanceDirection;
  const isDebitBalance = dir === "debit";

  // 5. 借余科目（资产）：贷方发生额需重分类
  if (isDebitBalance && item.credit > 0) {
    return { ...base, targetAccount: rule.targetAccountCode, amount: item.credit, status: S.MATCHED, ruleId: rule.id };
  }

  // 6. 贷余科目（负债）：借方发生额需重分类
  if (!isDebitBalance && item.debit > 0) {
    return { ...base, targetAccount: rule.targetAccountCode, amount: item.debit, status: S.MATCHED, ruleId: rule.id };
  }

  // 7. 顺向发生额 → 无需重分类
  return { ...base, targetAccount: rule.targetAccountCode, amount: 0, status: S.SKIPPED, ruleId: rule.id };
}

// ─── 批量分类 ─────────────────────────────────────────────

export function classifyItems(
  items: VoucherItemInput[],
  rules: ReadonlyMap<string, RuleEntry>,
  targetExists: ReadonlySet<string>,
): ReclassifyItemResult[] {
  return items.map((item) => classifyItem(item, rules, targetExists));
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
