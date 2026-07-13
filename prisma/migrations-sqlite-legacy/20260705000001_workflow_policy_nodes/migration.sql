ALTER TABLE "WorkflowPolicy" ADD COLUMN "workflowNodesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ApprovalRequest" ADD COLUMN "workflowNodesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ApprovalRequest" ADD COLUMN "activeWorkflowNodeKey" TEXT;
