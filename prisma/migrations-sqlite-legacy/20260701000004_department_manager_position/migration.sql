ALTER TABLE "Department" ADD COLUMN "managerPositionId" INTEGER REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Department_managerPositionId_idx" ON "Department"("managerPositionId");
