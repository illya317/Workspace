-- Keep the canonical Company.id reference and the imported/display code snapshot aligned.
CREATE FUNCTION "sync_company_id_from_code"() RETURNS trigger AS $$
DECLARE
  resolved_id INTEGER;
  resolved_code TEXT;
BEGIN
  IF NEW."companyId" IS NOT NULL THEN
    SELECT id, code INTO resolved_id, resolved_code FROM "Company" WHERE id = NEW."companyId";
    IF resolved_id IS NULL THEN
      RAISE EXCEPTION 'Unknown Company.id: %', NEW."companyId";
    END IF;
    IF NULLIF(BTRIM(NEW."companyCode"), '') IS NOT NULL AND NEW."companyCode" <> resolved_code THEN
      RAISE EXCEPTION 'Company reference mismatch: id % is code %, not %', NEW."companyId", resolved_code, NEW."companyCode";
    END IF;
    NEW."companyCode" := resolved_code;
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(NEW."companyCode"), '') IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO resolved_id FROM "Company" WHERE code = NEW."companyCode";
  IF resolved_id IS NULL THEN
    RAISE EXCEPTION 'Unknown Company.code: %', NEW."companyCode";
  END IF;
  NEW."companyId" := resolved_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "sync_employment_company_reference"() RETURNS trigger AS $$
DECLARE
  resolved_id INTEGER;
  resolved_name TEXT;
BEGIN
  IF NEW."companyId" IS NOT NULL THEN
    SELECT c.id, p.name INTO resolved_id, resolved_name
    FROM "Company" c JOIN "Party" p ON p.id = c."partyId"
    WHERE c.id = NEW."companyId";
    IF resolved_id IS NULL THEN
      RAISE EXCEPTION 'Unknown Employment Company.id: %', NEW."companyId";
    END IF;
    IF NULLIF(BTRIM(NEW."currentCompany"), '') IS NOT NULL AND NEW."currentCompany" <> resolved_name THEN
      RAISE EXCEPTION 'Employment company mismatch: id % is %, not %', NEW."companyId", resolved_name, NEW."currentCompany";
    END IF;
    NEW."currentCompany" := resolved_name;
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(NEW."currentCompany"), '') IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.id INTO resolved_id
  FROM "Company" c JOIN "Party" p ON p.id = c."partyId"
  WHERE p.name = NEW."currentCompany";
  IF resolved_id IS NULL THEN
    RAISE EXCEPTION 'Employment.currentCompany does not match an internal Company short name: %', NEW."currentCompany";
  END IF;
  NEW."companyId" := resolved_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "sync_origin_company_id_from_code"() RETURNS trigger AS $$
DECLARE resolved_id INTEGER; resolved_code TEXT;
BEGIN
  IF NEW."originCompanyId" IS NOT NULL THEN
    SELECT id, code INTO resolved_id, resolved_code FROM "Company" WHERE id = NEW."originCompanyId";
    IF resolved_id IS NULL THEN RAISE EXCEPTION 'Unknown origin Company.id: %', NEW."originCompanyId"; END IF;
    IF NULLIF(BTRIM(NEW."originCompanyCode"), '') IS NOT NULL AND NEW."originCompanyCode" <> resolved_code THEN
      RAISE EXCEPTION 'Origin company reference mismatch';
    END IF;
    NEW."originCompanyCode" := resolved_code;
  ELSIF NULLIF(BTRIM(NEW."originCompanyCode"), '') IS NOT NULL THEN
    SELECT id INTO resolved_id FROM "Company" WHERE code = NEW."originCompanyCode";
    IF resolved_id IS NULL THEN RAISE EXCEPTION 'Unknown origin Company.code: %', NEW."originCompanyCode"; END IF;
    NEW."originCompanyId" := resolved_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "sync_source_company_id_from_code"() RETURNS trigger AS $$
DECLARE resolved_id INTEGER; resolved_code TEXT;
BEGIN
  IF NEW."sourceCompanyId" IS NOT NULL THEN
    SELECT id, code INTO resolved_id, resolved_code FROM "Company" WHERE id = NEW."sourceCompanyId";
    IF resolved_id IS NULL THEN RAISE EXCEPTION 'Unknown source Company.id: %', NEW."sourceCompanyId"; END IF;
    IF NEW."sourceCompanyCode" <> resolved_code THEN RAISE EXCEPTION 'Source company reference mismatch'; END IF;
    NEW."sourceCompanyCode" := resolved_code;
  ELSE
    SELECT id INTO resolved_id FROM "Company" WHERE code = NEW."sourceCompanyCode";
    IF resolved_id IS NULL THEN RAISE EXCEPTION 'Unknown source Company.code: %', NEW."sourceCompanyCode"; END IF;
    NEW."sourceCompanyId" := resolved_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'FinanceAccount', 'FinancePeriod', 'FinanceVoucher', 'FinanceAccountBalance', 'FinanceBalanceSnapshot',
    'FinanceAssetCategoryPolicy', 'FinanceAssetCard', 'FinanceAssetImportBatch',
    'FinanceAssetAdjustment', 'FinanceAssetImpairmentAssessment', 'FinanceAssetDisposal', 'FinanceAssetAcquisitionEvidence',
    'FinanceBudgetVersion', 'FinanceCashFlowItem', 'FinanceCashFlowAllocation', 'FinanceCashFlowAllocationAdjustment',
    'FinanceConsolidationEntryLine', 'FinanceConsolidationEntitySnapshot', 'FinanceAuxiliaryMember', 'FinanceAuxiliaryBalance',
    'FinanceOpenItem', 'FinanceGroupAccountMapping', 'FinanceSourceLedgerMapping', 'FinanceLedgerImport',
    'FinanceSourceAccountBalance', 'FinanceReclassItemRule', 'FinanceBalanceReclassAdjustment',
    'FinanceBalanceReclassAdjustmentHistory', 'FinanceStatementVoucherExclusion', 'FinanceStatementSourcePackage',
    'FinanceStatementWorkpaper', 'FinanceCurrency', 'FinanceBankAccount', 'InventoryItem', 'InventoryWarehouse',
    'InventoryDocument', 'InventoryLedgerEntry', 'InventoryStocktake', 'InventoryPeriodClose', 'InventoryImportBatch',
    'StockRawMaterial', 'StockPackaging', 'StockFinishedGoods'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "companyCode", "companyId" ON %I FOR EACH ROW EXECUTE FUNCTION "sync_company_id_from_code"()',
      table_name || '_company_reference_sync', table_name
    );
  END LOOP;
END $$;

CREATE TRIGGER "Employment_company_reference_sync"
BEFORE INSERT OR UPDATE OF "currentCompany", "companyId" ON "Employment"
FOR EACH ROW EXECUTE FUNCTION "sync_employment_company_reference"();

CREATE TRIGGER "FinanceGroupAccount_origin_company_reference_sync"
BEFORE INSERT OR UPDATE OF "originCompanyCode", "originCompanyId" ON "FinanceGroupAccount"
FOR EACH ROW EXECUTE FUNCTION "sync_origin_company_id_from_code"();

CREATE TRIGGER "FinanceVoucherCompanyMappingRule_source_company_reference_sync"
BEFORE INSERT OR UPDATE OF "sourceCompanyCode", "sourceCompanyId" ON "FinanceVoucherCompanyMappingRule"
FOR EACH ROW EXECUTE FUNCTION "sync_source_company_id_from_code"();
