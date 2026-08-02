import { NextResponse } from "next/server";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import {
  agentBusinessApiTools,
  listAvailableAgentProfiles,
} from "@workspace/agent/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return jsonErrorResponse("Unauthorized", 401);

  const profiles = await listAvailableAgentProfiles(user, agentBusinessApiTools);
  return NextResponse.json({
    profiles: profiles.map((profile) => ({
      id: profile.id,
      displayName: profile.displayName,
      roleName: profile.roleName,
    })),
  });
}
