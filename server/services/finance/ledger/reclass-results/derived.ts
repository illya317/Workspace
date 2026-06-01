/**
 * 共享 derived service — 凭证明细页 + 科目页共用同一套 classify 逻辑。
 *
 * 输出统一 row 类型：
 *   normal   — 正常分录，无 ReclassResult，无建议科目
 *   pending  — 有 ReclassResult，status=pending
 *   approved — 有 ReclassResult，status=approved
 *   adjusted — 有 ReclassResult，status=adjusted
 */

import { prisma } from "@/lib/prisma";
import { classifyItem } from "../reclassify/rules";
import type { VoucherItemInput } from "../reclassify/rules";
import type { RuleEntry } from "../reclassify/types";
import { ItemStatus } from "../reclassify/types";

// ─── Unified Row ─────────────────────────────────────────

export type DerivedKind = "normal" | "pending" | "approved" | "adjusted" | "rejected";

export interface DerivedRow {
  /** 凭证明细 ID（唯一） */
  voucherItemId: number;
  periodId: number;
  /** 凭证号 */
  voucherNo: string;
  voucherDate: string;
  /** 源科目 */
  sourceAccount: string;
  sourceAccountName: string;
  /** 分录方向 */
  itemSide: "debit" | "credit" | null;
  itemDebit: number;
  itemCredit: number;
  /** 摘要 */
  description: string | null;
  /** 关联实体 */
  relatedEntity: string | null;
  /** 系统建议的目标科目（来自规则匹配，仅 matched 有） */
  suggestedTarget: string | null;
  /** 当前目标科目（来自 ReclassResult，人工可改） */
  targetAccount: string | null;
  /** 重分类金额（来自 ReclassResult） */
  amount: number;
  /** 统一状态 */
  kind: DerivedKind;
  /** ReclassResult ID（无则为 0） */
  resultId: number;
  /** 异常方向（来自规则） */
  abnormalSide: string | null;
}

// ─── Query ─────────────────────────────────────────────

export async function deriveRows(periodId: number): Promise<DerivedRow[]> {
  // 0. period → companyCode, year
  const period = await prisma.financePeriod.findUnique({
    where: { id: periodId },
    select: { companyCode: true, year: true },
  });
  if (!period || !period.companyCode) return [];

  // 1. 规则（公司级，不限 year）
  const rules = await prisma.financeReclassRule.findMany({
    where: { companyCode: period.companyCode, enabled: true },
    select: { id: true, sourceAccountCode: true, abnormalSide: true, targetAccountCode: true },
  });
  const ruleMap = new Map<string, RuleEntry>();
  for (const r of rules) {
    ruleMap.set(`${r.sourceAccountCode}::${r.abnormalSide}`, {
      id: r.id,
      targetAccountCode: r.targetAccountCode,
    });
  }
  // 验证目标科目真实存在（不依赖规则自述）
  const targetCodes = [...new Set(rules.map((r) => r.targetAccountCode))];
  const existingTargets = targetCodes.length > 0
    ? await prisma.financeAccount.findMany({
        where: { companyCode: period.companyCode, year: period.year, code: { in: targetCodes } },
        select: { code: true },
      })
    : [];
  const targetExists = new Set(existingTargets.map((a) => a.code));

  // 2. 分录
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { periodId, status: "posted" }, OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }] },
    select: {
      id: true, debit: true, credit: true, description: true, relatedEntity: true,
      account: { select: { code: true, name: true, balanceDirection: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { voucherNo: "asc" } }, { sortOrder: "asc" }],
  });

  // 3. 已有 ReclassResult
  const results = await prisma.reclassResult.findMany({
    where: { periodId },
  });
  const resultMap = new Map(results.map((r) => [r.voucherItemId, r]));

  // 4. 逐条 classify + merge
  return items.map((item): DerivedRow => {
    const classified = classifyItem(item as VoucherItemInput, ruleMap, targetExists);
    const rr = resultMap.get(item.id);
    const itemSide: "debit" | "credit" | null =
      item.debit > 0 ? "debit" : item.credit > 0 ? "credit" : null;

    const isAbnormal = classified.status === ItemStatus.MATCHED;

    // 确定 kind
    let kind: DerivedKind = "normal";
    if (rr) {
      if (rr.status === "pending") kind = "pending";
      else if (rr.status === "approved") kind = "approved";
      else if (rr.status === "adjusted") kind = "adjusted";
      else if (rr.status === "rejected") kind = "rejected";
    }

    return {
      voucherItemId: item.id,
      periodId,
      voucherNo: item.voucher.voucherNo,
      voucherDate: item.voucher.date,
      sourceAccount: item.account.code,
      sourceAccountName: item.account.name,
      itemSide,
      itemDebit: item.debit,
      itemCredit: item.credit,
      description: item.description,
      relatedEntity: item.relatedEntity,
      suggestedTarget: isAbnormal ? classified.targetAccount : null,
      targetAccount: rr?.targetAccount ?? null,
      amount: rr?.amount ?? 0,
      kind,
      resultId: rr?.id ?? 0,
      abnormalSide: isAbnormal ? itemSide : null,
    };
  });
}
