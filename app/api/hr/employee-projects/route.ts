import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, checkPermission } from "@workspace/platform/server/auth";
import { createWorkPlanMember, listWorkPlanMembers } from "@workspace/work/server";

const employeeProjectsQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createWorkPlanMemberSchema = z.object({
  employeeId: z.unknown(),
  projectId: z.unknown(),
  role: z.unknown().optional(),
  startDate: z.unknown().optional(),
  endDate: z.unknown().optional(),
}).passthrough();

async function canUseWorkPlan(userId: number, role: "access" | "write" | "delete" = "access") {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (await checkPermission(userId, "work.plan", role)) return true;
  return checkPermission(userId, "work", role);
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await canUseWorkPlan(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = employeeProjectsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const { projectId, keyword, page, pageSize } = parsedQuery.data;
  return NextResponse.json(await listWorkPlanMembers({
    projectId: projectId ?? null,
    keyword,
    page,
    pageSize,
  }));
}

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => null);
  const parsedBody = createWorkPlanMemberSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  return createWorkPlanMember(request);
}
