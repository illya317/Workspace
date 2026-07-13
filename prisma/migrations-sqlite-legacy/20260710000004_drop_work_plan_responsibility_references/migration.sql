PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkResponsibilityReference" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetKind" TEXT NOT NULL,
  "referenceRole" TEXT NOT NULL,
  "workItemId" INTEGER NOT NULL,
  "responsibilityNodeId" INTEGER,
  "lockedEmployeeId" INTEGER NOT NULL,
  "lockedPositionId" INTEGER,
  "lockedEmployeePositionId" INTEGER,
  "positionDescriptionId" INTEGER NOT NULL,
  "positionDescriptionVersionSnapshot" TEXT,
  "positionDescriptionUpdatedAtSnapshot" DATETIME,
  "nodeKeySnapshot" TEXT NOT NULL,
  "nodeTypeSnapshot" TEXT NOT NULL,
  "parentNodeKeySnapshot" TEXT,
  "pathLabelSnapshot" TEXT NOT NULL DEFAULT '',
  "titleSnapshot" TEXT NOT NULL,
  "contentSnapshot" TEXT NOT NULL DEFAULT '',
  "snapshotJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkResponsibilityReference_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkResponsibilityReference_responsibilityNodeId_fkey" FOREIGN KEY ("responsibilityNodeId") REFERENCES "PositionResponsibilityNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_WorkResponsibilityReference" (
  "id",
  "targetKind",
  "referenceRole",
  "workItemId",
  "responsibilityNodeId",
  "lockedEmployeeId",
  "lockedPositionId",
  "lockedEmployeePositionId",
  "positionDescriptionId",
  "positionDescriptionVersionSnapshot",
  "positionDescriptionUpdatedAtSnapshot",
  "nodeKeySnapshot",
  "nodeTypeSnapshot",
  "parentNodeKeySnapshot",
  "pathLabelSnapshot",
  "titleSnapshot",
  "contentSnapshot",
  "snapshotJson",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "targetKind",
  "referenceRole",
  "workItemId",
  "responsibilityNodeId",
  "lockedEmployeeId",
  "lockedPositionId",
  "lockedEmployeePositionId",
  "positionDescriptionId",
  "positionDescriptionVersionSnapshot",
  "positionDescriptionUpdatedAtSnapshot",
  "nodeKeySnapshot",
  "nodeTypeSnapshot",
  "parentNodeKeySnapshot",
  "pathLabelSnapshot",
  "titleSnapshot",
  "contentSnapshot",
  "snapshotJson",
  "createdAt",
  "updatedAt"
FROM "WorkResponsibilityReference"
WHERE "targetKind" = 'work_item'
  AND "workItemId" IS NOT NULL;

DROP TABLE "WorkResponsibilityReference";
ALTER TABLE "new_WorkResponsibilityReference" RENAME TO "WorkResponsibilityReference";

CREATE INDEX "WorkResponsibilityReference_targetKind_referenceRole_idx" ON "WorkResponsibilityReference"("targetKind", "referenceRole");
CREATE INDEX "WorkResponsibilityReference_workItemId_referenceRole_idx" ON "WorkResponsibilityReference"("workItemId", "referenceRole");
CREATE INDEX "WorkResponsibilityReference_lockedEmployeeId_idx" ON "WorkResponsibilityReference"("lockedEmployeeId");
CREATE INDEX "WorkResponsibilityReference_positionDescriptionId_idx" ON "WorkResponsibilityReference"("positionDescriptionId");
CREATE INDEX "WorkResponsibilityReference_responsibilityNodeId_idx" ON "WorkResponsibilityReference"("responsibilityNodeId");

PRAGMA foreign_keys=ON;
