import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import { listCategories } from "@workspace/library/server/metadata";
import { buildConfidentialityFilter } from "@workspace/library/server/permissions";

export const GET = withLibraryAccess(async (_request: Request, user) => {
  const confFilter = await buildConfidentialityFilter(user.userId);
  const categories = await listCategories(
    typeof confFilter.confidentialityLevel === "object"
      ? confFilter.confidentialityLevel
      : undefined,
  );
  return NextResponse.json(categories);
});
