import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate } from "@/lib/auth";
import { canAccessTarget, canSubmitToTarget } from "@/lib/access";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const targetType = searchParams.get("targetType");
  const targetIds = searchParams.get("targetIds");

  // 权限校验：按单个 target 查询时验证权限
  if (targetType && targetIds) {
    const ids = targetIds.split(",").map(Number);
    if (ids.length === 1) {
      const allowed = await canAccessTarget(payload.userId, targetType, ids[0]);
      if (!allowed) {
        return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
      }
    }
  }

  const where: any = {};

  if (targetType && targetIds) {
    where.targetType = targetType;
    where.targetId = { in: targetIds.split(",").map(Number) };
  }

  if (date) where.date = date;

  const reports = await prisma.report.findMany({
    where,
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
      user: {
        select: { name: true },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();

  // 权限校验：提交报告时验证是否有权限
  if (body.targetType && body.targetId != null) {
    const allowed = await canSubmitToTarget(payload.userId, body.targetType, body.targetId);
    if (!allowed) {
      return NextResponse.json({ error: "无权限提交该目标周报" }, { status: 403 });
    }
  }

  const {
    taskName,
    notes,
    items,
    date,
    targetType,
    targetId,
  } = body as {
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
    date?: string;
    targetType?: string;
    targetId?: number;
  };

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "请填写至少一条工作项" },
      { status: 400 }
    );
  }

  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  if (!taskName) {
    return NextResponse.json(
      { error: "请填写任务名称" },
      { status: 400 }
    );
  }

  let allItems = [...items];

  const hasRoutine = items.some((i) => i.category === "routine");
  if (!hasRoutine) {
    const finalTargetType = targetType ?? "department";
    const finalTargetId = targetId ?? payload.departmentId;
    const works = await prisma.workItem.findMany({
      where: { targetType: finalTargetType, targetId: finalTargetId, category: "routine" },
      orderBy: { sortOrder: "asc" },
    });
    if (works.length > 0) {
      const routineItems = works.map((w, idx) => ({
        category: "routine",
        plan: w.content,
        completion: "",
        nextGoal: "",
        sortOrder: idx,
        workId: w.id,
      }));
      allItems = [...routineItems, ...items];
    }
  }

  try {
    const report = await prisma.report.create({
      data: {
        userId: payload.userId,
        date: reportDate,
        targetType: targetType,
        targetId: targetId,
        taskName: taskName,
        notes: notes || null,
        version: 1,
        items: {
          create: allItems.map((item, index) => ({
            category: item.category,
            workItemId: item.workId ?? null,
            plan: item.plan,
            completion: item.completion || null,
            nextGoal: item.nextGoal || null,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: {
        items: {
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        },
        user: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ report });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "该目标该时段已提交过报告，请使用更新功能" },
        { status: 409 }
      );
    }
    throw error;
  }
}
