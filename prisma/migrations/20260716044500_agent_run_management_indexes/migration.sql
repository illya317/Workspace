-- workspace:migration-mode=expand
-- Support the 30-day management aggregates and per-session latest-run lookup
-- without repeatedly scanning the unbounded AgentRun audit table.
CREATE INDEX CONCURRENTLY "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");
CREATE INDEX CONCURRENTLY "AgentRun_sessionId_startedAt_idx" ON "AgentRun"("sessionId", "startedAt");
