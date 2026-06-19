import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getRequest, createQuestions, splitQuestionnaire } from "@workspace/library/server/due-diligence";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const splitRequestSchema = z.object({
  text: z.string().trim().min(1),
});

async function parseId(ctx?: RouteContext) {
  const parsedParams = paramsSchema.safeParse(await ctx!.params);
  return parsedParams.success ? parsedParams.data.id : null;
}

export const POST = withLibraryWrite(async (request: Request, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
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
