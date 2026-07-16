-- workspace:migration-mode=expand
-- Preserve the exact runtime responsibility/capability evidence used by each Agent run.
-- Nullable columns keep the expand migration safe for the previous writer.
ALTER TABLE "AgentRun" ADD COLUMN "runtimeBindingId" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "runtimeConfigJson" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "runtimeConfigHash" TEXT;

CREATE INDEX CONCURRENTLY "AgentRun_runtimeBindingId_startedAt_idx"
  ON "AgentRun"("runtimeBindingId", "startedAt");

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_runtimeBindingId_fkey"
  FOREIGN KEY ("runtimeBindingId") REFERENCES "AgentRuntimeBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
