import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@workspace/platform/server/prisma";

import type { AgentExecutionContext } from "./execution";
import { reconcileStaleAgentProposalExecutions } from "./proposal-execution-lease";
import type { AgentSessionRow } from "./sessions";
import { buildAgentRuntimeAuditSnapshot } from "./runtime-snapshot";
import type { AgentRunTelemetry } from "./runtime/contracts";
import { staleAgentRunReconciliation } from "./run-status";

function runId() {
  return `run_${randomUUID().replace(/-/g, "")}`;
}

export async function reconcileStaleAgentRuns(now = new Date()) {
  const reconciliation = staleAgentRunReconciliation(now);
  return prisma.agentRun.updateMany({
    where: { status: "running", startedAt: { lt: reconciliation.cutoff } },
    data: reconciliation.data,
  });
}

export async function startAgentRun(
  execution: AgentExecutionContext,
  session: AgentSessionRow,
) {
  await reconcileStaleAgentRuns();
  await reconcileStaleAgentProposalExecutions({ requesterUserId: execution.requester.id });
  const id = runId();
  const runtimeSnapshot = buildAgentRuntimeAuditSnapshot(execution.profile);
  await prisma.agentRun.create({
    data: {
      id,
      sessionId: session.id,
      requesterUserId: execution.requester.id,
      actorUserId: execution.actor.id,
      agentProfileId: execution.profile?.id ?? null,
      runtimeKind: execution.profile?.runtime.kind ?? "workspace",
      ...runtimeSnapshot,
      pagePath: session.pagePath,
    },
  });
  return id;
}

export async function finishAgentRun(
  id: string,
  input: {
    status: "succeeded" | "failed" | "aborted";
    toolKey?: string;
    resultType?: string;
    proposalId?: number;
    errorMessage?: string;
    telemetry?: AgentRunTelemetry;
  },
) {
  await prisma.agentRun.updateMany({
    where: { id, status: "running" },
    data: {
      status: input.status,
      toolKey: input.toolKey ?? null,
      resultType: input.resultType ?? null,
      proposalId: input.proposalId ?? null,
      errorMessage: input.errorMessage?.slice(0, 2_000) ?? null,
      inputOtherTokens: input.telemetry?.inputOtherTokens ?? null,
      inputCacheReadTokens: input.telemetry?.inputCacheReadTokens ?? null,
      inputCacheCreationTokens: input.telemetry?.inputCacheCreationTokens ?? null,
      outputTokens: input.telemetry?.outputTokens ?? null,
      contextUsagePeak: input.telemetry?.contextUsagePeak ?? null,
      runtimeStepCount: input.telemetry?.runtimeStepCount ?? null,
      runtimeOutcome: input.telemetry?.runtimeOutcome ?? null,
      finishedAt: new Date(),
    },
  });
}
