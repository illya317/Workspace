import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryWrite } from "@workspace/platform/server/with-auth";
import { scanLibrary } from "@workspace/library/server/scan";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const scanRequestSchema = z.object({}).passthrough();

export const POST = withLibraryWrite(async (request: Request) => {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsedBody = scanRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) return jsonErrorResponse("Invalid request body", 400);
  }

  const result = await scanLibrary();
  return NextResponse.json(result);
});
