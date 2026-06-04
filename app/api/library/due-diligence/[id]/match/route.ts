import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getRequest, clearMaterialSelections, createMaterialSelections } from "@/server/services/library/due-diligence";
import { matchDocumentsForQuestion } from "@/server/services/library/matching";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

async function parseId(ctx?: RouteContext) {
  const { id } = await ctx!.params;
  const num = parseInt(id, 10);
  if (isNaN(num)) return null;
  return num;
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
