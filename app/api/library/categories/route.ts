import { NextResponse } from "next/server";
import { withLibraryAccess } from "@/lib/with-auth";
import { listCategories } from "@/server/services/library/metadata";
import { buildConfidentialityFilter } from "@/server/services/library/permissions";

export const GET = withLibraryAccess(async (_request: Request, user) => {
  const confFilter = await buildConfidentialityFilter(user.userId);
  const categories = await listCategories(
    typeof confFilter.confidentialityLevel === "object"
      ? confFilter.confidentialityLevel
      : undefined,
  );
  return NextResponse.json(categories);
});
