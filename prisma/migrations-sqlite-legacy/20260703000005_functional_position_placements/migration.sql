CREATE TABLE "FunctionalPositionPlacement" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "positionId" INTEGER NOT NULL,
  "departmentId" INTEGER NOT NULL,
  "reportToPositionId" INTEGER,
  "headcount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FunctionalPositionPlacement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FunctionalPositionPlacement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FunctionalPositionPlacement_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FunctionalPositionPlacement_positionId_departmentId_key" ON "FunctionalPositionPlacement"("positionId", "departmentId");
CREATE INDEX "FunctionalPositionPlacement_departmentId_idx" ON "FunctionalPositionPlacement"("departmentId");
CREATE INDEX "FunctionalPositionPlacement_reportToPositionId_idx" ON "FunctionalPositionPlacement"("reportToPositionId");
CREATE INDEX "FunctionalPositionPlacement_isActive_idx" ON "FunctionalPositionPlacement"("isActive");

ALTER TABLE "EmployeePosition" ADD COLUMN "functionalPlacementId" INTEGER REFERENCES "FunctionalPositionPlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EmployeePosition_functionalPlacementId_idx" ON "EmployeePosition"("functionalPlacementId");
