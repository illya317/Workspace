import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import { disabledApiResponseForRequest } from "@workspace/platform/server/module-runtime";
import {
  createReportForUser,
  listReportsForUser,
} from "@workspace/work/server";

const reportItemSchema = z.object({
  category: z.string(),
  plan: z.string(),
  completion: z.string().optional(),
  nextGoal: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  workId: z.coerce.number().optional(),
}).passthrough();

const createReportSchema = z.object({
  taskName: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(reportItemSchema).min(1),
  date: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
}).passthrough();

export async function GET(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;
  const targetType = searchParams.get("targetType") || undefined;
  const targetIds = searchParams.get("targetIds") || undefined;

  const result = await listReportsForUser(payload, { date, targetType, targetIds });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, deniedTargetIds: result.deniedTargetIds },
      { status: result.status },
    );
  }
  const meta = result.deniedTargetIds.length > 0 ? { deniedTargetIds: result.deniedTargetIds } : {};
  return NextResponse.json({ reports: result.reports, ...meta });
}

export async function POST(request: Request) {
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return disabledResponse;

  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsedBody = createReportSchema.safeParse(body);
  if (!parsedBody.success && parsedBody.error.issues.some((issue) => issue.path[0] === "items")) {
    return NextResponse.json({ error: "请填写至少一条工作项" }, { status: 400 });
  }
  if (!parsedBody.success) {
    return NextResponse.json({ error: "请填写任务名称" }, { status: 400 });
  }
  const result = await createReportForUser(payload, parsedBody.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ report: result.report });
}
