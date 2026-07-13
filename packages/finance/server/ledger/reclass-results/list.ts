/**
 * Phase 6a: 重分类结果列表查询
 */

import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";
import type {
  ReclassResultRow,
  ListReclassResultsParams,
  ListReclassResultsOutput,
} from "./types";

function userEmployeeName(user: { employees?: Array<{ name: string }> } | null | undefined) {
  return user?.employees?.[0]?.name ?? null;
}

export async function listReclassResults(
  params: ListReclassResultsParams,
): Promise<ListReclassResultsOutput> {
  const { periodId, keyword, page = 1, pageSize = 50 } = params;
  const status = params.status ?? "pending";

  // ─── WHERE ────────────────────────────────────────────

  const where: Prisma.ReclassResultWhereInput = { periodId };

  if (status !== "all") {
    where.status = status;
  }

  if (keyword) {
    where.OR = [
      { sourceAccount: { contains: keyword, mode: "insensitive" } },
      { targetAccount: { contains: keyword, mode: "insensitive" } },
      { voucherItem: { relatedEntity: { contains: keyword, mode: "insensitive" } } },
      { voucherItem: { voucher: { voucherNo: { contains: keyword, mode: "insensitive" } } } },
    ];
  }

  // ─── Query ────────────────────────────────────────────

  const [rows, total] = await Promise.all([
    prisma.reclassResult.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        voucherItem: {
          select: {
            relatedEntity: true,
            description: true,
            account: { select: { name: true } },
            voucher: { select: { voucherNo: true, date: true } },
          },
        },
        rule: { select: { abnormalSide: true } },
        reviewer: { select: { employees: { select: { name: true }, take: 1 } } },
      },
    }),
    prisma.reclassResult.count({ where }),
  ]);

  // ─── Map to DTO ───────────────────────────────────────

  const items: ReclassResultRow[] = rows.map((r) => ({
    id: r.id,
    periodId: r.periodId,
    voucherItemId: r.voucherItemId ?? r.voucherItemIdSnapshot,
    sourceMissing: !r.voucherItem,
    voucherNo: r.voucherItem?.voucher.voucherNo ?? "历史来源已删除",
    voucherDate: r.voucherItem?.voucher.date ?? "",
    relatedEntity: r.voucherItem?.relatedEntity ?? null,
    description: r.voucherItem?.description ?? "原凭证明细已删除，保留重分类结果快照",
    sourceAccount: r.sourceAccount,
    sourceAccountName: r.voucherItem?.account.name ?? r.sourceAccount,
    abnormalSide: r.rule?.abnormalSide ?? null,
    itemDebit: 0,
    itemCredit: 0,
    targetAccount: r.targetAccount,
    amount: r.amount,
    status: r.status as ReclassResultRow["status"],
    note: r.note,
    adjustedBy: r.adjustedBy,
    adjustedByName: userEmployeeName(r.reviewer),
    adjustedAt: r.adjustedAt?.toISOString() ?? null,
  }));

  return { items, total, page, pageSize };
}
