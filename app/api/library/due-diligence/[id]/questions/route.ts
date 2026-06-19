import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getRequest } from "@workspace/library/server/due-diligence";

async function parseId(ctx?: RouteContext) {
  const { id } = await ctx!.params;
  const num = parseInt(id, 10);
  if (isNaN(num)) return null;
  return num;
}

export const GET = withLibraryAccess(async (_req, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(req.questions);
});
