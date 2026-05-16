import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const reportId = parseInt(id);

  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { userId: true, scopeType: true, scopeId: true },
  });

  const canAccess =
    report &&
    (report.scopeType === "department"
      ? report.scopeId === payload.departmentId
      : report.userId === payload.userId);

  if (!canAccess) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const history = await prisma.reportHistory.findMany({
    where: { reportId },
    orderBy: { version: "desc" },
  });

  return NextResponse.json({ history });
}
