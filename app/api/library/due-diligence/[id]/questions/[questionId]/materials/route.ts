import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { updateMaterialSelection } from "@/server/services/library/due-diligence";
import { getMaxConfidentialityLevel } from "@/server/services/library/permissions";

async function parseIds(ctx?: RouteContext) {
  const params = await ctx!.params;
  const requestId = parseInt(params.id, 10);
  const questionId = parseInt(params.questionId, 10);
  if (isNaN(requestId) || isNaN(questionId)) return null;
  return { requestId, questionId };
}

/** Verify that the question belongs to the request */
async function verifyQuestionBelongs(requestId: number, questionId: number) {
  const question = await prisma.dueDiligenceQuestion.findUnique({
    where: { id: questionId },
    select: { requestId: true },
  });
  if (!question) return { ok: false as const, status: 404, error: "Question not found" };
  if (question.requestId !== requestId) {
    return { ok: false as const, status: 403, error: "Question does not belong to this request" };
  }
  return { ok: true as const };
}

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const ids = await parseIds(ctx);
  if (!ids) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const check = await verifyQuestionBelongs(ids.requestId, ids.questionId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const maxLevel = await getMaxConfidentialityLevel(user.userId);

  const selections = await prisma.dueDiligenceMaterialSelection.findMany({
    where: {
      questionId: ids.questionId,
      document: { confidentialityLevel: { lte: maxLevel } },
    },
    include: {
      document: { select: { id: true, title: true, fileName: true, categoryName: true, confidentialityLevel: true } },
      documentVersion: { select: { id: true, versionNo: true } },
    },
    orderBy: { matchScore: "desc" },
  });

  return NextResponse.json(selections);
});

export const PATCH = withLibraryWrite(async (request: Request, user, ctx?: RouteContext) => {
  const ids = await parseIds(ctx);
  if (!ids) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const check = await verifyQuestionBelongs(ids.requestId, ids.questionId);
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

  // Verify selection belongs to this question
  const selection = await prisma.dueDiligenceMaterialSelection.findUnique({
    where: { id: b.selectionId },
    select: { questionId: true },
  });
  if (!selection) return NextResponse.json({ error: "Selection not found" }, { status: 404 });
  if (selection.questionId !== ids.questionId) {
    return NextResponse.json({ error: "Selection does not belong to this question" }, { status: 403 });
  }

  const updated = await updateMaterialSelection(b.selectionId, {
    selected: b.selected,
    selectedBy: b.selected ? user.userId : undefined,
  });

  return NextResponse.json(updated);
});
