import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import {
  getMaterialSelectionAccess,
  listQuestionMaterialSelections,
  updateMaterialSelection,
  verifyQuestionBelongsToRequest,
} from "@workspace/library/server/due-diligence";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

async function parseIds(ctx?: RouteContext) {
  const params = await ctx!.params;
  const requestId = parseInt(params.id, 10);
  const questionId = parseInt(params.questionId, 10);
  if (isNaN(requestId) || isNaN(questionId)) return null;
  return { requestId, questionId };
}

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const ids = await parseIds(ctx);
  if (!ids) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const check = await verifyQuestionBelongsToRequest(ids.requestId, ids.questionId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  const selections = await listQuestionMaterialSelections(ids.questionId, maxLevel);

  return NextResponse.json(selections);
});

export const PATCH = withLibraryWrite(async (request: Request, user, ctx?: RouteContext) => {
  const ids = await parseIds(ctx);
  if (!ids) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const check = await verifyQuestionBelongsToRequest(ids.requestId, ids.questionId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (typeof b.selectionId !== "number") {
    return NextResponse.json({ error: "selectionId is required" }, { status: 400 });
  }
  if (typeof b.selected !== "boolean") {
    return NextResponse.json({ error: "selected boolean is required" }, { status: 400 });
  }

  // Verify selection belongs to this question and user can access the document
  const maxLevel = await getMaxConfidentialityLevel(user.userId);

  const selection = await getMaterialSelectionAccess(b.selectionId);
  if (!selection) return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  if (selection.questionId !== ids.questionId) {
    return NextResponse.json({ error: "Selection does not belong to this question" }, { status: 403 });
  }
  if (selection.document.confidentialityLevel > maxLevel) {
    return NextResponse.json({ error: "Document confidentiality exceeds your access level" }, { status: 403 });
  }

  const updated = await updateMaterialSelection(b.selectionId, {
    selected: b.selected,
    selectedBy: b.selected ? user.userId : undefined,
  });

  return NextResponse.json(updated);
});
