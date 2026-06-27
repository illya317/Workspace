# Agent Project Overview

```yaml
docKind: agent-project-overview
docVersion: 2026-06-27.1
lastVerifiedCommit: 56e2371d
lastVerifiedDate: 2026-06-27
packageVersion: 0.1.1
ownerRole: Coordinator
sourceOfTruth:
  - AGENTS.md
  - package.json
  - packages/platform/module-registry.ts
  - docs/architecture-governance.md
  - docs/checks.md
  - docs/security/rbac.md
  - docs/schema-governance.md
  - docs/core-ui-governance.md
  - app/(modules)/*/ARCHITECTURE.md
staleWhen:
  - any sourceOfTruth file changed after lastVerifiedCommit
  - package scripts or module registry changed
  - role docs changed in a way that affects routing
  - major module boundary, RBAC, CI, schema, or Core UI rules changed
```

This document is the project map for agents. Read it after `AGENTS.md` and before deep code search. It summarizes where facts live, which role owns each kind of work, and which files are the authority when this overview is stale.

Git is still the history source, but agents should not guess freshness from `git log` alone. First read the metadata above. If unsure, check:

```bash
git diff --name-only 56e2371d..HEAD -- AGENTS.md package.json packages/platform/module-registry.ts docs/architecture-governance.md docs/checks.md docs/security/rbac.md docs/schema-governance.md docs/core-ui-governance.md 'app/(modules)/*/ARCHITECTURE.md'
git status --short -- AGENTS.md package.json packages/platform/module-registry.ts docs/architecture-governance.md docs/checks.md docs/security/rbac.md docs/schema-governance.md docs/core-ui-governance.md 'app/(modules)/*/ARCHITECTURE.md'
```

If a source-of-truth file is dirty, treat the related section here as possibly stale and inspect that file directly.

## 1. What This Project Is

Workspace is an internal management system. It is not a single HR app; it is a modular platform for HR, finance, work/project management, production QC, administration contracts, library/documents, external relationships, user-facing docs, settings, and headless agent APIs.

The current product modules are registered in `packages/platform/module-registry.ts`. That registry is the source of truth for module keys, labels, routes, resource keys, API prefixes, headless modules, and module disable behavior.

## 2. Stack And Runtime

| Concern | Current standard |
|---|---|
| App framework | Next.js 16 + React + TypeScript |
| Styling | Tailwind CSS with Core/Platform UI contracts |
| Database | Prisma ORM + SQLite |
| Auth | JWT Cookie sessions for web; Open API Bearer clients for `/api/open/v1/**` |
| Runtime config | `.env` and workspace runtime paths such as `WORKSPACE_CONFIG_DIR` |
| Checks | npm scripts in `package.json`, with heavy checks serialized through `scripts/check/with-check-lock.js` |

Do not rely on framework memory for Next.js details. `AGENTS.md` requires reading the relevant Next.js guide from `node_modules/next/dist/docs/` before writing code that depends on changed framework behavior.

## 3. Architecture Map

```txt
app/*
  Next route shells only: auth, permission, prefetch, mount package UI, API wrappers

packages/platform
  login, auth, RBAC, module registry, navigation, audit, Portal, Settings, server runtime contracts

packages/core
  generic UI, fields, surfaces, tables, filters, search, dates, confirmation, routing/search helpers

packages/<domain>
  HR, Finance, Work, Production, Administration, Library, External business UI/server/types/import

prisma/
  Prisma models, migrations, seed data

scripts/check
  CI, arch gate, hygiene, docs, env, DB, migration and runtime checks
```

Dependency direction is one-way:

```txt
app route shell -> packages/platform
                -> packages/<domain>
                -> packages/core
```

`packages/core` must not depend on Platform, Apps, Prisma, permissions, or business facts. Business packages must not directly import each other. Cross-module shared behavior belongs in Platform contracts or Core primitives, depending on whether it is system/runtime behavior or pure generic UI/helper behavior.

## 4. Agent Startup Route

| If you are doing... | Read first |
|---|---|
| Any task | `AGENTS.md`, then this document |
| Planning, splitting, assigning, integrating | `docs/roles/coordinator.md` |
| Business UI, business feature, route/API shell, service | `docs/roles/feature.md` |
| Schema, migration, seed, import, generated data | `docs/roles/data.md` |
| Registry, gate, RBAC/API contract, Core/Platform/App boundary | `docs/roles/architecture.md` |
| CI, deploy, env, script runtime | `docs/roles/operations.md` |
| Historical debt, baseline, duplication, rule-hole patrol | `docs/roles/hygiene.md` |
| Final independent review | `docs/roles/review.md` |

After role selection, read the module `ARCHITECTURE.md`. For Work, read `app/(modules)/work/MODULE.md` for long-term business boundaries and `app/(modules)/work/PLAN.md` only for short-term plan context.

## 5. Current Modules

The table below is a routing map, not a replacement for `packages/platform/module-registry.ts`.

