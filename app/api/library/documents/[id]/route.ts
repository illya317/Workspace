import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getDocument, updateDocumentMetadata } from "@/server/services/library/metadata";
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

  return NextResponse.json(doc);
});

export const PATCH = withLibraryWrite(async (request, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  const updated = await updateDocumentMetadata(docId, body, user.userId);
  return NextResponse.json(updated);
});
