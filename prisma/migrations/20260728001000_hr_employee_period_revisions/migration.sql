CREATE TABLE "EmployeePeriodRevision" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "employeeId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePeriodRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeePeriodRevision_employeeId_recordedAt_idx" ON "EmployeePeriodRevision"("employeeId", "recordedAt");
CREATE INDEX "EmployeePeriodRevision_entityType_periodId_recordedAt_idx" ON "EmployeePeriodRevision"("entityType", "periodId", "recordedAt");

ALTER TABLE "EmployeePeriodRevision" ADD CONSTRAINT "EmployeePeriodRevision_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeePeriodRevision" ADD CONSTRAINT "EmployeePeriodRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
