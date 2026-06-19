import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import { listEnabledGeneratedSources } from "@workspace/library/server";

export const GET = withLibraryAccess(async () => {
  const sources = await listEnabledGeneratedSources();
  return NextResponse.json(sources);
});
