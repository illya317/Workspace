import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getDocument, updateDocumentMetadata } from "@/server/services/library/metadata";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

async function checkDocAccess(docId: number, userId: number) {
  const doc = await getDocument(docId);
  if (!doc) return { ok: false as const, status: 404, error: "Not found" };
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (doc.confidentialityLevel > maxLevel) {
    return { ok: false as const, status: 403, error: "Higher confidentiality required" };
  }
  return { ok: true as const, doc };
}

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  return NextResponse.json(check.doc);
});

export const PATCH = withLibraryWrite(async (request, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await request.json();
  const updated = await updateDocumentMetadata(docId, body, user.userId);
  return NextResponse.json(updated);
});
