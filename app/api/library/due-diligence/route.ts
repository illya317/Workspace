import { NextResponse } from "next/server";
import { z } from "zod";
import { withLibraryAccess, withLibraryWrite } from "@/lib/with-auth";
import { listRequests, createRequest } from "@workspace/library/server/due-diligence";

const createRequestSchema = z.object({
  title: z.string().trim().min(1),
  partyName: z.string().trim().min(1),
});

export const GET = withLibraryAccess(async () => {
  const requests = await listRequests();
  return NextResponse.json(requests);
});

export const POST = withLibraryWrite(async (request: Request) => {
  let body: z.infer<typeof createRequestSchema>;
  try {
    const parsedBody = createRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "title and partyName are required" }, { status: 400 });
    }
    body = parsedBody.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const req = await createRequest(
    { title: body.title, partyName: body.partyName },
    0,
  );
  return NextResponse.json(req, { status: 201 });
});
