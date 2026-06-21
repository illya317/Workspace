import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { parseRouteId } from "@workspace/platform/server/api";
import { getDocument, updateDocumentMetadata, archiveDocument } from "@workspace/library/server/metadata";
import { validateBody } from "@workspace/library/server/document-validation";
import {
  getMaxConfidentialityLevel,
  checkLibraryWrite,
  checkLibraryAdmin,
  checkLibraryDelete,
} from "@workspace/library/server/permissions";

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
  const docId = await parseRouteId(ctx?.params);
  if (docId === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  return NextResponse.json(check.doc);
});

export const PATCH = withLibraryAccess(async (request, user, ctx?: RouteContext) => {
  const docId = await parseRouteId(ctx?.params);
  if (docId === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const raw = await request.json();
  const validated = validateBody(raw);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const body = validated.body;
  const writeFields = ["title", "summary", "docId", "tags", "categoryCode", "categoryName", "subcategoryPath", "status"] as const;
  const hasWriteField = writeFields.some((f) => body[f] !== undefined);
  const hasAdminField = body.confidentialityLevel !== undefined;

  if (hasWriteField && !(await checkLibraryWrite(user.userId))) {
    return NextResponse.json({ error: "No write permission" }, { status: 403 });
  }
  if (hasAdminField && !(await checkLibraryAdmin(user.userId))) {
    return NextResponse.json({ error: "No admin permission" }, { status: 403 });
  }

  if (body.confidentialityLevel !== undefined) {
    const maxLevel = await getMaxConfidentialityLevel(user.userId);
    if (body.confidentialityLevel > maxLevel) {
      return NextResponse.json(
        { error: `Cannot set confidentialityLevel above your access level (${maxLevel})` },
        { status: 403 },
      );
    }
  }

  const updated = await updateDocumentMetadata(docId, body, user.userId);
  return NextResponse.json(updated);
});

export const DELETE = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const docId = await parseRouteId(ctx?.params);
  if (docId === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  if (!(await checkLibraryDelete(user.userId))) {
    return NextResponse.json({ error: "No delete permission" }, { status: 403 });
  }

  await archiveDocument(docId, user.userId);
  return NextResponse.json({ ok: true });
});
