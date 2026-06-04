import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import { listDirectories } from "@/server/services/library/directories";
import { buildConfidentialityFilter } from "@/server/services/library/permissions";

export const GET = withLibraryAccess(async (_request: Request, user) => {
  const confFilter = await buildConfidentialityFilter(user.userId);
  const directories = await listDirectories(
    typeof confFilter.confidentialityLevel === "object"
      ? confFilter.confidentialityLevel
      : undefined,
  );
  return NextResponse.json(directories);
});
