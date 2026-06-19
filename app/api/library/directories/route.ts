import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import { listDirectories } from "@workspace/library/server/directories";
import { buildConfidentialityFilter } from "@workspace/library/server/permissions";

export const GET = withLibraryAccess(async (_request: Request, user) => {
  const confFilter = await buildConfidentialityFilter(user.userId);
  const directories = await listDirectories(
    typeof confFilter.confidentialityLevel === "object"
      ? confFilter.confidentialityLevel
      : undefined,
  );
  return NextResponse.json(directories);
});
