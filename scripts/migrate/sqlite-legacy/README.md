# SQLite legacy tools

These scripts are preserved only for audit and recovery against frozen SQLite backups. They are not supported against the active PostgreSQL runtime and must not be invoked by current package commands, CI, deploy, or production operations.

Current operational scripts belong outside this directory and must use `DIRECT_URL` / `DATABASE_URL` with PostgreSQL.

The retained tools have a narrow recovery purpose:

- `normalize-permission-action-grants.js` and `normalize-runtime-content.js` repair frozen copies before the one-time PostgreSQL ETL.
- `approve-library-catalog-tags.ts` and `migrate-library-previews-to-compressed.ts` preserve explicit recovery procedures for legacy Library data.

Ad-hoc debug, direct-write import, reconciliation, maintenance, and precompute commands were removed. Git history is the audit record for those retired implementations; they are not an operational interface.
