import type { AgentExecutionContext } from "@workspace/platform/server/agent";

import { assertWorkItemStageAllowed } from "./work-okr-stage";

export async function assertSharedAgentWorkItemStageAllowed(input: {
  execution: AgentExecutionContext;
  planId: number | null;
  itemType: string;
  changesKrCurrentValue: boolean;
}) {
  const userIds = [...new Set([input.execution.requester.id, input.execution.actor.id])];
  const results = await Promise.all(userIds.map((actorUserId) => assertWorkItemStageAllowed({
    action: "update",
    planId: input.planId,
    itemType: input.itemType,
    actorUserId,
    changesKrCurrentValue: input.changesKrCurrentValue,
  })));
  const failure = results.find((result) => !result.ok);
  const first = results[0];
  return failure ?? first ?? { ok: false as const, error: "工作节点不存在或不可维护", status: 404 };
}