| L1 | Package / layer | L2 entries | API contract |
|---|---|---|---|
| Work `work` | `@workspace/work` domain | `work.tasks`, `work.projects`, `work.meetings` | API prefixes exist for tasks, projects, meetings |
| HR `hr` | `@workspace/hr` domain | `hr.roster`, `hr.performance`, `hr.analytics` | roster has module API; performance/analytics currently reuse roster data or page-only behavior |
| Administration `administration` | `@workspace/administration` domain | `administration.contracts` | contracts module API |
| Finance `finance` | `@workspace/finance` domain | ledger, statement config/review/statements, analysis, budget, cost, import, tax, treasury | most have module API; tax/treasury are planned page entries |
| Production `production` | `@workspace/production` domain | `production.qcBatches`, `production.qcTemplates` | QC batches/templates module APIs |
| External `external` | `@workspace/external` domain | investors, customers, suppliers | currently page entries without independent API |
| Docs `docs` | Platform docs module | positions, company, expense | static/product docs pages, no independent business API |
| Library `library` | `@workspace/library` domain | `library.basicInfo` | basic-info module API |
| Settings `settings` | Platform | account, admin, api, ui | settings account/admin/api APIs; UI component page is page-only |
| Agent `agent` | Platform headless | no page | `/api/agent` protected API only |

Important capability resources include `work.projects.viewAll`, `work.meetings.viewAll`, `hr.roster.generated`, `settings.account.apiAccess`, `settings.api.manage`, and library confidentiality capabilities. Check the registry and `docs/security/rbac.md` before changing capability semantics.

## 6. Development Rules That Usually Matter

API routes only do authentication, authorization, Zod/request-shape validation, call package service, and return DTO. Complex queries, Prisma writes, business rules, imports, and derived fields belong in `packages/<domain>/server`.

Writes must keep the three-step chain:

```txt
Zod schema -> domain validator -> service/Prisma
```

Route access and API access must match the L2 four-piece contract:

```txt
real app route / URL href / resourceKey + RBAC / API contract + guard
```

Pages under `app/(modules)` and `app/(system)` are route shells. Do not add real UI implementations, hooks, table logic, Prisma writes, business calculations, or local auth/RBAC decisions there.

Business UI defaults to Feature work and must compose Core/Platform primitives. Only Architecture/UI-system work should change `packages/core/ui/**`, Core UI contracts, registry, or Settings UI preview, and only with explicit authorization.

Deletion and archive behavior must be proven at service level: valid target, permission, record existence, scope, status, active references, history/audit, and transaction boundary. Do not rely on DB errors as business validation.

Company-specific facts such as company names, codes, management systems, query groups, shared code pools, and special-company logic must come from data or seed/migration inputs. Do not hardcode them in generic code.

## 7. Checks And CI

| Situation | Command |
|---|---|
| Small TS/TSX change | `npm run check:changed` |
| Architecture, permission, registry, API contract, Core/Platform boundary | `npm run check:arch` |
| Prisma model, schema, migration | `npm run check:data` |
| Public docs architecture check | `npm run docs:check` |
| PR/CI authority | `npm run check:ci` |
| Strict historical debt patrol | `npm run check:hygiene` |
| Non-blocking hygiene signal | `npm run check:hygiene:warn` |

Heavy checks are serialized by `scripts/check/with-check-lock.js`. If a check waits for the project lock, wait for it; do not start parallel heavy checks.

Small execution agents usually do not run full npm checks during multi-agent work. Coordinator/integration/commit-prep agents choose the final checks by risk.

## 8. Where To Look Instead Of Scanning The Whole Repo

| Question | Go here first |
|---|---|
| What role should handle this? | `docs/roles/*.md` |
| What modules/routes/resources exist? | `packages/platform/module-registry.ts` |
| Where does this module's business logic belong? | `app/(modules)/<module>/ARCHITECTURE.md`; for Work also `MODULE.md` |
| What are package boundaries and API rules? | `docs/architecture-governance.md` |
| What checks should run? | `docs/checks.md`, then `package.json` scripts |
| How does RBAC work? | `docs/security/rbac.md`, `docs/security/permission-matrix.md` |
| How should Core UI be used? | `docs/core-ui-governance.md`, `docs/reusable-components.md`, `docs/core-toolbar.md` |
| What is the database model? | `prisma/models/*.prisma`; generated summary in `docs/database.md` |
| How are docs organized? | `docs/README.md` |
| Is this a historical plan or active rule? | Active rules are indexed by `docs/README.md`; `docs/planning/` and `docs/plans/` are historical or pending by default |

## 9. User Docs Are Product Docs

The `/docs` route is a product module for end users. It currently includes positions, company management docs, and expense docs. Do not confuse `app/(docs)/docs/*` with agent/developer documentation under repository `docs/`.

When adding user-facing instructions, treat them as product content and route/UI work. When adding agent/developer rules, put them under repository `docs/` and update `docs/README.md`.

## 10. When To Refresh This Overview

Refresh this file when any of these changes land:

- `packages/platform/module-registry.ts` changes L1/L2, resources, API prefixes, headless modules, or capabilities.
- `package.json` changes check scripts, framework version, or runtime scripts.
- Architecture, RBAC, schema, Core UI, route shell, or CI rules change.
- A module `ARCHITECTURE.md` or `MODULE.md` changes the business boundary of a domain.
- Role docs change how agents route work.

When refreshing, update `docVersion`, `lastVerifiedCommit`, `lastVerifiedDate`, and any affected sections. Do not copy unstable facts from unrelated dirty worktree changes unless the owning agent or commit confirms them.
