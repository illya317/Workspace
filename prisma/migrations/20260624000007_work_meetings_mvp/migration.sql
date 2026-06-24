CREATE TABLE "MeetingType" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "defaultVisibility" TEXT NOT NULL DEFAULT 'participants_only',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "MeetingSeries" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "typeId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "cadence" TEXT,
  "defaultVisibility" TEXT NOT NULL DEFAULT 'participants_only',
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingSeries_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Meeting" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "typeId" INTEGER NOT NULL,
  "seriesId" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "startAt" DATETIME,
  "endAt" DATETIME,
  "location" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'participants_only',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "ownerUserId" INTEGER,
  "secretaryUserId" INTEGER,
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Meeting_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MeetingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Meeting_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MeetingSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Meeting_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Meeting_secretaryUserId_fkey" FOREIGN KEY ("secretaryUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MeetingParticipant" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'participant',
  "canVote" BOOLEAN NOT NULL DEFAULT false,
  "attendanceStatus" TEXT NOT NULL DEFAULT 'invited',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MeetingAgendaItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "presenterUserId" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MeetingMinuteEntry" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "agendaItemId" INTEGER,
  "content" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'note',
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingMinuteEntry_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingMinuteEntry_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MeetingProposal" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "agendaItemId" INTEGER,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'open',
  "voteVisibility" TEXT NOT NULL DEFAULT 'named',
  "minVotesRequired" INTEGER,
  "createdBy" INTEGER,
  "closedBy" INTEGER,
  "closedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingProposal_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MeetingVote" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "proposalId" INTEGER NOT NULL,
  "voterUserId" INTEGER NOT NULL,
  "choice" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingVote_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MeetingDecision" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "agendaItemId" INTEGER,
  "proposalId" INTEGER,
  "kind" TEXT NOT NULL DEFAULT 'decision',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "effectiveDate" DATETIME,
  "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingDecision_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetingProposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MeetingActionCandidate" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "meetingId" INTEGER NOT NULL,
  "agendaItemId" INTEGER,
  "decisionId" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "targetKind" TEXT NOT NULL DEFAULT 'work_item',
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "linkedWorkItemId" INTEGER,
  "linkedProjectTaskId" INTEGER,
  "createdBy" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingActionCandidate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "MeetingDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_linkedWorkItemId_fkey" FOREIGN KEY ("linkedWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MeetingActionCandidate_linkedProjectTaskId_fkey" FOREIGN KEY ("linkedProjectTaskId") REFERENCES "ProjectTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "WorkItem" ADD COLUMN "sourceMeetingId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "sourceMeetingDecisionId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "sourceMeetingActionCandidateId" INTEGER;
ALTER TABLE "ProjectTask" ADD COLUMN "sourceMeetingDecisionId" INTEGER;
ALTER TABLE "ProjectTask" ADD COLUMN "sourceMeetingActionCandidateId" INTEGER;

CREATE UNIQUE INDEX "MeetingType_key_key" ON "MeetingType"("key");
CREATE INDEX "MeetingSeries_typeId_idx" ON "MeetingSeries"("typeId");
CREATE INDEX "Meeting_typeId_startAt_idx" ON "Meeting"("typeId", "startAt");
CREATE INDEX "Meeting_seriesId_startAt_idx" ON "Meeting"("seriesId", "startAt");
CREATE INDEX "Meeting_ownerUserId_idx" ON "Meeting"("ownerUserId");
CREATE INDEX "Meeting_secretaryUserId_idx" ON "Meeting"("secretaryUserId");
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");
CREATE INDEX "MeetingParticipant_meetingId_role_idx" ON "MeetingParticipant"("meetingId", "role");
CREATE INDEX "MeetingAgendaItem_meetingId_sortOrder_idx" ON "MeetingAgendaItem"("meetingId", "sortOrder");
CREATE INDEX "MeetingMinuteEntry_meetingId_agendaItemId_idx" ON "MeetingMinuteEntry"("meetingId", "agendaItemId");
CREATE INDEX "MeetingProposal_meetingId_status_idx" ON "MeetingProposal"("meetingId", "status");
CREATE INDEX "MeetingProposal_agendaItemId_idx" ON "MeetingProposal"("agendaItemId");
CREATE UNIQUE INDEX "MeetingVote_proposalId_voterUserId_key" ON "MeetingVote"("proposalId", "voterUserId");
CREATE INDEX "MeetingVote_voterUserId_idx" ON "MeetingVote"("voterUserId");
CREATE INDEX "MeetingDecision_meetingId_kind_idx" ON "MeetingDecision"("meetingId", "kind");
CREATE INDEX "MeetingDecision_proposalId_idx" ON "MeetingDecision"("proposalId");
CREATE INDEX "MeetingActionCandidate_meetingId_status_idx" ON "MeetingActionCandidate"("meetingId", "status");
CREATE INDEX "MeetingActionCandidate_decisionId_idx" ON "MeetingActionCandidate"("decisionId");
CREATE INDEX "MeetingActionCandidate_linkedWorkItemId_idx" ON "MeetingActionCandidate"("linkedWorkItemId");
CREATE INDEX "MeetingActionCandidate_linkedProjectTaskId_idx" ON "MeetingActionCandidate"("linkedProjectTaskId");
CREATE INDEX "WorkItem_sourceMeetingId_idx" ON "WorkItem"("sourceMeetingId");
CREATE INDEX "WorkItem_sourceMeetingDecisionId_idx" ON "WorkItem"("sourceMeetingDecisionId");
CREATE INDEX "WorkItem_sourceMeetingActionCandidateId_idx" ON "WorkItem"("sourceMeetingActionCandidateId");
CREATE INDEX "ProjectTask_sourceMeetingDecisionId_idx" ON "ProjectTask"("sourceMeetingDecisionId");
CREATE INDEX "ProjectTask_sourceMeetingActionCandidateId_idx" ON "ProjectTask"("sourceMeetingActionCandidateId");

INSERT INTO "MeetingType" ("key", "name", "description", "defaultVisibility", "sortOrder") VALUES
  ('company', '公司级会议', '公司年会、全员会、战略宣贯会', 'participants_only', 10),
  ('business_cycle', '周期经营会议', '周会、月度会、季度经营会', 'participants_only', 20),
  ('project', '项目管理会议', '立项会、评审会、里程碑会、复盘会', 'participants_only', 30),
  ('management', '管理层会议', '管理人员会议、核心人员会议、组织和预算会议', 'participants_only', 40),
  ('special', '专项会议', '风险、客户、跨部门协调、制度评审等专项会议', 'participants_only', 50);
