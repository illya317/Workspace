-- workspace:migration-mode=maintenance
-- Employee.userId is the canonical User -> Employee identity link. User.employeeId
-- duplicated the business code without a database FK and contained one orphan value.
ALTER TABLE "User" DROP COLUMN "employeeId";
