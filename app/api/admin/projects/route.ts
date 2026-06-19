import { NextResponse } from "next/server";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import { listAdminProjects } from "@workspace/platform/server/admin-projects";
import { z } from "zod";

const adminProjectsQuerySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  adminProjectsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  const isSysAdmin = await authorize({ user: payload.userId, resourceKey: "system", action: "admin" });
  if (!isSysAdmin) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const projects = await listAdminProjects();

  return NextResponse.json({ projects });
}
