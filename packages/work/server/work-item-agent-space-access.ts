import type { AgentExecutionContext } from "@workspace/platform/server/agent";

import type { WorkSpaceTargetType } from "./access";
import { intersectWorkSpaces } from "./agent-work-overview-model";
import { listWorkTaskSpaces } from "./task-spaces";

/** Delegated Work reads and writes use the requester/actor space intersection. */
export async function sharedAgentWorkSpace(
  execution: AgentExecutionContext,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  const [actorResult, requesterResult] = await Promise.all([
    listWorkTaskSpaces(execution.actor.id),
    execution.actor.id === execution.requester.id
      ? Promise.resolve(null)
      : listWorkTaskSpaces(execution.requester.id),
  ]);
  const spaces = requesterResult
    ? intersectWorkSpaces(actorResult.spaces, requesterResult.spaces)
    : actorResult.spaces;
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) ?? null;
}
