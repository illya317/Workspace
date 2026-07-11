-- CreateTable
CREATE TABLE "HrPerformanceReview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "okrCycleId" INTEGER NOT NULL,
    "approvalRequestId" INTEGER,
    "selfScore" INTEGER,
    "selfComment" TEXT NOT NULL DEFAULT '',
    "managerScore" INTEGER,
    "managerComment" TEXT NOT NULL DEFAULT '',
    "finalScore" INTEGER NOT NULL,
    "finalGrade" TEXT NOT NULL,
    "hrComment" TEXT NOT NULL DEFAULT '',
    "okrSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "archivedByUserId" INTEGER,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrPerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HrPerformanceReview_employeeId_okrCycleId_key" ON "HrPerformanceReview"("employeeId", "okrCycleId");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_okrCycleId_idx" ON "HrPerformanceReview"("okrCycleId");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_approvalRequestId_idx" ON "HrPerformanceReview"("approvalRequestId");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_finalGrade_idx" ON "HrPerformanceReview"("finalGrade");

-- CreateIndex
CREATE INDEX "HrPerformanceReview_archivedAt_idx" ON "HrPerformanceReview"("archivedAt");
