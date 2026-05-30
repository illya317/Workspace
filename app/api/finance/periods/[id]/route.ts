import { NextResponse } from "next/server";
import { withFinanceLedgerWrite, withFinanceLedgerDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceLedgerWrite(async (req, _user) => {
    const { id } = await params;
    const body = await req.json();
    const { isClosed } = body;

    const period = await prisma.financePeriod.update({
      where: { id: parseInt(id) },
      data: { isClosed: isClosed ?? false },
    });

    return NextResponse.json({ success: true, period });
  })(request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceLedgerDelete(async (_req) => {
    const { id } = await params;
    await prisma.financePeriod.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  })(request);
}
