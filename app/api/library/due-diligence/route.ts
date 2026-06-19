import { NextResponse } from "next/server";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import { listRequests, createRequest } from "@workspace/library/server/due-diligence";

export const GET = withLibraryAccess(async () => {
  const requests = await listRequests();
  return NextResponse.json(requests);
});

export const POST = withLibraryWrite(async (request: Request) => {
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
  if (typeof b.title !== "string" || !b.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (typeof b.partyName !== "string" || !b.partyName.trim()) {
    return NextResponse.json({ error: "partyName is required" }, { status: 400 });
  }

  const req = await createRequest(
    { title: b.title.trim(), partyName: b.partyName.trim() },
    0,
  );
  return NextResponse.json(req, { status: 201 });
});
