import { NextResponse } from "next/server";
import { z } from "zod";
import { previewRosterGenerated } from "@workspace/hr/server";
import { authorize } from "@workspace/platform/server/auth";
import { withAuth } from "@workspace/platform/server/with-auth";

const previewQuerySchema = z.object({
  variant: z.enum(["management", "dueDiligence"]).catch("management"),
  keyword: z.string().catch(""),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export const GET = withAuth(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = previewQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const preview = await previewRosterGenerated(parsed.data);
  return NextResponse.json(preview);
}, (userId) => authorize({ user: userId, resourceKey: "hr.roster.generated", action: "access" }));
