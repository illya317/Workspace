-- workspace:migration-mode=maintenance
-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_lockedPositionId_idx" ON "WorkResponsibilityReference"("lockedPositionId");

-- CreateIndex
CREATE INDEX "WorkResponsibilityReference_lockedEmployeePositionId_idx" ON "WorkResponsibilityReference"("lockedEmployeePositionId");

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_lockedEmployeeId_fkey" FOREIGN KEY ("lockedEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_lockedPositionId_fkey" FOREIGN KEY ("lockedPositionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_lockedEmployeePositionId_fkey" FOREIGN KEY ("lockedEmployeePositionId") REFERENCES "EmployeePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkResponsibilityReference" ADD CONSTRAINT "WorkResponsibilityReference_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
