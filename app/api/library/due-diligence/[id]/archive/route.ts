import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { archiveRequest } from "@workspace/library/server/archive";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

async function parseId(ctx?: RouteContext) {
  const parsedParams = routeIdParamsSchema.safeParse(await ctx!.params);
  return parsedParams.success ? parsedParams.data.id : null;
}

export const POST = withLibraryWrite(async (_req, user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  try {
    const result = await archiveRequest(id, user.userId, maxLevel);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Archive failed";
    const status = msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
});
