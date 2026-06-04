import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getDocument } from "@/server/services/library/metadata";
import { getDocumentVersions } from "@/server/services/library/versions";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const doc = await getDocument(docId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  if (doc.confidentialityLevel > maxLevel) {
    return NextResponse.json({ error: "Higher confidentiality required" }, { status: 403 });
  }

  const versions = await getDocumentVersions(docId);
  return NextResponse.json({ versions });
});
