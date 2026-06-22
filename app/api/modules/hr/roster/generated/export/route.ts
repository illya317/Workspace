import { NextResponse } from "next/server";
import { z } from "zod";
import { renderRosterGeneratedCsv } from "@workspace/hr/server";
import { authorize } from "@workspace/platform/server/auth";
import { withAuth } from "@workspace/platform/server/with-auth";

const exportQuerySchema = z.object({
  variant: z.enum(["management", "dueDiligence"]).catch("management"),
  keyword: z.string().catch(""),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  fields: z.string().catch(""),
  blankMergedCells: z.coerce.boolean().catch(false),
});

export const GET = withAuth(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const csv = await renderRosterGeneratedCsv({
    variant: parsed.data.variant,
    keyword: parsed.data.keyword,
    status: parsed.data.status,
    filterField: parsed.data.filterField,
    filterValue: parsed.data.filterValue,
    fields: parsed.data.fields ? parsed.data.fields.split(",").map((field) => field.trim()).filter(Boolean) : undefined,
    blankMergedCells: parsed.data.blankMergedCells,
  });
  const filename = parsed.data.variant === "management" ? "hr-roster-management.csv" : "hr-roster-due-diligence.csv";
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}, (userId) => authorize({ user: userId, resourceKey: "hr.roster.generated", action: "access" }));
