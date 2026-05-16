import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id, version } = await params;
  const reportId = parseInt(id);
  const versionNum = parseInt(version);

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

  if (versionNum === 0) {
    const current = await prisma.weeklyReport.findUnique({
      where: { id: reportId },
      include: {
        items: {
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        },
        user: {
          select: { name: true, departmentName: true },
        },
      },
    });
    return NextResponse.json({ report: current });
  }

  const snapshot = await prisma.reportHistory.findUnique({
    where: {
      reportId_version: {
        reportId,
        version: versionNum,
      },
    },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  }

  const items = JSON.parse(snapshot.itemsJson) as Array<{
    category: string;
    plan: string;
    completion?: string;
    nextGoal?: string;
    sortOrder: number;
  }>;

  return NextResponse.json({
    report: {
      id: reportId,
      taskName: snapshot.taskName,
      notes: snapshot.notes,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      items: items.map((i) => ({
        ...i,
        completion: i.completion || "",
        nextGoal: i.nextGoal || "",
      })),
    },
  });
}
