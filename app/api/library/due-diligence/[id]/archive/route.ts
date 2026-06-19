import { NextResponse } from "next/server";
import { withLibraryWrite } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { parseRouteId } from "@workspace/platform/server/api";
import { archiveRequest } from "@workspace/library/server/archive";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

export const POST = withLibraryWrite(async (_req, user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
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
