import { NextResponse } from "next/server";
import { withAuth } from "@workspace/platform/server/with-auth";
import { getQcConfigOverview } from "@workspace/production/server/qc";

export const GET = withAuth(async () => {
  const overview = await getQcConfigOverview();
  return NextResponse.json({ data: overview });
});
