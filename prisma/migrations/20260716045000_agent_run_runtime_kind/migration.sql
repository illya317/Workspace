-- workspace:migration-mode=expand
-- AgentRun exists today only for the Workspace/WeCom runtime. A default keeps
-- the previous writer safe during rolling replacement, while the new writer
-- persists the selected binding kind explicitly for every future run.
ALTER TABLE "AgentRun"
ADD COLUMN "runtimeKind" TEXT NOT NULL DEFAULT 'workspace';

UPDATE "AgentRun" AS run
SET "runtimeKind" = binding."runtimeKind"
FROM "AgentRuntimeBinding" AS binding
WHERE run."runtimeBindingId" = binding.id;
