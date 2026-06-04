import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import type { RouteContext } from "@/lib/with-auth";
import { getRequest, updateRequest, deleteRequest } from "@/server/services/library/due-diligence";

async function parseId(ctx?: RouteContext) {
  const { id } = await ctx!.params;
  const num = parseInt(id, 10);
  if (isNaN(num)) return null;
  return num;
}

export const GET = withLibraryAccess(async (_req, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const req = await getRequest(id);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(req);
});

const VALID_STATUSES = ["draft", "reviewing", "approved", "provided", "cancelled"];

export const PATCH = withLibraryWrite(async (request: Request, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

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
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== "string") return NextResponse.json({ error: "title must be a string" }, { status: 400 });
    data.title = b.title.trim();
  }
  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as string)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    data.status = b.status;
  }
  if (b.defaultConfidentialityLevel !== undefined) {
    const level = Number(b.defaultConfidentialityLevel);
    if (!Number.isInteger(level) || level < 0 || level > 4) {
      return NextResponse.json({ error: "defaultConfidentialityLevel must be an integer 0..4" }, { status: 400 });
    }
    data.defaultConfidentialityLevel = level;
  }

  const updated = await updateRequest(id, data);
  return NextResponse.json(updated);
});

export const DELETE = withLibraryWrite(async (_req, _user, ctx?: RouteContext) => {
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await deleteRequest(id);
  return NextResponse.json({ ok: true });
});
