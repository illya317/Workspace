import type { RunResult, StatusUpdate, TokenUsage } from "@moonshot-ai/kimi-agent-sdk";

import type { AgentRunTelemetry } from "./contracts";

export type TurnTelemetryAccumulator = {
  currentStep: number | null;
  maxObservedStep: number | null;
  pendingTokenUsage: TokenUsage | null;
  tokenUsageByStep: Map<number, TokenUsage>;
  contextUsagePeak: number | null;
};

export function createTurnTelemetryAccumulator(): TurnTelemetryAccumulator {
  return {
    currentStep: null,
    maxObservedStep: null,
    pendingTokenUsage: null,
    tokenUsageByStep: new Map(),
    contextUsagePeak: null,
  };
}

export function beginTelemetryStep(accumulator: TurnTelemetryAccumulator, step: number) {
  if (accumulator.currentStep === null && accumulator.pendingTokenUsage) {
    accumulator.tokenUsageByStep.set(step, accumulator.pendingTokenUsage);
    accumulator.pendingTokenUsage = null;
  }
  accumulator.currentStep = step;
  accumulator.maxObservedStep = accumulator.maxObservedStep === null
    ? step
    : Math.max(accumulator.maxObservedStep, step);
}

export function observeStatusUpdate(accumulator: TurnTelemetryAccumulator, update: StatusUpdate) {
  if (update.context_usage !== null && update.context_usage !== undefined) {
    accumulator.contextUsagePeak = accumulator.contextUsagePeak === null
      ? update.context_usage
      : Math.max(accumulator.contextUsagePeak, update.context_usage);
  }
  if (!update.token_usage) return;
  const snapshot = { ...update.token_usage };
  if (accumulator.currentStep === null) {
    accumulator.pendingTokenUsage = snapshot;
    return;
  }
  accumulator.tokenUsageByStep.set(accumulator.currentStep, snapshot);
}

function buildTurnTelemetry(
  accumulator: TurnTelemetryAccumulator,
  runtimeOutcome: AgentRunTelemetry["runtimeOutcome"],
  runtimeStepCount: number | null,
): AgentRunTelemetry {
  const tokenUsage = [...accumulator.tokenUsageByStep.values()];
  if (accumulator.pendingTokenUsage) tokenUsage.push(accumulator.pendingTokenUsage);
  const totals = tokenUsage.length === 0
    ? null
    : tokenUsage.reduce((sum, usage) => ({
      inputOtherTokens: sum.inputOtherTokens + usage.input_other,
      inputCacheReadTokens: sum.inputCacheReadTokens + usage.input_cache_read,
      inputCacheCreationTokens: sum.inputCacheCreationTokens + usage.input_cache_creation,
      outputTokens: sum.outputTokens + usage.output,
    }), {
      inputOtherTokens: 0,
      inputCacheReadTokens: 0,
      inputCacheCreationTokens: 0,
      outputTokens: 0,
    });
  return {
    inputOtherTokens: totals?.inputOtherTokens ?? null,
    inputCacheReadTokens: totals?.inputCacheReadTokens ?? null,
    inputCacheCreationTokens: totals?.inputCacheCreationTokens ?? null,
    outputTokens: totals?.outputTokens ?? null,
    contextUsagePeak: accumulator.contextUsagePeak,
    runtimeStepCount,
    runtimeOutcome,
  };
}

export function finishTurnTelemetry(accumulator: TurnTelemetryAccumulator, result: RunResult) {
  return buildTurnTelemetry(
    accumulator,
    result.status,
    accumulator.maxObservedStep ?? result.steps ?? null,
  );
}

export function partialTurnTelemetry(
  accumulator: TurnTelemetryAccumulator,
  runtimeOutcome: "cancelled" | "timed_out",
) {
  return buildTurnTelemetry(accumulator, runtimeOutcome, accumulator.maxObservedStep);
}
