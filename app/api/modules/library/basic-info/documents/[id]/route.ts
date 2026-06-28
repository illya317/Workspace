import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { jsonErrorResponse, parseRouteId } from "@workspace/platform/server/api";
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
  if (docId === null) return jsonErrorResponse("Invalid id", 400);

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return jsonErrorResponse(check.error, check.status);

  return NextResponse.json(check.doc);
});

export const PATCH = withLibraryAccess(async (request, user, ctx?: RouteContext) => {
  const docId = await parseRouteId(ctx?.params);
  if (docId === null) return jsonErrorResponse("Invalid id", 400);

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return jsonErrorResponse(check.error, check.status);

  const raw = await request.json();
  const validated = validateBody(raw);
  if (!validated.ok) return jsonErrorResponse(validated.error, 400);

  const body = validated.body;
  const writeFields = ["title", "summary", "docId", "tags", "categoryCode", "categoryName", "subcategoryPath", "status"] as const;
  const hasWriteField = writeFields.some((f) => body[f] !== undefined);
  const hasAdminField = body.confidentialityLevel !== undefined;

  if (hasWriteField && !(await checkLibraryWrite(user.userId))) {
    return jsonErrorResponse("No write permission", 403);
  }
  if (hasAdminField && !(await checkLibraryAdmin(user.userId))) {
    return jsonErrorResponse("No admin permission", 403);
  }

  if (body.confidentialityLevel !== undefined) {
    const maxLevel = await getMaxConfidentialityLevel(user.userId);
    if (body.confidentialityLevel > maxLevel) {
      return jsonErrorResponse(`Cannot set confidentialityLevel above your access level (${maxLevel})`, 403);
    }
  }

  const updated = await updateDocumentMetadata(docId, body, user.userId);
  return NextResponse.json(updated);
});

export const DELETE = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const docId = await parseRouteId(ctx?.params);
  if (docId === null) return jsonErrorResponse("Invalid id", 400);

  const check = await checkDocAccess(docId, user.userId);
  if (!check.ok) return jsonErrorResponse(check.error, check.status);

  if (!(await checkLibraryDelete(user.userId))) {
    return jsonErrorResponse("No delete permission", 403);
  }

  await archiveDocument(docId, user.userId);
  return NextResponse.json({ ok: true });
});
