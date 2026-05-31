import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

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

    await prisma.financeReclassRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({ success: true });
  })(request);
}
