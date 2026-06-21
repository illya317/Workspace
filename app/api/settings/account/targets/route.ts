import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { getUserTargets } from "@workspace/platform/server/user-targets";
import { z } from "zod";

const myTargetsQuerySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;
  myTargetsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  const targets = await getUserTargets(payload.userId);
  return NextResponse.json(targets);
}
