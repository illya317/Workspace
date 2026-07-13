CREATE TABLE "DepartmentManagerEmployee" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "departmentId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentManagerEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DepartmentManagerEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DepartmentManagerEmployee_departmentId_employeeId_key" ON "DepartmentManagerEmployee"("departmentId", "employeeId");
CREATE INDEX "DepartmentManagerEmployee_employeeId_idx" ON "DepartmentManagerEmployee"("employeeId");

INSERT OR IGNORE INTO "DepartmentManagerEmployee" ("departmentId", "employeeId")
SELECT d."id", ep."employeeId"
FROM "Department" d
JOIN "EmployeePosition" ep ON ep."positionId" = d."managerPositionId"
JOIN "Employment" employment ON employment."employeeId" = ep."employeeId" AND employment."isActive" = 1
WHERE d."managerPositionId" IS NOT NULL
  AND (ep."endDate" IS NULL OR ep."endDate" = "" OR ep."endDate" >= date('now'));
