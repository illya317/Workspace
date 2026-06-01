import { NextResponse } from "next/server";
import { withFinanceLedgerAccess } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

function abnormalSide(balanceDirection: string): string {
  return balanceDirection === "debit" ? "credit" : "debit";
}

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const periodId = parseInt(searchParams.get("periodId") || "", 10);
  if (!periodId) return NextResponse.json({ error: "periodId 为必填" }, { status: 400 });

  const period = await prisma.financePeriod.findUnique({
    where: { id: periodId },
    select: { companyCode: true, year: true },
  });
  if (!period || !period.companyCode) return NextResponse.json({ error: "期间不存在" }, { status: 404 });

  // All posted voucher items
  const items = await prisma.financeVoucherItem.findMany({
    where: { voucher: { periodId, status: "posted" }, OR: [{ debit: { gt: 0 } }, { credit: { gt: 0 } }] },
    select: {
      id: true, debit: true, credit: true, description: true,
      account: { select: { code: true, name: true, balanceDirection: true } },
      voucher: { select: { voucherNo: true, date: true } },
    },
    orderBy: [{ voucher: { voucherNo: "asc" } }, { sortOrder: "asc" }],
  });

  // Reclass results for this period
  const results = await prisma.reclassResult.findMany({
    where: { periodId },
    include: { rule: { select: { abnormalSide: true } } },
  });
  const resultMap = new Map(results.map((r) => [r.voucherItemId, r]));

  // Reclass rules for this company+year
  const rules = await prisma.financeReclassRule.findMany({
    where: { companyCode: period.companyCode, year: period.year, enabled: true },
    select: { sourceAccountCode: true, abnormalSide: true, targetAccountCode: true },
  });
  const ruleMap = new Map<string, string>();
  for (const r of rules) {
    ruleMap.set(`${r.sourceAccountCode}::${r.abnormalSide}`, r.targetAccountCode);
  }

  // Unified algorithm: every item goes through the same logic
  const merged = items.map((item) => {
    const rr = resultMap.get(item.id);
    const accountAbnormalSide = abnormalSide(item.account.balanceDirection);
    const ruleKey = `${item.account.code}::${accountAbnormalSide}`;
    const suggestedTarget = ruleMap.get(ruleKey) || "";
    const itemSide = item.debit > 0 ? "debit" : "credit";

    // Abnormal = item direction matches the account's abnormal side AND rule exists
    const isAbnormal = itemSide === accountAbnormalSide && !!suggestedTarget;

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
      abnormalSide: isAbnormal ? accountAbnormalSide : null,
      itemDebit: item.debit,
      itemCredit: item.credit,
      targetAccount: rr?.targetAccount || suggestedTarget,
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
