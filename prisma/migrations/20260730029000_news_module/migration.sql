-- workspace:migration-mode=expand
CREATE TABLE "NewsReaction" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "itemKey" TEXT NOT NULL,
  "reportId" TEXT,
  "title" TEXT NOT NULL,
  "source" TEXT,
  "url" TEXT,
  "kind" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsReaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsReaction_kind_check" CHECK ("kind" IS NULL OR "kind" IN ('like', 'dislike'))
);

CREATE TABLE "NewsFeedback" (
  "id" SERIAL NOT NULL,
  "uid" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "submittedByUserId" INTEGER,
  "submittedByName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "response" TEXT,
  "handledByUserId" INTEGER,
  "handledByName" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsFeedback_category_check" CHECK ("category" IN ('suggestion', 'issue', 'question')),
  CONSTRAINT "NewsFeedback_status_check" CHECK ("status" IN ('submitted', 'in_review', 'resolved', 'closed'))
);

CREATE TABLE "NewsFeedbackEvent" (
  "id" SERIAL NOT NULL,
  "feedbackId" INTEGER NOT NULL,
  "actorUserId" INTEGER,
  "actorName" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsFeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsReaction_userId_itemKey_key" ON "NewsReaction"("userId", "itemKey");
CREATE INDEX "NewsReaction_itemKey_kind_idx" ON "NewsReaction"("itemKey", "kind");
CREATE INDEX "NewsReaction_userId_updatedAt_idx" ON "NewsReaction"("userId", "updatedAt");
CREATE UNIQUE INDEX "NewsFeedback_uid_key" ON "NewsFeedback"("uid");
CREATE UNIQUE INDEX "NewsFeedback_sourceKey_key" ON "NewsFeedback"("sourceKey");
CREATE INDEX "NewsFeedback_submittedByUserId_createdAt_idx" ON "NewsFeedback"("submittedByUserId", "createdAt");
CREATE INDEX "NewsFeedback_status_updatedAt_idx" ON "NewsFeedback"("status", "updatedAt");
CREATE INDEX "NewsFeedback_handledByUserId_status_idx" ON "NewsFeedback"("handledByUserId", "status");
CREATE INDEX "NewsFeedbackEvent_feedbackId_createdAt_idx" ON "NewsFeedbackEvent"("feedbackId", "createdAt");
CREATE INDEX "NewsFeedbackEvent_actorUserId_createdAt_idx" ON "NewsFeedbackEvent"("actorUserId", "createdAt");

ALTER TABLE "NewsReaction"
  ADD CONSTRAINT "NewsReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsFeedback"
  ADD CONSTRAINT "NewsFeedback_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsFeedback"
  ADD CONSTRAINT "NewsFeedback_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsFeedbackEvent"
  ADD CONSTRAINT "NewsFeedbackEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "NewsFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsFeedbackEvent"
  ADD CONSTRAINT "NewsFeedbackEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
