import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { getDocument } from "@workspace/library/server/metadata";
import { getDocumentVersions } from "@workspace/library/server/versions";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const { id } = await ctx!.params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) return jsonErrorResponse("Invalid id", 400);

  const doc = await getDocument(docId);
  if (!doc) return jsonErrorResponse("Not found", 404);

  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  if (doc.confidentialityLevel > maxLevel) {
    return jsonErrorResponse("Higher confidentiality required", 403);
  }

  const versions = await getDocumentVersions(docId);
  return NextResponse.json({ versions });
});
