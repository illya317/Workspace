-- workspace:migration-mode=expand
-- Separate HR virtual-employee identities from the runtimes that may execute them.
CREATE TABLE "AgentRuntimeBinding" (
    "id" SERIAL NOT NULL,
    "agentProfileId" INTEGER NOT NULL,
    "runtimeKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "interactive" BOOLEAN NOT NULL DEFAULT false,
    "capabilityKeysJson" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRuntimeBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRuntimeBinding_agentProfileId_runtimeKind_key"
  ON "AgentRuntimeBinding"("agentProfileId", "runtimeKind");
CREATE INDEX "AgentRuntimeBinding_runtimeKind_status_interactive_idx"
  ON "AgentRuntimeBinding"("runtimeKind", "status", "interactive");

ALTER TABLE "AgentRuntimeBinding"
  ADD CONSTRAINT "AgentRuntimeBinding_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing development identities are external execution identities. They must
-- not acquire a Workspace chat surface merely because an AgentProfile exists.
INSERT INTO "AgentRuntimeBinding"
  ("agentProfileId", "runtimeKind", status, interactive, "capabilityKeysJson", instructions,
   "createdBy", "editedBy", "createdAt", "updatedAt")
SELECT id, 'codex_local', 'active', FALSE,
       '["source.searchWorkspaceCode","source.proposePullRequest","code.write","test.run","git.commit"]',
       '在本地 Codex 任务中承担架构设计与代码开发；遵守仓库边界、人工授权和提交范围，不在 Workspace 对话界面执行。',
       "createdBy", "editedBy", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AgentProfile"
WHERE key = 'development.architecture';

INSERT INTO "AgentRuntimeBinding"
  ("agentProfileId", "runtimeKind", status, interactive, "capabilityKeysJson", instructions,
   "createdBy", "editedBy", "createdAt", "updatedAt")
SELECT id, 'codex_local', 'active', FALSE,
       '["source.searchWorkspaceCode","source.proposePullRequest","code.review","test.run"]',
       '在本地 Codex 任务中承担测试设计、代码审查与回归验证；输出发现和验证证据，不在 Workspace 对话界面执行。',
       "createdBy", "editedBy", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AgentProfile"
WHERE key = 'development.quality';

INSERT INTO "AgentRuntimeBinding"
  ("agentProfileId", "runtimeKind", status, interactive, "capabilityKeysJson", instructions,
   "createdBy", "editedBy", "createdAt", "updatedAt")
SELECT id, 'ci', 'active', FALSE,
       '["code.review","test.run","quality.gate"]',
       '在 CI 运行时执行自动化检查与质量门禁；仅产生检查结果和审查证据，不在 Workspace 对话界面执行。',
       "createdBy", "editedBy", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AgentProfile"
WHERE key = 'development.quality';

INSERT INTO "AgentRuntimeBinding"
  ("agentProfileId", "runtimeKind", status, interactive, "capabilityKeysJson", instructions,
   "createdBy", "editedBy", "createdAt", "updatedAt")
SELECT id, 'server_ops', 'active', FALSE,
       '["release.prepare","deploy.execute","runtime.verify","rollback.propose"]',
       '在受控服务器运维任务中承担发布、部署与运行态验证；遵循部署门禁和人工授权，不在 Workspace 对话界面执行。',
       "createdBy", "editedBy", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AgentProfile"
WHERE key = 'development.operations';
