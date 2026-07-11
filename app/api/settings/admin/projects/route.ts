import { NextResponse } from "next/server";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { listAdminProjects } from "@workspace/platform/server/admin-projects";
import { z } from "zod";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const adminProjectsQuerySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  adminProjectsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  const isSysAdmin = await isSuperAdmin(payload.userId);
  if (!isSysAdmin) return jsonErrorResponse("无权限", 403);

  const projects = await listAdminProjects();

  return NextResponse.json({ projects });
}
