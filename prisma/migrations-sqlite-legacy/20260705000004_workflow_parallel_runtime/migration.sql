ALTER TABLE "ApprovalRequest" ADD COLUMN "activeWorkflowNodeKeysJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ApprovalRequest" ADD COLUMN "workflowJoinStateJson" TEXT NOT NULL DEFAULT '{}';
