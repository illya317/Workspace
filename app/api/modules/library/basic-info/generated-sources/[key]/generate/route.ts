import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryWrite } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";
import { getGenerator } from "@workspace/library/server/generators/registry";
import { upsertGeneratedDocument } from "@workspace/library/server/generators/generated-document";
import { getGeneratedSourceForRun } from "@workspace/library/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const paramsSchema = z.object({
  key: z.string().trim().min(1),
});

const generateRequestSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  confidentialityLevel: z.coerce.number().int().min(0).max(4).optional(),
}).passthrough();

async function parseKey(ctx?: RouteContext) {
  const parsedParams = paramsSchema.safeParse(await ctx!.params);
  return parsedParams.success ? parsedParams.data.key : null;
}

export const POST = withLibraryWrite(async (request: Request, user, ctx?: RouteContext) => {
  const key = await parseKey(ctx);
  if (key === null) {
    return jsonErrorResponse("Invalid key", 400);
  }

  // Check generator exists
  const gen = getGenerator(key);
  if (!gen) {
    return jsonErrorResponse("Generator not found", 404);
  }

  // Check source is enabled
  const source = await getGeneratedSourceForRun(key);
  if (!source || !source.enabled) {
    return jsonErrorResponse("Generator disabled", 403);
  }

  // Parse body
  let body: z.infer<typeof generateRequestSchema>;
  try {
    const parsedBody = generateRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return jsonErrorResponse("title is required", 400);
    }
    body = parsedBody.data;
  } catch {
    return jsonErrorResponse("Invalid JSON", 400);
  }

  const title = body.title;
  const summary = body.summary;

  // Validate confidentialityLevel
  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  const rawLevel = body.confidentialityLevel ?? source.defaultConfidentialityLevel;
  if (!Number.isInteger(rawLevel) || rawLevel < 0 || rawLevel > 4) {
    return jsonErrorResponse("confidentialityLevel must be 0..4", 400);
  }
  if (rawLevel > maxLevel) {
    return jsonErrorResponse("confidentialityLevel exceeds your access level", 403);
  }

  // Run generator
  const output = await gen.generate({
    ...body,
    title,
    summary,
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
