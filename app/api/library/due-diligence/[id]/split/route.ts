import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryWrite } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { parseRouteId } from "@workspace/platform/server/api";
import { getRequest, createQuestions, splitQuestionnaire } from "@workspace/library/server/due-diligence";

const splitRequestSchema = z.object({
  text: z.string().trim().min(1),
});

export const POST = withLibraryWrite(async (request: Request, _user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof splitRequestSchema>;
  try {
    const parsedBody = splitRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    body = parsedBody.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const questions = splitQuestionnaire(body.text);
  if (questions.length === 0) {
    return NextResponse.json({ error: "No questions found in text" }, { status: 400 });
  }

  const created = await createQuestions(id, questions);
  return NextResponse.json({ questions: created, count: created.length }, { status: 201 });
});
