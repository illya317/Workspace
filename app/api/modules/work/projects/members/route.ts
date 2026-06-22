import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { canUseProject, createProjectMember, listProjectMembers } from "@workspace/work/server";

const memberDateSchema = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable().optional();
const employeeNumberSchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(z.string().min(1));

const createProjectMemberSchema = z.object({
  employeeNumber: employeeNumberSchema.optional(),
  employeeId: employeeNumberSchema.optional(),
  projectId: z.coerce.number().int().positive(),
  role: z.string().nullable().optional(),
  startDate: memberDateSchema,
  endDate: memberDateSchema,
}).refine((body) => Boolean(body.employeeNumber || body.employeeId), {
  message: "员工不能为空",
  path: ["employeeNumber"],
});

export async function GET(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  if (!(await canUseProject(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
  return NextResponse.json(await listProjectMembers({
    userId: payload.userId,
    projectId: projectId ? parseInt(projectId) : null,
    keyword,
    page,
    pageSize,
  }));
}

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const body = await request.clone().json().catch(() => null);
  const parsedBody = createProjectMemberSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "参数错误" }, { status: 400 });

  return createProjectMember(new Request(request, { body: JSON.stringify(parsedBody.data) }));
}
