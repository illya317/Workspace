import { NextResponse } from "next/server";
import { withFinanceWrite, withFinanceDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceWrite(async (req, _user) => {
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
  return withFinanceDelete(async (_req) => {
    const { id } = await params;
    await prisma.financePeriod.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  })(request);
}
