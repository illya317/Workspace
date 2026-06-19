import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";
import { getGenerator } from "@workspace/library/server/generators/registry";
import { upsertGeneratedDocument } from "@workspace/library/server/generators/generated-document";
import { getGeneratedSourceForRun } from "@workspace/library/server";

async function parseKey(ctx?: RouteContext) {
  const { key } = await ctx!.params;
  if (typeof key !== "string" || !key) return null;
  return key;
}

export const POST = withLibraryWrite(async (request: Request, user, ctx?: RouteContext) => {
  const key = await parseKey(ctx);
  if (key === null) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  // Check generator exists
  const gen = getGenerator(key);
  if (!gen) {
    return NextResponse.json({ error: "Generator not found" }, { status: 404 });
  }

  // Check source is enabled
  const source = await getGeneratedSourceForRun(key);
  if (!source || !source.enabled) {
    return NextResponse.json({ error: "Generator disabled" }, { status: 403 });
  }

  // Parse body
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

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const summary = typeof b.summary === "string" ? b.summary.trim() : undefined;

  // Validate confidentialityLevel
  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  const rawLevel = b.confidentialityLevel !== undefined ? Number(b.confidentialityLevel) : source.defaultConfidentialityLevel;
  if (!Number.isInteger(rawLevel) || rawLevel < 0 || rawLevel > 4) {
    return NextResponse.json({ error: "confidentialityLevel must be 0..4" }, { status: 400 });
  }
  if (rawLevel > maxLevel) {
    return NextResponse.json({ error: "confidentialityLevel exceeds your access level" }, { status: 403 });
  }

  // Run generator
  const output = await gen.generate({
    title,
    summary,
    ...(b as Record<string, unknown>),
  });

  // Persist
  const result = await upsertGeneratedDocument({
    generatorKey: key,
    title,
    summary,
    confidentialityLevel: rawLevel,
    categoryCode: source.outputCategory ?? undefined,
    categoryName: source.outputCategory ?? undefined,
    userId: user.userId,
  }, output);

  return NextResponse.json(result);
});
