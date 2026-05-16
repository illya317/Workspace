import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const reportId = parseInt(id);

  const existing = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "无权修改此周报" },
      { status: 403 }
    );
  }

  const userId = payload.userId;
  const departmentId = payload.departmentId;

  async function canEdit(report: NonNullable<typeof existing>) {
    // 如果有 reportGroupId，检查用户是否是填报成员
    if (report.reportGroupId) {
      const member = await prisma.reportGroupMember.findUnique({
        where: {
          reportGroupId_userId: {
            reportGroupId: report.reportGroupId,
            userId,
          },
        },
      });
      return !!member;
    }
    // 旧数据回退逻辑
    if (report.scopeType === "department") {
      return report.scopeId === departmentId;
    }
    if (report.scopeType === "project") {
      return false;
    }
    return report.userId === userId;
  }

  if (!canEdit(existing)) {
    return NextResponse.json(
      { error: "无权修改此周报" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { taskName, notes, items } = body as {
    taskName: string;
    notes?: string;
    items: Array<{
      category: string;
      plan: string;
      completion?: string;
      nextGoal?: string;
      sortOrder?: number;
      workId?: number;
    }>;
  };

  if (!taskName || !items || items.length === 0) {
    return NextResponse.json(
      { error: "请填写任务名称和至少一条工作项" },
      { status: 400 }
    );
  }

  const currentItems = await prisma.reportItem.findMany({
    where: { reportId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  await prisma.$transaction([
    prisma.reportHistory.create({
      data: {
        reportId,
        version: existing.version,
        taskName: existing.taskName,
        notes: existing.notes,
        itemsJson: JSON.stringify(currentItems),
      },
    }),
    prisma.reportItem.deleteMany({ where: { reportId } }),
    prisma.weeklyReport.update({
      where: { id: reportId },
      data: {
        taskName,
        notes: notes || null,
        version: { increment: 1 },
        items: {
          create: items.map((item, index) => ({
            category: item.category,
            workItemId: item.workId ?? null,
            plan: item.plan,
            completion: item.completion || null,
            nextGoal: item.nextGoal || null,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
    }),
  ]);

  const updated = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  return NextResponse.json({ report: updated });
}
