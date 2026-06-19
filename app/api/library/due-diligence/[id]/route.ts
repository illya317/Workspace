import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryAccess, withLibraryWrite } from "@workspace/platform/server/with-auth";
import type { RouteContext } from "@workspace/platform/server/with-auth";
import { parseRouteId } from "@workspace/platform/server/api";
import { getRequest, updateRequest, deleteRequest } from "@workspace/library/server/due-diligence";
import { getMaxConfidentialityLevel } from "@workspace/library/server/permissions";

const updateRequestSchema = z.object({
  title: z.string().optional(),
  status: z.enum(["draft", "reviewing", "approved", "cancelled"]).optional(),
  defaultConfidentialityLevel: z.coerce.number().int().min(0).max(4).optional(),
});

export const GET = withLibraryAccess(async (_req, user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const maxLevel = await getMaxConfidentialityLevel(user.userId);
  const req = await getRequest(id, maxLevel);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(req);
});

export const PATCH = withLibraryWrite(async (request: Request, _user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: z.infer<typeof updateRequestSchema>;
  try {
    const parsedBody = updateRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsedBody.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    data.title = body.title.trim();
  }
  if (body.status !== undefined) {
    data.status = body.status;
  }
  if (body.defaultConfidentialityLevel !== undefined) {
    data.defaultConfidentialityLevel = body.defaultConfidentialityLevel;
  }

  const updated = await updateRequest(id, data);
  return NextResponse.json(updated);
});

export const DELETE = withLibraryWrite(async (_req, _user, ctx?: RouteContext) => {
  const id = await parseRouteId(ctx?.params);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await deleteRequest(id);
  return NextResponse.json({ ok: true });
});
