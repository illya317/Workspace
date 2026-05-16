import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requireGroupAccess, requireGroupSubmit } from "@/lib/auth";
import { getCurrentWeekInfo } from "@/lib/week";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const week = searchParams.get("week");
  const reportGroupId = searchParams.get("reportGroupId")
    ? parseInt(searchParams.get("reportGroupId")!)
    : null;
  const scopeType = searchParams.get("scopeType") || "department";
  const scopeId = searchParams.get("scopeId")
    ? parseInt(searchParams.get("scopeId")!)
    : payload.departmentId;

  const reportGroupIds = searchParams.get("reportGroupIds");

  // 权限校验：按单个 reportGroupId 查询时验证权限
  if (reportGroupId) {
    const { error, status } = await requireGroupAccess(request, reportGroupId);
    if (error) return NextResponse.json({ error }, { status });
  }

  let where: any;

  if (reportGroupIds) {
    // 按多个 reportGroupId 查询（History 用）
    where = {
      reportGroupId: { in: reportGroupIds.split(",").map(Number) },
    };
  } else if (reportGroupId) {
    // 按单个 reportGroupId 查询（Dashboard 用）
    where = { reportGroupId };
  } else {
    // 回退逻辑：按 scopeType + scopeId 查询（兼容旧数据）
    where = { scopeType, scopeId };
  }

  if (year) where.year = parseInt(year);
  if (week) where.weekNumber = parseInt(week);

  const reports = await prisma.weeklyReport.findMany({
    where,
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
      user: {
        select: { name: true, departmentName: true },
      },
    },
    orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
  });

  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();

  // 权限校验：提交周报时验证是否有权限
  if (body.reportGroupId) {
    const { error, status } = await requireGroupSubmit(request, body.reportGroupId);
    if (error) return NextResponse.json({ error }, { status });
  }
  const {
    taskName,
    notes,
    items,
    year,
    weekNumber,
    periodType,
    scopeType,
    scopeId,
    reportGroupId,
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
    year?: number;
    weekNumber?: number;
    periodType?: string;
    scopeType?: string;
    scopeId?: number;
    reportGroupId?: number;
  };

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "请填写至少一条工作项" },
      { status: 400 }
    );
  }

  const reportYear = year ?? getCurrentWeekInfo().year;
  const reportWeek = weekNumber ?? getCurrentWeekInfo().weekNumber;
  const reportPeriodType = periodType || "weekly";
  const reportScopeType = scopeType || "department";
  const reportScopeId = scopeId ?? payload.departmentId;

  // 如果有 reportGroupId，查出名称作为 taskName
  let finalTaskName = taskName;
  let finalReportGroupId = reportGroupId ?? null;
  if (finalReportGroupId && !finalTaskName) {
    const group = await prisma.reportGroup.findUnique({
      where: { id: finalReportGroupId },
    });
    if (group) finalTaskName = group.name;
  }

  if (!finalTaskName) {
    return NextResponse.json(
      { error: "请填写任务名称" },
      { status: 400 }
    );
  }

  let allItems = [...items];

  const hasRoutine = items.some((i) => i.category === "routine");
  if (!hasRoutine) {
    const works = await prisma.workItem.findMany({
      where: { departmentId: reportScopeId, category: "routine" },
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
    const report = await prisma.weeklyReport.create({
      data: {
        userId: payload.userId,
        year: reportYear,
        weekNumber: reportWeek,
        periodType: reportPeriodType,
        scopeType: reportScopeType,
        scopeId: reportScopeId,
        reportGroupId: finalReportGroupId,
        taskName: finalTaskName,
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
          select: { name: true, departmentName: true },
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
        { error: "本周已提交过周报，请使用更新功能" },
        { status: 409 }
      );
    }
    throw error;
  }
}
