import { z } from "zod";

import { previewRosterGenerated } from "@workspace/hr/server";
import { withOpenApiScope } from "@workspace/platform/server/open-api";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const rosterQuerySchema = z.object({
  variant: z.enum(["management", "dueDiligence"]).catch("management"),
  keyword: z.string().catch(""),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  filterField: z.string().catch(""),
  filterValue: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export const GET = withOpenApiScope("hr.generated.roster.read", "read", async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = rosterQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  const preview = await previewRosterGenerated(parsed.data);
  return Response.json(preview);
});
