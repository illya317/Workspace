CREATE TABLE "PositionResponsibilityNode" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "positionDescriptionId" INTEGER NOT NULL,
  "parentId" INTEGER,
  "nodeKey" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "pathLabel" TEXT NOT NULL DEFAULT '',
  "sourcePath" TEXT NOT NULL DEFAULT '',
  "sourceHash" TEXT NOT NULL,
  "descriptionVersion" TEXT,
  "descriptionUpdatedAt" DATETIME,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionResponsibilityNode_positionDescriptionId_fkey" FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionResponsibilityNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PositionResponsibilityNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkResponsibilityReference" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetKind" TEXT NOT NULL,
  "referenceRole" TEXT NOT NULL,
  "workPlanId" INTEGER,
  "workItemId" INTEGER,
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
  CONSTRAINT "WorkResponsibilityReference_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkResponsibilityReference_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkResponsibilityReference_responsibilityNodeId_fkey" FOREIGN KEY ("responsibilityNodeId") REFERENCES "PositionResponsibilityNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PositionResponsibilityNode_nodeKey_key" ON "PositionResponsibilityNode"("nodeKey");
CREATE INDEX "PositionResponsibilityNode_positionDescriptionId_nodeType_isActive_idx" ON "PositionResponsibilityNode"("positionDescriptionId", "nodeType", "isActive");
CREATE INDEX "PositionResponsibilityNode_positionDescriptionId_parentId_sortOrder_idx" ON "PositionResponsibilityNode"("positionDescriptionId", "parentId", "sortOrder");
CREATE INDEX "PositionResponsibilityNode_sourceHash_idx" ON "PositionResponsibilityNode"("sourceHash");
CREATE INDEX "WorkResponsibilityReference_targetKind_referenceRole_idx" ON "WorkResponsibilityReference"("targetKind", "referenceRole");
CREATE INDEX "WorkResponsibilityReference_workPlanId_referenceRole_idx" ON "WorkResponsibilityReference"("workPlanId", "referenceRole");
CREATE INDEX "WorkResponsibilityReference_workItemId_referenceRole_idx" ON "WorkResponsibilityReference"("workItemId", "referenceRole");
CREATE INDEX "WorkResponsibilityReference_lockedEmployeeId_idx" ON "WorkResponsibilityReference"("lockedEmployeeId");
CREATE INDEX "WorkResponsibilityReference_positionDescriptionId_idx" ON "WorkResponsibilityReference"("positionDescriptionId");
CREATE INDEX "WorkResponsibilityReference_responsibilityNodeId_idx" ON "WorkResponsibilityReference"("responsibilityNodeId");
