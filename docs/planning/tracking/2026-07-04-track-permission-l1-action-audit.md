# Permission L1 Action Audit Plan

Before continuing this cleanup, read this table first. It is only a progress ledger; source of truth remains the registries, API policy, module registry, DB manifest, and module docs.

Progress: `11 done`, `0 delegated`, `0 pending`.

| Order | L1 | Status | Scope / L2 | What was checked or must be checked | Evidence / next step |
|---:|---|---|---|---|---|
| 1 | `hr` | Done | `hr.roster`, `hr.performance`, `hr.analytics`, `hr.roster.generated` | Action meaning, workflow submit/reverse, export, read-only resources. | Commit `4034414` |
| 2 | `work` | Done | `work.tasks`, `work.projects`, `work.meetings` | Workflow submit/reverse/approve, project member actions, meeting actions. | Commit `3d6dc16` |
| 3 | `docs` | Done | `docs.company`, `docs.expense`, `docs.editor` | Static read-only docs, editor workflow, derived space templates. | Commit `5ce9e71` |
| 4 | `administration` | Done | `administration.contracts` | CRUD action/API/UI placement checked; no code change needed. | Audited 2026-07-04 |
| 5 | `production` | Done | `production.qc` | Removed stale batch-level `submit`; QC actions are create batch, update/save record, approve review, export list, delete row. UI placement checked: create in toolbar, delete beside batch item, save/approve on record page. | Commit `e8ce48b` |
| 6 | `finance` | Done | All finance L2s | Action/API/UI placement checked: ledger CRUD remains API/server guarded while visible UI exposes revise/import/export; statement-config mapping create/update/delete actions are row/detail scoped; statement-review create/update/approve are separated; budget/cost/import actions map to import/create/approve/delete as implemented. Added Finance business-action registry coverage for current write APIs. | Audited 2026-07-04 by delegated thread `019f2b0b-6312-7f43-a6eb-276adc68a875` |
| 7 | `external` | Done | `external.customers`, `external.suppliers` | Page-only planned resources checked: only `entry/read/grant`; no API, DB writes, toolbar commands, or stale legacy actions. | Audited 2026-07-04 by delegated thread `019f2b0a-2f9d-7bd3-a33f-e4d977d4b972` |
| 8 | `capitalSecurities` | Done | `capitalSecurities.investors`, `capitalSecurities.governance` | Investors remains page-only with `entry/read/grant`; governance API maps GET/POST/PUT to `read/create/update`, create is in the tree command, update/save is in the detail panel. Added governance create/save business-action registry coverage. | Audited 2026-07-04 by delegated thread `019f2b0a-2f9d-7bd3-a33f-e4d977d4b972` |
| 9 | `library` | Done | `library.basicInfo` | Action/API/UI placement checked: metadata edit uses `update`, archive/restore uses `archive`, generated docs and scan use `import`, downloads use `export`, confidentiality changes use `configure`. Unified library archive/import/export UI/service checks on `authorize()` and added business-action registry coverage for library write/export actions. | Audited 2026-07-04 by delegated thread `019f2b0b-61ba-7411-a94a-4676c45c2777` |
| 10 | `settings` | Done | All settings L2s | Account self-service remains current-user scoped; admin APIs map to grant/configure/audit with service-delegated narrowing; Open API Client UI now gates create/revise/grant buttons by `settings.api.manage` actions, and unsupported manage actions were removed. | Audited 2026-07-04 by delegated thread `019f2b0b-6312-7f43-a6eb-276adc68a875` |
| 11 | `agent` | Done | Headless `/api/agent` | Headless resource checked: capabilities require `read`; message submit and own proposal confirm/cancel require `submit`; proposal confirm is not `approve`, cancel is not `reverse`, and executors recheck domain permissions before writes. No page/UI action placement applies. | Audited 2026-07-04 by delegated thread `019f2b0b-61ba-7411-a94a-4676c45c2777` |

Per L1 checklist:

1. Resource action: action set is meaningful and has no legacy action.
2. API action: every registered API maps to the intended resource/action.
3. UI placement: create in creation entry; item edit/delete/archive/approve beside the item or detail.
4. Icon: every permission action has the right icon; repeated icons are intentional or fixed.
5. DB/runtime: no legacy runtime action remains.
6. Docs/tracking: update this table and commit the completed L1.
