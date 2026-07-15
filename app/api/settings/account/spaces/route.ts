import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { listUnifiedSpacesForUser } from "@workspace/platform/server/space-registry";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  return NextResponse.json(await listUnifiedSpacesForUser(auth.user.userId, {
    includeAllSpaces: url.searchParams.get("scope") === "all",
  }));
}
