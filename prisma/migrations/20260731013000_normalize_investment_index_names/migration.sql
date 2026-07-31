-- workspace:migration-mode=expand
-- Normalize PostgreSQL-truncated index names to the identifiers expected by the Prisma schema.
ALTER INDEX "InvestmentEnterpriseContract_profileId_expiryDate_noticeDate_id"
  RENAME TO "InvestmentEnterpriseContract_profileId_expiryDate_noticeDat_idx";

ALTER INDEX "InvestmentEnterpriseDiligenceItem_profileId_riskLevel_dueDate_i"
  RENAME TO "InvestmentEnterpriseDiligenceItem_profileId_riskLevel_dueDa_idx";

ALTER INDEX "InvestmentEnterpriseDiligenceItem_profileId_workstream_status_i"
  RENAME TO "InvestmentEnterpriseDiligenceItem_profileId_workstream_stat_idx";

ALTER INDEX "InvestmentEnterpriseDocumentLink_profileId_libraryDocumentUid_k"
  RENAME TO "InvestmentEnterpriseDocumentLink_profileId_libraryDocumentU_key";

ALTER INDEX "InvestmentEnterpriseMonitoringRecord_profileId_status_periodEnd"
  RENAME TO "InvestmentEnterpriseMonitoringRecord_profileId_status_perio_idx";
