import { NextResponse } from "next/server";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { listWorkTaskSpaces } from "@workspace/work/server";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const result = await listWorkTaskSpaces(auth.user.userId);
  return NextResponse.json(result);
}
