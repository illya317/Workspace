import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getDocumentVersions } from "@/server/services/library/versions";

export const GET = withLibraryAccess(async (_req, _user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const versions = await getDocumentVersions(docId);
  return NextResponse.json({ versions });
});
