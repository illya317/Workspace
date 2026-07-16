import { NextResponse } from "next/server";
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { sourceCodeAgentTools } from "@workspace/platform/server/agent";
import { listAvailableAgentProfiles } from "@workspace/platform/server/agent/profile-directory";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return jsonErrorResponse("Unauthorized", 401);

  const profiles = await listAvailableAgentProfiles(user, [
    ...sourceCodeAgentTools,
    ...hrAgentTools,
    ...financeAgentTools,
    ...libraryAgentTools,
  ]);
  return NextResponse.json({
    profiles: profiles.map((profile) => ({
      id: profile.id,
      displayName: profile.displayName,
      roleName: profile.roleName,
    })),
  });
}
