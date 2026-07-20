-- workspace:migration-mode=maintenance
-- The external-browser handoff used an unsupported custom scheme and was never
-- a valid production entry. Any rows are short-lived and expired before this
-- cleanup migration runs.
DROP TABLE IF EXISTS "WecomLoginHandoff";
