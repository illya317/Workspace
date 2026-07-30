-- workspace:migration-mode=maintenance
-- Add governed period close workpapers and append-only review events. No tenant data is changed.

CREATE TABLE "FinanceCloseWorkpaper" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "taskKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "conclusion" TEXT,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "voucherRefs" JSONB NOT NULL DEFAULT '[]',
    "preparedByUserId" INTEGER,
    "preparedAt" TIMESTAMP(3),
    "reviewedByUserId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceCloseWorkpaper_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseWorkpaperEvent" (
    "id" SERIAL NOT NULL,
    "workpaperId" INTEGER NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "eventKind" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceCloseWorkpaperEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceCloseWorkpaper_companyId_periodId_taskKey_key" ON "FinanceCloseWorkpaper"("companyId", "periodId", "taskKey");
CREATE INDEX "FinanceCloseWorkpaper_periodId_status_idx" ON "FinanceCloseWorkpaper"("periodId", "status");
CREATE INDEX "FinanceCloseWorkpaper_preparedByUserId_idx" ON "FinanceCloseWorkpaper"("preparedByUserId");
CREATE INDEX "FinanceCloseWorkpaper_reviewedByUserId_idx" ON "FinanceCloseWorkpaper"("reviewedByUserId");
CREATE UNIQUE INDEX "FinanceCloseWorkpaperEvent_idempotencyKey_key" ON "FinanceCloseWorkpaperEvent"("idempotencyKey");
CREATE INDEX "FinanceCloseWorkpaperEvent_workpaperId_recordedAt_idx" ON "FinanceCloseWorkpaperEvent"("workpaperId", "recordedAt");
CREATE INDEX "FinanceCloseWorkpaperEvent_actorUserId_idx" ON "FinanceCloseWorkpaperEvent"("actorUserId");

ALTER TABLE "FinanceCloseWorkpaper" ADD CONSTRAINT "FinanceCloseWorkpaper_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseWorkpaper" ADD CONSTRAINT "FinanceCloseWorkpaper_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseWorkpaper" ADD CONSTRAINT "FinanceCloseWorkpaper_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseWorkpaper" ADD CONSTRAINT "FinanceCloseWorkpaper_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseWorkpaperEvent" ADD CONSTRAINT "FinanceCloseWorkpaperEvent_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceCloseWorkpaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceCloseWorkpaperEvent" ADD CONSTRAINT "FinanceCloseWorkpaperEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
