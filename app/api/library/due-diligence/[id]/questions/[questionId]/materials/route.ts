import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import {
  getMaterialSelectionAccess,
  listQuestionMaterialSelections,
  updateMaterialSelection,
  verifyQuestionBelongsToRequest,
} from "@workspace/library/server/due-diligence";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
  questionId: z.coerce.number().int().positive(),
});

const updateMaterialSelectionSchema = z.object({
  selectionId: z.number().int().positive(),
  selected: z.boolean(),
});

async function parseIds(ctx?: RouteContext) {
  const parsedParams = paramsSchema.safeParse(await ctx!.params);
  if (!parsedParams.success) return null;
  return { requestId: parsedParams.data.id, questionId: parsedParams.data.questionId };
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

  let body: z.infer<typeof updateMaterialSelectionSchema>;
  try {
    const parsedBody = updateMaterialSelectionSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "selectionId and selected are required" }, { status: 400 });
    }
    body = parsedBody.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify selection belongs to this question and user can access the document
  const maxLevel = await getMaxConfidentialityLevel(user.userId);

  const selection = await getMaterialSelectionAccess(body.selectionId);
  if (!selection) return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  if (selection.questionId !== ids.questionId) {
    return NextResponse.json({ error: "Selection does not belong to this question" }, { status: 403 });
  }
  if (selection.document.confidentialityLevel > maxLevel) {
    return NextResponse.json({ error: "Document confidentiality exceeds your access level" }, { status: 403 });
  }

  const updated = await updateMaterialSelection(body.selectionId, {
    selected: body.selected,
    selectedBy: body.selected ? user.userId : undefined,
  });

  return NextResponse.json(updated);
});
