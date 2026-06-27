# Reference Docs

This is the special bucket for durable reference material that does not fit agent workflow, engineering rules, module knowledge, product/user docs, or planning.

## Admission Rules

- Every file or folder must declare an owner, purpose, and intended users near the top or in a local README.
- Reference material cannot replace `docs/engineering/*` as the authority for engineering rules.
- Temporary plans, proposals, task notes, and investigation logs belong in `docs/planning/*`, not here.
- User-facing instructions belong in `docs/product/*` or `app/(docs)/docs/*`.
- Module business boundaries belong in `app/(modules)/*/ARCHITECTURE.md` or `MODULE.md`.
- If a reference has no inbound link or active owner for more than 90 days, Hygiene should ask the owner whether to archive it under `docs/planning/archive/stale/` or delete it.

## Current Status

No general reference material is currently maintained here. Domain-specific references remain closer to their owners, for example `docs/product/reference/*` for user/product data sources and `docs/engineering/reference/*` for engineering-owned references.
