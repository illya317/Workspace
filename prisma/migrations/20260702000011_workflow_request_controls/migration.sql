ALTER TABLE "WorkflowPolicy" ADD COLUMN "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkflowPolicy" ADD COLUMN "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkflowPolicy" ADD COLUMN "requestCanCancel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkflowPolicy" ADD COLUMN "requestCanRevise" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ApprovalRequest" ADD COLUMN "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApprovalRequest" ADD COLUMN "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApprovalRequest" ADD COLUMN "requestCanCancel" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApprovalRequest" ADD COLUMN "requestCanRevise" BOOLEAN NOT NULL DEFAULT true;
