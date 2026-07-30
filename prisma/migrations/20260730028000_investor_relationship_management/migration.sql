CREATE TABLE "InvestorShareholderProfile" (
    "id" SERIAL NOT NULL,
    "issuerCompanyId" INTEGER NOT NULL,
    "shareholderPartyId" INTEGER NOT NULL,
    "investorCategory" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "relationshipOwner" TEXT,
    "relationshipStatus" TEXT NOT NULL DEFAULT 'active',
    "communicationPreference" TEXT,
    "notes" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestorShareholderProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestorDueDiligenceRecord" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "issuerCompanyId" INTEGER NOT NULL,
    "investorPartyId" INTEGER,
    "investorOrganization" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorTitle" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "diligenceDate" DATE NOT NULL,
    "diligenceType" TEXT NOT NULL DEFAULT 'comprehensive',
    "visitMethod" TEXT NOT NULL DEFAULT 'onsite',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "hostName" TEXT,
    "ndaStatus" TEXT NOT NULL DEFAULT 'pending',
    "dataRoomStatus" TEXT NOT NULL DEFAULT 'not_opened',
    "focusAreas" TEXT,
    "followUpAction" TEXT,
    "nextFollowUpDate" DATE,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestorDueDiligenceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestorShareholderProfile_issuer_party_key" ON "InvestorShareholderProfile"("issuerCompanyId", "shareholderPartyId");
CREATE INDEX "InvestorShareholderProfile_party_idx" ON "InvestorShareholderProfile"("shareholderPartyId");
CREATE INDEX "InvestorShareholderProfile_issuer_status_idx" ON "InvestorShareholderProfile"("issuerCompanyId", "relationshipStatus");
CREATE INDEX "InvestorDueDiligence_issuer_archive_date_idx" ON "InvestorDueDiligenceRecord"("issuerCompanyId", "isArchived", "diligenceDate");
CREATE INDEX "InvestorDueDiligence_party_date_idx" ON "InvestorDueDiligenceRecord"("investorPartyId", "diligenceDate");
CREATE INDEX "InvestorDueDiligence_issuer_status_idx" ON "InvestorDueDiligenceRecord"("issuerCompanyId", "status");
CREATE UNIQUE INDEX "InvestorDueDiligenceRecord_sourceKey_key" ON "InvestorDueDiligenceRecord"("sourceKey");

ALTER TABLE "InvestorShareholderProfile" ADD CONSTRAINT "InvestorShareholderProfile_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestorShareholderProfile" ADD CONSTRAINT "InvestorShareholderProfile_shareholderPartyId_fkey" FOREIGN KEY ("shareholderPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestorDueDiligenceRecord" ADD CONSTRAINT "InvestorDueDiligenceRecord_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestorDueDiligenceRecord" ADD CONSTRAINT "InvestorDueDiligenceRecord_investorPartyId_fkey" FOREIGN KEY ("investorPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
