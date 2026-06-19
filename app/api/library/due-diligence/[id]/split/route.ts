import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getRequest, createQuestions, splitQuestionnaire } from "@workspace/library/server/due-diligence";

async function parseId(ctx?: RouteContext) {
  const { id } = await ctx!.params;
  const num = parseInt(id, 10);
  if (isNaN(num)) return null;
  return num;
}

export const POST = withLibraryWrite(async (request: Request, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  if (typeof b.text !== "string" || !b.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const questions = splitQuestionnaire(b.text.trim());
  if (questions.length === 0) {
    return NextResponse.json({ error: "No questions found in text" }, { status: 400 });
  }

  const created = await createQuestions(id, questions);
  return NextResponse.json({ questions: created, count: created.length }, { status: 201 });
});
