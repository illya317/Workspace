/**
 * Phase 6a: 重分类结果列表查询
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type {
  ReclassResultRow,
  ListReclassResultsParams,
  ListReclassResultsOutput,
} from "./types";

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
      { sourceAccount: { contains: keyword } },
      { targetAccount: { contains: keyword } },
      { voucherItem: { relatedEntity: { contains: keyword } } },
      { voucherItem: { voucher: { voucherNo: { contains: keyword } } } },
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
            voucher: { select: { voucherNo: true, date: true } },
          },
        },
        reviewer: { select: { name: true } },
      },
    }),
    prisma.reclassResult.count({ where }),
  ]);

  // ─── Map to DTO ───────────────────────────────────────

  const items: ReclassResultRow[] = rows.map((r) => ({
    id: r.id,
    periodId: r.periodId,
    voucherItemId: r.voucherItemId,
    voucherNo: r.voucherItem.voucher.voucherNo,
    voucherDate: r.voucherItem.voucher.date,
    relatedEntity: r.voucherItem.relatedEntity,
    sourceAccount: r.sourceAccount,
    targetAccount: r.targetAccount,
    amount: r.amount,
    status: r.status as ReclassResultRow["status"],
    note: r.note,
    adjustedBy: r.adjustedBy,
    adjustedByName: r.reviewer?.name ?? null,
    adjustedAt: r.adjustedAt?.toISOString() ?? null,
  }));

  return { items, total, page, pageSize };
}
