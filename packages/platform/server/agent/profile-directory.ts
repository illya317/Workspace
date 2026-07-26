import "server-only";

import type { AgentProfileDirectoryItem } from "@workspace/platform/types";
import type { SessionUser } from "@workspace/platform/types";
import { prisma } from "../prisma";
import {
  resolveAgentToolAccess,
  type AgentToolAccessResolution,
} from "./capabilities";
import type { AgentExecutionContext } from "./execution";
import { AgentExecutionError, resolveAgentExecutionContext } from "./execution-context";
import { ACTIVE_WORKSPACE_RUNTIME_WHERE } from "./runtime-binding";
import type { AgentTool } from "./tools";

interface AgentProfileDirectoryDependencies {
  loadProfileIds?: () => Promise<Array<{ id: number }>>;
  resolveExecution?: (
    requester: SessionUser,
    profileId: number,
  ) => Promise<AgentExecutionContext>;
  resolveToolAccess?: (
    execution: AgentExecutionContext,
    registeredTools: readonly AgentTool[],
  ) => Promise<AgentToolAccessResolution>;
}

/**
 * List only profiles that pass the same live identity and tool authorization
 * checks as an actual turn. A valid profile with zero requester-usable tools is
 * intentionally hidden instead of presenting an empty runtime in the toolbar.
 */
export async function listAvailableAgentProfiles(
  requester: SessionUser,
  registeredTools: readonly AgentTool[],
  dependencies: AgentProfileDirectoryDependencies = {},
): Promise<AgentProfileDirectoryItem[]> {
  const profiles = await (dependencies.loadProfileIds ?? (() => (
    prisma.agentProfile.findMany({
      where: {
        status: "active",
        runtimeBindings: { some: ACTIVE_WORKSPACE_RUNTIME_WHERE },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { id: true },
    })
  )))();
  const executionResolver = dependencies.resolveExecution ?? resolveAgentExecutionContext;
  const accessResolver = dependencies.resolveToolAccess
    ?? ((execution, tools) => resolveAgentToolAccess(execution, [...tools]));

  const resolved = await Promise.all(profiles.map(async ({ id }) => {
    try {
      const execution = await executionResolver(requester, id);
      const access = await accessResolver(execution, registeredTools);
      if (access.tools.length === 0) return null;
      const profile = access.execution?.profile ?? execution.profile;
      if (!profile) return null;
      return {
        id: profile.id,
        displayName: profile.displayName,
        roleName: profile.roleName,
      } satisfies AgentProfileDirectoryItem;
    } catch (error) {
      if (error instanceof AgentExecutionError) return null;
      throw error;
    }
  }));
  return resolved.filter((profile): profile is NonNullable<typeof profile> => profile !== null);
}
