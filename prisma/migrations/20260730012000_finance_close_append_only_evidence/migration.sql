-- workspace:migration-mode=maintenance
-- Enforce database-level immutability for close evidence and event ledgers. No tenant data is changed.

CREATE OR REPLACE FUNCTION "workspace_reject_finance_close_append_only_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; append a new event or snapshot instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FinanceCloseEvidenceSnapshot_append_only"
BEFORE UPDATE OR DELETE ON "FinanceCloseEvidenceSnapshot"
FOR EACH ROW EXECUTE FUNCTION "workspace_reject_finance_close_append_only_mutation"();

CREATE TRIGGER "FinanceCloseEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceCloseEvent"
FOR EACH ROW EXECUTE FUNCTION "workspace_reject_finance_close_append_only_mutation"();

CREATE TRIGGER "FinanceCloseWorkpaperEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceCloseWorkpaperEvent"
FOR EACH ROW EXECUTE FUNCTION "workspace_reject_finance_close_append_only_mutation"();
