import { NextResponse } from "next/server";
import { withFinanceLedgerAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const periodId = parseInt(searchParams.get("periodId") || "", 10);
  if (!periodId) return NextResponse.json({ error: "periodId 为必填" }, { status: 400 });

  // All posted voucher items for the period
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { periodId, status: "posted" }, OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }] },
    select: {
      id: true,
      debit: true,
      credit: true,
      description: true,
      account: { select: { code: true, name: true, balanceDirection: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { voucherNo: "asc" } }, { sortOrder: "asc" }],
  });

  // All reclass results for this period, keyed by voucherItemId
  const results = await prisma.reclassResult.findMany({
    where: { periodId },
    include: {
      rule: { select: { abnormalSide: true } },
    },
  });
  const resultMap = new Map(results.map((r) => [r.voucherItemId, r]));

  // Merge: each voucher item gets its reclass data if any
  const merged = items.map((item) => {
    const rr = resultMap.get(item.id);
    return {
      id: rr?.id ?? 0,
      periodId,
      voucherItemId: item.id,
      voucherNo: item.voucher.voucherNo,
      voucherDate: item.voucher.date,
      relatedEntity: null,
      description: item.description,
      sourceAccount: item.account.code,
      sourceAccountName: item.account.name,
      abnormalSide: rr?.rule?.abnormalSide ?? null,
      targetAccount: rr?.targetAccount ?? "",
      amount: rr?.amount ?? 0,
      status: rr?.status ?? "no_match",
      note: null,
      adjustedBy: null,
      adjustedByName: null,
      adjustedAt: null,
    };
  });

  return NextResponse.json({ items: merged, total: merged.length });
});
