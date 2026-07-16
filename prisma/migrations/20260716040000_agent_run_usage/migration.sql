-- workspace:migration-mode=expand
-- Persist Kimi-reported run telemetry without inventing zeroes for unavailable usage.
-- contextUsagePeak stores the raw 0..1 context_usage peak reported by Kimi Wire.
ALTER TABLE "AgentRun" ADD COLUMN "inputOtherTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "inputCacheReadTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "inputCacheCreationTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "contextUsagePeak" DOUBLE PRECISION;
ALTER TABLE "AgentRun" ADD COLUMN "runtimeStepCount" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "runtimeOutcome" TEXT;
