PRAGMA foreign_keys=OFF;

CREATE TABLE "new_WorkItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "targetType" TEXT NOT NULL DEFAULT 'personal',
    "targetId" INTEGER,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "urgency" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'doing',
    "ownerEmployeeId" INTEGER,
    "startDate" DATETIME,
    "dueDate" DATETIME,
    "linkedProjectId" INTEGER,
    "linkedProjectTaskId" INTEGER,
    "parentWorkItemId" INTEGER,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_WorkItem" (
    "id",
    "targetType",
    "targetId",
    "category",
    "content",
    "description",
    "importance",
    "urgency",
    "status",
    "ownerEmployeeId",
    "startDate",
    "dueDate",
    "linkedProjectId",
    "linkedProjectTaskId",
    "parentWorkItemId",
    "isArchived",
    "isPrivate",
    "sortOrder",
    "createdAt"
)
SELECT
    "id",
    "targetType",
    "targetId",
    "category",
    "content",
    '',
    "importance",
    "urgency",
    CASE
        WHEN "isArchived" = true THEN 'archived'
        WHEN "status" = 'done' THEN 'done'
        ELSE 'doing'
    END,
    "ownerEmployeeId",
    "startDate",
    "dueDate",
    "linkedProjectId",
    "linkedProjectTaskId",
    "parentWorkItemId",
    "isArchived",
    "isPrivate",
    "sortOrder",
    "createdAt"
FROM "WorkItem";

DROP TABLE "WorkItem";
ALTER TABLE "new_WorkItem" RENAME TO "WorkItem";

CREATE INDEX "WorkItem_targetType_targetId_category_idx" ON "WorkItem"("targetType", "targetId", "category");
CREATE INDEX "WorkItem_ownerEmployeeId_idx" ON "WorkItem"("ownerEmployeeId");
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");
CREATE INDEX "WorkItem_linkedProjectId_idx" ON "WorkItem"("linkedProjectId");
CREATE INDEX "WorkItem_linkedProjectTaskId_idx" ON "WorkItem"("linkedProjectTaskId");
CREATE INDEX "WorkItem_parentWorkItemId_idx" ON "WorkItem"("parentWorkItemId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
