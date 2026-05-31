/**
 * Phase 4: 凭证明细层重分类 — 类型定义
 *
 * classifyItem 对每条凭证明细返回完整结果，不存在 status 与字段不匹配的中间态。
 */

// ─── Status ───────────────────────────────────────────────

export const ItemStatus = {
  MATCHED: "matched",
  SKIPPED: "skipped",
  NO_RULE: "no_rule",
  NO_ENTITY: "no_entity",
  INVALID_TARGET: "invalid_target",
} as const;

export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  matched: "已匹配",
  skipped: "无需重分类",
  no_rule: "未配置规则",
  no_entity: "无关联实体",
  invalid_target: "目标科目不存在",
};

// ─── Per-item result ──────────────────────────────────────

export interface RuleEntry {
  id: number;
  targetAccountCode: string;
}

export interface ReclassifyItemResult {
  voucherItemId: number;
  sourceAccount: string;
  /** reclassTargetCode 值；no_rule / no_entity 时为 null；invalid_target 时为原始无效编码 */
  targetAccount: string | null;
  /**
   * 需重分类的金额：
   * - matched: 与自然余额方向相反的发生额（资产取 credit，负债取 debit）
   * - 其他状态: 0
   */
  amount: number;
  status: ItemStatus;
  /** Batch 4: 匹配到的 FinanceReclassRule.id，未匹配时为 null */
  ruleId: number | null;
}

// ─── Aggregate ────────────────────────────────────────────

export interface ReclassifySummary {
  periodId: number;
  total: number;
  matched: number;
  skipped: number;
  noRule: number;
  noEntity: number;
  invalidTarget: number;
  samples: Record<ItemStatus, ReclassifyItemResult[]>;
}

export interface ReclassifyExecutionResult extends ReclassifySummary {
  /** 实际写入 ReclassResult 表的新增/更新行数 */
  written: number;
  /** 被跳过的非 pending（已审核/调整/拒绝）记录数 */
  skippedNonPending: number;
}

// ─── Options ──────────────────────────────────────────────

export interface BuildReclassResultsOptions {
  /** 默认 true；显式传 false 才 upsert ReclassResult */
  dryRun?: boolean;
}
