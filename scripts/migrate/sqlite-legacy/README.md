# SQLite legacy tools

These scripts are preserved only for audit and recovery against frozen SQLite backups. They are not supported against the active PostgreSQL runtime and must not be invoked by current package commands, CI, deploy, or production operations.

Current operational scripts belong outside this directory and must use `DIRECT_URL` / `DATABASE_URL` with PostgreSQL.

The `historical-tools` subtree also contains retired pre-artifact Library precompute and legacy account import commands. They remain only to explain or inspect frozen SQLite-era backups and are excluded from active TypeScript/runtime checks.
