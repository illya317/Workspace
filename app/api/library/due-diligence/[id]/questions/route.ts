import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { parseRouteId } from "@workspace/platform/server/api";
import { getRequest } from "@workspace/library/server/due-diligence";

export const GET = withLibraryAccess(async (_req, _user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(req.questions);
});
