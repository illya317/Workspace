import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { getRequest, clearMaterialSelections, createMaterialSelections } from "@workspace/library/server/due-diligence";
import { matchDocumentsForQuestion } from "@workspace/library/server/matching";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

async function parseId(ctx?: RouteContext) {
  const parsedParams = routeIdParamsSchema.safeParse(await ctx!.params);
  return parsedParams.success ? parsedParams.data.id : null;
}

export const POST = withLibraryWrite(async (request: Request, user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  const effectiveMax = Math.min(req.defaultConfidentialityLevel, maxLevel);

  // Clear old recommendations first (optional: only clear unselected ones)
  for (const q of req.questions) {
    await clearMaterialSelections(q.id);
  }

  // Match for each question
  const results: Array<{ questionId: number; matches: Awaited<ReturnType<typeof matchDocumentsForQuestion>> }> = [];
  for (const q of req.questions) {
    const matches = await matchDocumentsForQuestion(q.questionText, effectiveMax, 5);
    if (matches.length > 0) {
      await createMaterialSelections(
        q.id,
        matches.map((m) => ({
          documentId: m.documentId,
          documentVersionId: m.documentVersionId ?? undefined,
          matchScore: m.matchScore,
          reason: m.reason,
        })),
      );
    }
    results.push({ questionId: q.id, matches });
  }

  return NextResponse.json({ results });
});
