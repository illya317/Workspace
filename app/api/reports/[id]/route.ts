import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, checkPermission } from "@/lib/auth";
import { canSubmitToTarget } from "@/lib/access";

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

  const existing = await prisma.report.findUnique({
    where: { id: reportId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "无权修改此报告" },
      { status: 403 }
    );
  }

  const userId = payload.userId;

  async function canEdit(report: NonNullable<typeof existing>) {
    // 管理员直接放行
    if (await checkPermission(userId, "system", "admin")) return true;

    // 如果有 targetType + targetId，检查用户是否有提交（编辑）权限
    if (report.targetType && report.targetId != null) {
      return canSubmitToTarget(userId, report.targetType, report.targetId);
    }

    // 无 targetType/targetId 则只有所有者能编辑
    return report.userId === userId;
  }

  const editable = await canEdit(existing);
  if (!editable) {
    return NextResponse.json(
      { error: "无权修改此报告" },
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
    prisma.report.update({
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

  const updated = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  return NextResponse.json({ report: updated });
}
