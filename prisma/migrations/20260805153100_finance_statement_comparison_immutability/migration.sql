-- workspace:migration-mode=maintenance
-- Enforce database-level immutability/CAS for Finance statement comparison evidence.
-- No tenant data is changed. Precedent: 20260730012000_finance_close_append_only_evidence,
-- 20260731014000_notification_audit_fact_immutability.

-- Package: evidence content columns freeze at insert; only lifecycle/failureCode/failureMessage
-- stay mutable. Archive never deletes. Once a completed run references the package,
-- the only remaining lifecycle transition is -> archived.
CREATE OR REPLACE FUNCTION "workspace_guard_finance_comparison_package"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% is immutable comparison evidence; archive instead of delete', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF NEW."fileName" IS DISTINCT FROM OLD."fileName"
    OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
    OR NEW."fileSize" IS DISTINCT FROM OLD."fileSize"
    OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."parserVersion" IS DISTINCT FROM OLD."parserVersion"
    OR NEW."workbookSnapshot" IS DISTINCT FROM OLD."workbookSnapshot"
    OR NEW."scanSummary" IS DISTINCT FROM OLD."scanSummary"
    OR NEW."uploadedBy" IS DISTINCT FROM OLD."uploadedBy"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION '% evidence content is frozen at insert', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF NEW."lifecycle" IS DISTINCT FROM OLD."lifecycle"
    AND NEW."lifecycle" <> 'archived'
    AND EXISTS (
      SELECT 1
      FROM "FinanceStatementComparisonRun" r
      JOIN "FinanceStatementComparisonMapping" m ON m."id" = r."mappingId"
      WHERE m."packageId" = OLD."id" AND r."status" = 'completed'
    )
  THEN
    RAISE EXCEPTION '% is referenced by a completed comparison run; only archive is allowed', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStatementComparisonPackage_guard"
BEFORE UPDATE OR DELETE ON "FinanceStatementComparisonPackage"
FOR EACH ROW EXECUTE FUNCTION "workspace_guard_finance_comparison_package"();

CREATE TRIGGER "FinanceStatementComparisonPackage_no_truncate"
BEFORE TRUNCATE ON "FinanceStatementComparisonPackage"
FOR EACH STATEMENT EXECUTE FUNCTION "workspace_guard_finance_comparison_package"();

-- Mapping: optimistic-revision CAS. Every UPDATE must advance revision by exactly 1 and
-- must not move the mapping to another package; service pairs this with
-- UPDATE ... WHERE id = ? AND revision = ? conditional writes.
CREATE OR REPLACE FUNCTION "workspace_guard_finance_comparison_mapping"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW."revision" IS DISTINCT FROM OLD."revision" + 1 THEN
    RAISE EXCEPTION '% revision must increment by exactly 1 (optimistic CAS)', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION '% package binding and creation timestamp are frozen', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStatementComparisonMapping_cas_guard"
BEFORE UPDATE ON "FinanceStatementComparisonMapping"
FOR EACH ROW EXECUTE FUNCTION "workspace_guard_finance_comparison_mapping"();

-- Run: frozen identity/configuration columns; while running only status/output/summary/
-- failure/completion metadata may change. Once completed or failed the row is fully
-- immutable; a rerun must create a new record. Runs are never deleted.
CREATE OR REPLACE FUNCTION "workspace_guard_finance_comparison_run"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% is an immutable audit snapshot; create a new run instead', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF OLD."status" IN ('completed', 'failed') THEN
    RAISE EXCEPTION '% is immutable once completed or failed; create a new run instead', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  IF NEW."mappingId" IS DISTINCT FROM OLD."mappingId"
    OR NEW."targetFingerprint" IS DISTINCT FROM OLD."targetFingerprint"
    OR NEW."orchestratorId" IS DISTINCT FROM OLD."orchestratorId"
    OR NEW."orchestratorVersion" IS DISTINCT FROM OLD."orchestratorVersion"
    OR NEW."formulaAdapterId" IS DISTINCT FROM OLD."formulaAdapterId"
    OR NEW."formulaAdapterVersion" IS DISTINCT FROM OLD."formulaAdapterVersion"
    OR NEW."solverAdapterId" IS DISTINCT FROM OLD."solverAdapterId"
    OR NEW."solverAdapterVersion" IS DISTINCT FROM OLD."solverAdapterVersion"
    OR NEW."configFingerprint" IS DISTINCT FROM OLD."configFingerprint"
    OR NEW."inputFingerprint" IS DISTINCT FROM OLD."inputFingerprint"
    OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION '% run identity and configuration are frozen at insert', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceStatementComparisonRun_guard"
BEFORE UPDATE OR DELETE ON "FinanceStatementComparisonRun"
FOR EACH ROW EXECUTE FUNCTION "workspace_guard_finance_comparison_run"();

CREATE TRIGGER "FinanceStatementComparisonRun_no_truncate"
BEFORE TRUNCATE ON "FinanceStatementComparisonRun"
FOR EACH STATEMENT EXECUTE FUNCTION "workspace_guard_finance_comparison_run"();

-- Line: append-only audit snapshot rows.
CREATE OR REPLACE FUNCTION "workspace_guard_finance_comparison_line"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is forbidden', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "FinanceStatementComparisonLine_append_only"
BEFORE UPDATE OR DELETE ON "FinanceStatementComparisonLine"
FOR EACH ROW EXECUTE FUNCTION "workspace_guard_finance_comparison_line"();

CREATE TRIGGER "FinanceStatementComparisonLine_no_truncate"
BEFORE TRUNCATE ON "FinanceStatementComparisonLine"
FOR EACH STATEMENT EXECUTE FUNCTION "workspace_guard_finance_comparison_line"();
