/**
 * 共享 derived service — 凭证明细页 + 科目页展示已有人工结果。
 *
 * 输出统一 row 类型：
 *   normal   — 正常分录，无 ReclassResult，无建议科目
 *   pending  — 有 ReclassResult，status=pending
 *   approved — 有 ReclassResult，status=approved
 *   adjusted — 有 ReclassResult，status=adjusted
 */

import { prisma } from "@workspace/platform/server/prisma";

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
  // 1. 分录
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { periodId, status: "posted" }, OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }] },
    select: {
      id: true, debit: true, credit: true, description: true, relatedEntity: true,
      account: { select: { code: true, name: true, balanceDirection: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { voucherNo: "asc" } }, { sortOrder: "asc" }],
  });

  // 2. 已有 ReclassResult
  const results = await prisma.reclassResult.findMany({
    where: { periodId },
  });
  const resultMap = new Map(results.map((r) => [r.voucherItemId, r]));

  // 3. 只合并已有人工结果；不从发生额推断重分类
  return items.map((item): DerivedRow => {
    const rr = resultMap.get(item.id);
    const itemSide: "debit" | "credit" | null =
      item.debit > 0 ? "debit" : item.credit > 0 ? "credit" : null;

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
      suggestedTarget: null,
      targetAccount: rr?.targetAccount ?? null,
      amount: rr?.amount ?? 0,
      kind,
      resultId: rr?.id ?? 0,
      abnormalSide: rr ? itemSide : null,
    };
  });
}
