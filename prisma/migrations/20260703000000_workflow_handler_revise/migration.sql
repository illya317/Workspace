ALTER TABLE "ApprovalRequest" ADD COLUMN "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkflowPolicy" ADD COLUMN "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true;
