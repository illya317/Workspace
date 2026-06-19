import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryWrite } from "@workspace/platform/server/with-auth";
import { scanLibrary } from "@workspace/library/server/scan";

const scanRequestSchema = z.object({}).passthrough();

export const POST = withLibraryWrite(async (request: Request) => {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsedBody = scanRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await scanLibrary();
  return NextResponse.json(result);
});
