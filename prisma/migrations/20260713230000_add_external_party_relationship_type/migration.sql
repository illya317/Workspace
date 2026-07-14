-- AlterTable
ALTER TABLE "ExternalParty"
ADD COLUMN "relatedPartyType" TEXT NOT NULL DEFAULT 'unrelated';

-- CheckConstraint
ALTER TABLE "ExternalParty"
ADD CONSTRAINT "ExternalParty_relatedPartyType_check"
CHECK ("relatedPartyType" IN (
  'unrelated',
  'group',
  'joint_venture_associate',
  'investor_influence',
  'key_management_related',
  'other_related'
));

-- CreateIndex
CREATE INDEX "ExternalParty_category_relatedPartyType_idx"
ON "ExternalParty"("category", "relatedPartyType");
