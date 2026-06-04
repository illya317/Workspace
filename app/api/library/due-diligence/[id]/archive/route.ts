import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { archiveRequest } from "@/server/services/library/archive";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

async function parseId(ctx?: RouteContext) {
  const { id } = await ctx!.params;
  const num = parseInt(id, 10);
  if (isNaN(num)) return null;
  return num;
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
