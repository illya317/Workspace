ALTER TABLE "DepartmentCollaboration" ADD COLUMN "collaborationType" TEXT NOT NULL DEFAULT 'routine';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "triggerRule" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "scopeDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "inputRequirement" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "deliverable" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "acceptanceCriteria" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "responseTargetHours" INTEGER;
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "deliveryTargetDays" INTEGER;
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "effectiveFrom" DATETIME;
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "effectiveTo" DATETIME;
ALTER TABLE "DepartmentCollaboration" ADD COLUMN "escalationPolicy" TEXT NOT NULL DEFAULT '';

ALTER TABLE "DepartmentCollaborationDepartment" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'S';
