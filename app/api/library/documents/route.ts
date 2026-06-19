import { NextResponse } from "next/server";
import { withLibraryAccess } from "@workspace/platform/server/with-auth";
import { listDocuments } from "@workspace/library/server/metadata";
import { buildConfidentialityFilter } from "@workspace/library/server/permissions";

export const GET = withLibraryAccess(async (request: Request, user) => {
  const { searchParams } = new URL(request.url);
  const filters = {
    categoryCode: searchParams.get("categoryCode") || undefined,
    directoryPath: searchParams.get("directoryPath") || undefined,
    status: searchParams.get("status") || undefined,
    origin: searchParams.get("origin") || undefined,
    confidentialityLevel: searchParams.get("confidentialityLevel")
      ? parseInt(searchParams.get("confidentialityLevel")!, 10)
      : undefined,
    keyword: searchParams.get("keyword") || undefined,
    docId: searchParams.get("docId") || undefined,
    tag: searchParams.get("tag") || undefined,
    page: parseInt(searchParams.get("page") || "1", 10),
    pageSize: parseInt(searchParams.get("pageSize") || "50", 10),
  };

  const confFilter = await buildConfidentialityFilter(user.userId);
  const result = await listDocuments({ ...filters, ...confFilter });
  return NextResponse.json(result);
});
