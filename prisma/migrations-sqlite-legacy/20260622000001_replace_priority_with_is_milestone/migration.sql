-- Drop priority column and add isMilestone flag
ALTER TABLE "Project" DROP COLUMN "priority";
ALTER TABLE "Project" ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false;
