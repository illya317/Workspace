# SQLite migration history (read only)

This directory preserves the provider-specific migration history that produced the final SQLite source used for the PostgreSQL cutover.

- It is not an active Prisma migration directory.
- Never point `prisma migrate deploy` at it for PostgreSQL.
- Reconciliation runs only against a verified copy of a frozen SQLite snapshot.
- The active PostgreSQL history lives in `prisma/migrations`.

Two May 2026 bootstrap rows predate Prisma checksum recording and have blank ledger checksums. The SQLite-to-PostgreSQL migrator pins the archived SQL hashes for those two names explicitly; every later successful migration is verified against the checksum stored in `_prisma_migrations`.
