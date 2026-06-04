import { NextResponse } from "next/server";
import { withLibraryWrite } from "@/lib/with-auth";
import { scanLibrary } from "@/server/services/library/scan";

export const POST = withLibraryWrite(async () => {
  const result = await scanLibrary();
  return NextResponse.json(result);
});
