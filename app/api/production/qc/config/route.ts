import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { checkPermission } from "@workspace/platform/server/auth";
import { getQcConfigOverview } from "@/server/services/production/qc";

export const GET = withAuth(async () => {
  const overview = await getQcConfigOverview();
  return NextResponse.json({ data: overview });
}, (userId) => checkPermission(userId, "production.qc", "access"));
