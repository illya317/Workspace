import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { updateMaterialSelection } from "@/server/services/library/due-diligence";

async function parseIds(ctx?: RouteContext) {
  const params = await ctx!.params;
  const requestId = parseInt(params.id, 10);
  const questionId = parseInt(params.questionId, 10);
  if (isNaN(requestId) || isNaN(questionId)) return null;
  return { requestId, questionId };
}

export const GET = withLibraryAccess(async (_req, _user, ctx?: RouteContext) => {
  const ids = await parseIds(ctx);
  if (!ids) return NextResponse.json({ error: "Invalid ids" }, { status: 400 });

  const selections = await prisma.dueDiligenceMaterialSelection.findMany({
    where: { questionId: ids.questionId },
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

  const updated = await updateMaterialSelection(b.selectionId, {
    selected: b.selected,
    selectedBy: b.selected ? user.userId : undefined,
  });

  return NextResponse.json(updated);
});
