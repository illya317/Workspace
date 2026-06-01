import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { buildReclassResults } from "@/server/services/finance/ledger/reclassify";

/** 规则删除：仅允许通过 write 权限操作自己的规则 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async () => {
    const { id } = await params;
    const ruleId = parseInt(id);
    if (isNaN(ruleId)) {
      return NextResponse.json({ error: "无效的规则 ID" }, { status: 400 });
    }

    const existing = await prisma.financeReclassRule.findUnique({
      where: { id: ruleId },
    });
    if (!existing) {
      return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    }

    const { companyCode, year } = existing;

    await prisma.financeReclassRule.delete({ where: { id: ruleId } });

    // 清理该规则关联的自动结果（保护人工 adjusted）
    await prisma.reclassResult.deleteMany({
      where: { ruleId, status: { in: ["approved", "pending"] } },
    });

    // 重跑全年同步
    const periods = await prisma.financePeriod.findMany({
      where: { companyCode, year },
      select: { id: true },
    });
    let synced = 0, skippedAdjusted = 0;
    for (const p of periods) {
      const result = await buildReclassResults(p.id, { dryRun: false });
      if ("written" in result) { synced += result.written; skippedAdjusted += result.skippedAdjusted; }
    }

    return NextResponse.json({ success: true, sync: { periods: periods.length, synced, skippedAdjusted } });
  })(request);
}
