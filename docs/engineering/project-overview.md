# Agent Project Overview

```yaml
docKind: agent-project-overview
docVersion: 2026-07-25.1
lastVerifiedCommit: a2050662
lastVerifiedDate: 2026-07-25
packageVersion: 0.1.2
ownerRole: Coordinator / Architecture
sourceOfTruth:
  - AGENTS.md
  - docs/README.md
  - docs/OWNERS.md
  - docs/roles/*.md
  - docs/generated/README.md
  - docs/planning/README.md
  - docs/reference/README.md
  - package.json
  - tsconfig.base.json
  - tsconfig.json
  - packages/*/tsconfig.json
  - tsconfig.app.json
  - tsconfig.prisma-client.json
  - tsconfig.tooling.json
  - packages/platform/module-registry.ts
  - scripts/deploy/deploy-unit-spec.ts
  - scripts/deploy/deploy-unit-app-generator.ts
  - docs/engineering/architecture-governance.md
  - docs/engineering/checks.md
  - docs/engineering/ops/deploy-units.md
  - docs/engineering/security/rbac.md
  - docs/engineering/schema-governance.md
  - docs/engineering/core-ui-governance.md
  - app/**/page.tsx
  - app/(docs)/docs/ARCHITECTURE.md
  - app/(modules)/*/ARCHITECTURE.md
  - app/(modules)/*/*/ARCHITECTURE.md
  - app/(modules)/*/MODULE.md
  - app/(system)/*/ARCHITECTURE.md
  - app/(system)/*/*/ARCHITECTURE.md
staleWhen:
  - any sourceOfTruth file changed after lastVerifiedCommit or is dirty
  - package scripts or module registry changed
  - deploy-unit spec, generated Next app config, or canonical route ownership changed
  - role docs or docs ownership changed in a way that affects routing
  - major module boundary, RBAC, CI, schema, or Core UI rules changed
```

This document is the project map for agents. Read it after `AGENTS.md` and before deep code search. It summarizes where facts live, which role owns each kind of work, and which files are the authority when this overview is stale.

Git is still the history source, but agents should not guess freshness from `git log` alone. First read the metadata above. If unsure, check:

```bash
git diff --name-only a2050662..HEAD -- AGENTS.md docs/README.md docs/OWNERS.md docs/roles docs/generated/README.md docs/planning/README.md docs/reference/README.md package.json tsconfig.base.json tsconfig.json tsconfig.app.json tsconfig.prisma-client.json tsconfig.tooling.json 'packages/*/tsconfig.json' 'apps/*/next.config.ts' 'apps/*/tsconfig.json' packages/platform/module-registry.ts scripts/deploy/deploy-unit-spec.ts scripts/deploy/deploy-unit-app-generator.ts docs/engineering/architecture-governance.md docs/engineering/checks.md docs/engineering/ops/deploy-units.md docs/engineering/security/rbac.md docs/engineering/schema-governance.md docs/engineering/core-ui-governance.md 'app/**/page.tsx' 'app/(docs)/docs/ARCHITECTURE.md' 'app/(modules)/*/ARCHITECTURE.md' 'app/(modules)/*/*/ARCHITECTURE.md' 'app/(modules)/*/MODULE.md' 'app/(system)/*/ARCHITECTURE.md' 'app/(system)/*/*/ARCHITECTURE.md'
git status --short -- AGENTS.md docs/README.md docs/OWNERS.md docs/roles docs/generated/README.md docs/planning/README.md docs/reference/README.md package.json tsconfig.base.json tsconfig.json tsconfig.app.json tsconfig.prisma-client.json tsconfig.tooling.json 'packages/*/tsconfig.json' 'apps/*/next.config.ts' 'apps/*/tsconfig.json' packages/platform/module-registry.ts scripts/deploy/deploy-unit-spec.ts scripts/deploy/deploy-unit-app-generator.ts docs/engineering/architecture-governance.md docs/engineering/checks.md docs/engineering/ops/deploy-units.md docs/engineering/security/rbac.md docs/engineering/schema-governance.md docs/engineering/core-ui-governance.md 'app/**/page.tsx' 'app/(docs)/docs/ARCHITECTURE.md' 'app/(modules)/*/ARCHITECTURE.md' 'app/(modules)/*/*/ARCHITECTURE.md' 'app/(modules)/*/MODULE.md' 'app/(system)/*/ARCHITECTURE.md' 'app/(system)/*/*/ARCHITECTURE.md'
```

If a source-of-truth file is dirty, treat the related section here as possibly stale and inspect that file directly. Do not update this metadata to cover uncommitted facts unless the owning agent has explicitly confirmed that the dirty file is the intended source of truth.

## 1. What This Project Is

Workspace is an internal management system. It is not a single HR app; it is a modular platform for HR, finance, work/project management, product/QC, inventory, administration contracts, capital and external relationships, library/documents, user-facing docs, settings, and governed Agent runtimes. HR virtual-employee records describe organizational identity; only an explicit runtime binding makes that identity executable on Workspace, local Codex, CI, or servers.

The repository now has two distinct application views. The canonical `app/` tree remains the editable route/API shell source and the local monolith compatibility app. Generated `apps/*` roots are independent Next standalone application projects for the deploy-unit graph. Core and Platform are shared compilation inputs, not implicit runtimes or deploy units; Platform-owned Portal, Settings, Auth, and System pages run in the explicit `workspace-shell` unit.

The current product modules are registered in `packages/platform/module-registry.ts`. That registry is the source of truth for module keys, labels, routes, resource keys, API prefixes, headless modules, and module disable behavior.

## 2. Stack And Runtime

| Concern | Current standard |
|---|---|
| App framework | Next.js 16 + React + TypeScript |
| Styling | Tailwind CSS 4 with Core/Platform UI contracts |
| Database | Prisma ORM 7 + PostgreSQL 15+ via `@prisma/adapter-pg` |
| Auth | JWT Cookie sessions for web; Open API Bearer clients for `/api/open/v1/**` |
| Runtime config | `.env` and workspace runtime paths such as `WORKSPACE_CONFIG_DIR` |
| App topology | Editable canonical `app/`; generated standalone Next roots under `apps/*`; local development remains the single port-3000 compatibility app |
| Deploy topology | 12 declared units: 9 domain L1 units, Docs, `workspace-shell`, and headless `assistant`; route/API ownership is derived rather than copied |
| Checks | npm scripts in `package.json`, with TypeScript project references and heavy checks serialized through `scripts/check/with-check-lock.js` |

Do not rely on framework memory for Next.js details. `AGENTS.md` requires reading the relevant Next.js guide from `node_modules/next/dist/docs/` before writing code that depends on changed framework behavior.

## 3. Architecture Map

```txt
packages/core
  generic UI, fields, surfaces, tables, filters, search, dates, confirmation and pure helpers

packages/platform
  login, auth, RBAC, registry, navigation, audit, Portal/Settings contracts and shared runtime seams

packages/<domain>
  Apps/business layer: HR, Finance, Work, Inventory, Production, Administration,
  Capital Securities, Library and External UI/server/types/import

app/*
  canonical editable Next route/API shells: auth, permission, prefetch, mount package UI, return DTO

apps/*
  generated deploy-unit Next roots with an owned route/API slice, next.config.ts and tsconfig.json

prisma/
  Prisma models, migrations and seed data; lifecycle remains centrally coordinated

scripts/check + scripts/deploy
  CI/architecture/data/docs gates plus the derived deploy graph and generated app contracts

tsconfig.json
  solution-only compiler graph: Core -> Platform -> domain packages -> canonical App/tooling
```

Dependency direction is one-way:

```txt
canonical or generated app shell
  -> owning domain package or Platform-owned L1
  -> packages/platform
  -> packages/core
```

`packages/core` must not depend on Platform, Apps, Prisma, permissions, or business facts. Platform must not import a domain package. Business packages must not directly import each other. Cross-module behavior belongs in a Platform contract/RPC or a Core primitive, depending on whether it carries system/runtime semantics or is a pure generic UI/helper capability.

The same direction is compiler-enforced. Each package owns a composite `tsconfig.json`; generated Prisma types are a separate upstream project; `tsconfig.app.json` owns the canonical monolith route shells; every `apps/<unit>/tsconfig.json` owns only that generated unit shell and its compiler closure; `tsconfig.tooling.json` preserves scripts, E2E, and config-file checking. Root `tsconfig.json` owns no source files. Use `npm run typecheck:scope -- <package>` for a package plus its upstream projects, `npm run typecheck:affected` when the deploy graph should select package/App scopes, and `npm run typecheck:full` for the complete canonical solution.

`scripts/deploy/deploy-unit-spec.ts` declares the 12 app roots and non-derivable runtime facts. At committed HEAD, Finance and External have blueprint maturity `active`; the other 10 units are `candidate`. This is source maturity, not proof of current production traffic. Live Gateway activation must be read from deployment state and receipts. Files under `apps/*` carry a generated banner and are drift evidence, not a second fact source: change the canonical `app/`, registry, or deploy spec, validate all mirrors with `npm run deploy:apps:check`, and use `npm run deploy:unit:app -- --unit <id> --write` only when an explicit refresh is required.

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

After role selection, read the module `ARCHITECTURE.md`. For Work, read `app/(modules)/work/MODULE.md` for long-term business boundaries; short-term context belongs in the Git-ignored `.planning/` workspace. When a task changes documentation, ownership, stale status, or planning/reference placement, read `docs/OWNERS.md`.

## 5. Current Modules

The table below records exact current L1/L2 hrefs and deploy ownership. It is a routing map, not a replacement for `packages/platform/module-registry.ts`.

| L1 key / href | Package / layer | L2 resource key -> href | Deploy unit | Boundary / API fact |
|---|---|---|---|---|
| Work `work` -> `/work` | `@workspace/work` domain | `work.tasks` -> `/work/me`; `work.projects` -> `/work/project`; `work.meetings` -> `/work/meeting` | `work` | task, project, and meeting APIs remain under their plural `/api/modules/work/*` prefixes |
| HR `hr` -> `/hr` | `@workspace/hr` domain | `hr.roster` -> `/hr/roster`; `hr.performance` -> `/hr/performance`; `hr.analytics` -> `/hr/analytics` | `hr` | roster and performance have APIs; analytics is derived from roster DTOs and has no independent prefix |
| Administration `administration` -> `/administration` | `@workspace/administration` domain | `administration.contracts` -> `/administration/contracts`; `administration.erpDiligence` -> `/administration/erp-diligence` | `administration` | contracts and ERP diligence module APIs |
| Finance `finance` -> `/finance` | `@workspace/finance` domain | `finance.ledger` -> `/finance/ledger`; `finance.statements` -> `/finance/statements`; `finance.analysis` -> `/finance/analysis`; `finance.budget` -> `/finance/budget`; `finance.cost` -> `/finance/cost` | `finance` | ledger, statements, analysis, budget and cost own module APIs; governed import scripts remain internal and do not expose an L2 page |
| Production `production` -> `/production` | `@workspace/production` domain | `production.products` -> `/production/products`; `production.qc` -> `/production/qc` | `production` | Products owns product/SKU/source-mapping maintenance; QC owns execution while Docs Editor owns template authoring |
| Inventory `inventory` -> `/inventory` | `@workspace/inventory` domain | `inventory.operations` -> `/inventory/operations`; `inventory.receipts` -> `/inventory/receipts` | `inventory` | Operations owns stock facts; Receipts owns finished-goods declarations and review before formal posting |
| External `external` -> `/external` | `@workspace/external` domain | `external.customers` -> `/external/customers`; `external.suppliers` -> `/external/suppliers` | `external` | shared Party identity plus role-specific customer/supplier CRUD for organizations and individuals |
| Capital Securities `capitalSecurities` -> `/capital-securities` | `@workspace/capital-securities` domain | `capitalSecurities.investors` -> `/capital-securities/investors`; `capitalSecurities.governance` -> `/capital-securities/governance` | `capital-securities` | governance and investor APIs still use the legacy camel-case module URL pending migration |
| Docs `docs` -> `/docs` | Platform docs L1 | `docs.company` -> `/docs/company`; `docs.editor` -> `/docs/editor` | `docs` | company product docs and governed template/QC document authoring |
| Library `library` -> `/library` | `@workspace/library` domain | `library.basicInfo` -> `/library/basic-info` | `library` | basic-info document and directory APIs |
| Settings `settings` -> `/settings` | Platform | `settings.account` -> `/settings/account`; `settings.admin` -> `/settings/admin`; `settings.api` -> `/settings/api`; `settings.ui` -> `/settings/ui` | `workspace-shell` | account owns inbox plus the end-to-end notification catalog and permission-scoped personal subscriptions; admin owns permissions, workflow, audit, and module governance; API has Platform APIs; UI registry is page-only |
| Agent `agent` (headless) | Platform | none | `assistant` | `/api/agent` and toolbar use `agent.assistant`; the model receives only three generic protected-business-API connectors |

At this refresh, the Docs row intentionally follows the owner-confirmed dirty working-tree removal of `docs.expense`; committed HEAD `a2050662` still contains that L2. The metadata therefore remains anchored to HEAD while the status command above correctly reports this overview and the affected source files as dirty until the removal is committed together.

Work keeps entry ownership separate from record ownership. `/work/me` is the personal home and links to `/work/me/space`; department and project homes use `/work/department/:id` and `/work/project/:id`, with their execution workbenches under `/space`. Those homes may contribute links into Finance-owned operational analysis, but Work never imports Finance. `/work/performance` is the employee performance entry gated by `work.tasks`; `/hr/performance` is the HR summary/processing entry. Both use HR-owned performance APIs, formal records, approval adapter, and archive semantics.

Product and receipt ownership is also split deliberately. Production `products` is the only manual Product/SKU/source-mapping master entry; Inventory consumes stable identities and does not create a parallel product master. `inventory.receipts` records monthly finished-goods declarations (`draft -> submitted -> approved`) before an inventory document posts them, enforces preparer/reviewer separation, and exposes only a read-only link to Finance cost rows.

Capital ownership facts no longer originate from a directly editable relationship table. `ShareCapitalEvent` plus transaction/snapshot positions are the canonical equity ledger; `OwnershipInterest` is a replayed effective-period projection used by governance, relationship graphs, and downstream consolidation. Corrections must change or append upstream events and rebuild projections rather than patching `OwnershipInterest` directly.

Agent is headless and has no `/agent` L1 management page. The toolbar assistant uses the `agent.assistant` capability, owned by `settings.account` and runtime-coupled to the headless `agent` module. Its model-facing surface is fixed to `workspace.api.discover`, `workspace.api.read`, and `workspace.api.proposeMutation`; all business behavior stays behind registered `/api/modules/**` contracts. Source code, files, Prisma/database access, internal RPC, arbitrary network, credentials, direct commits, and deployment are outside Workspace conversations. Global Agent action limits remain an additional deny-only ceiling.

Important capability resources include `work.tasks.cycleFlow`, `hr.roster.generated`, `settings.account.apiAccess`, `settings.api.manage`, and `agent.assistant`. `work.tasks.cycleFlow.configure` controls the Work cycle/flow settings entry, API access, and persistence; it is assigned through the permission matrix rather than inferred from an IT or business role. Check the registry and `docs/engineering/security/rbac.md` before changing capability semantics.

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

The root `app/` tree is the editable authority for those shells. Matching files under `apps/<unit>/app` are generated deploy slices, not a second implementation surface. Never fix a route in `apps/*` alone; update the canonical shell and regenerate the owning unit so monolith and independent artifacts remain identical.

Business UI defaults to Feature work and must compose Core/Platform primitives. Only Architecture/UI-system work should change `packages/core/ui/**`, Core UI contracts, registry, or the Settings UI declaration page, and only with explicit authorization.

Deletion and archive behavior must be proven at service level: valid target, permission, record existence, scope, status, active references, history/audit, and transaction boundary. Do not rely on DB errors as business validation.

Company-specific facts such as identity, company names/codes, management systems, organization roles, HR option membership, Finance import mappings, Work numbering, Docs/QC products, and Agent workforce must come from `WORKSPACE_CONFIG_DIR/config/tenant/profile.json` plus its referenced files, or from mutable database facts seeded by those inputs. Server code reads the validated Platform tenant seam; client code consumes the root-provided public snapshot. Repository and deployment targets belong only to dedicated private environment variables, not the tenant profile or a root manifest. Do not hardcode tenant facts or read tenant files directly in business packages.

## 7. Checks And CI

| Situation | Command |
|---|---|
| Changed-file lint/contracts/domain/migration and browser-process safety | `npm run check:changed` |
| Local environment plus changed-file suite | `npm run check:quick` |
| One package and its TypeScript upstreams | `npm run typecheck:scope -- <package>` |
| Direct TypeScript projects touched locally | `npm run typecheck:quick` |
| CI/release TypeScript authority | `npm run typecheck:full` |
| Line budget only | `npm run complexity:line-budget` |
| Refactor split quality plus changed lint/contracts | `npm run check:refactor` |
| Architecture blockers | `npm run check:arch` (alias of `check:blockers`) |
| Target only business/system or structural UI blockers | `npm run gate:domain` / `npm run gate:ui` |
| Prisma model, schema, migration and governed data release | `npm run check:data` |
| Public/generated docs contracts | `npm run docs:check` |
| Deploy graph ownership, compiler closure, route/asset and capacity contract | `npm run deploy:graph:check` |
| Inspect one derived unit contract | `npm run deploy:unit:contract -- --unit <id>` |
| Validate all generated Next app mirrors | `npm run deploy:apps:check` |
| Inspect one generated app or explicitly refresh it | `npm run deploy:unit:app -- --unit <id>`; add `--write` only to regenerate |
| Full local CI authority | `npm run check:ci` |
| Prepare one exact-tree production candidate locally | `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh prepare` |
| Deploy only a prepared candidate through CNB | `OPS_ENV_FILE=/path/to/private/.env ops/publish.sh deploy` |
| Strict historical debt patrol | `npm run check:hygiene` |
| Non-blocking hygiene signal | `npm run check:hygiene:warn` |

Heavy checks are serialized by `scripts/check/with-check-lock.js`. If a check waits for the project lock, wait for it; do not start parallel heavy checks. `check:changed`, `check:quick`, `check:refactor`, `check:precommit`, and `check:push` do not implicitly run TypeScript. Ordinary local edits do not need a separate typecheck; use `typecheck:scope` for one project and the direct-scope `typecheck:quick` only when type diagnosis is actually needed. Full TypeScript remains CI/release-only.

Small execution agents usually do not run full npm checks during multi-agent work. Coordinator/integration/commit-prep agents choose the final checks by risk.

## 8. Where To Look Instead Of Scanning The Whole Repo

| Question | Go here first |
|---|---|
| What role should handle this? | `docs/roles/*.md` |
| Is this overview fresh? | Metadata at the top of this file, then the `git diff` / `git status` commands above |
| What modules/routes/resources exist? | `packages/platform/module-registry.ts` |
| Which independent runtime owns a route or API? | `scripts/deploy/deploy-unit-spec.ts`, then `docs/engineering/ops/deploy-units.md` |
| Where should a Next route shell be edited? | Canonical root `app/`; `apps/*` is generated and validated with `deploy:apps:check` |
| Where does this module's business logic belong? | `app/(modules)/<module>/ARCHITECTURE.md`; for Work also `MODULE.md` |
| What are package boundaries and API rules? | `docs/engineering/architecture-governance.md` |
| Who owns this doc, and must I update docs? | `docs/OWNERS.md` |
| What checks should run? | `docs/engineering/checks.md`, then `package.json` scripts |
| How does RBAC work? | `docs/engineering/security/rbac.md`, `docs/engineering/security/permission-matrix.md` |
| How should Core UI be used? | `docs/engineering/core-ui-governance.md`, `docs/engineering/reusable-components.md`, `docs/engineering/core-toolbar.md` |
| What is the database model? | `prisma/models/*.prisma`; generated summary in `docs/engineering/database.md` |
| What generated docs exist? | `docs/generated/README.md`; do not hand-edit generated output |
| How are docs organized? | `docs/README.md` |
| Is this a historical plan or active rule? | Active rules are indexed by `docs/README.md`; planning lifecycle is in `docs/planning/README.md` |
| Where does special long-lived reference material go? | `docs/reference/README.md`; product references stay in `docs/product/reference/*` |

## 9. User Docs Are Product Docs

The `/docs` route is a product module for end users. It currently includes company management docs and the template editor. Do not confuse `app/(docs)/docs/*` with agent/developer documentation under repository `docs/`.

When adding user-facing instructions, treat them as product content and route/UI work. When adding agent/developer rules, put them under repository `docs/` and update `docs/README.md`.

## 10. When To Refresh This Overview

Refresh this file when any of these changes land:

- `packages/platform/module-registry.ts` changes L1/L2, resources, API prefixes, headless modules, or capabilities.
- `docs/OWNERS.md` changes ownership, must-document triggers, stale rules, or reference/planning placement.
- `package.json` changes check scripts, framework version, or runtime scripts.
- The deploy-unit spec, generated app contract, route ownership, or App `tsconfig` closure changes.
- Architecture, RBAC, schema, Core UI, route shell, or CI rules change.
- A module `ARCHITECTURE.md` or `MODULE.md` changes the business boundary of a domain.
- Role docs change how agents route work.

When refreshing, update `docVersion`, `lastVerifiedCommit`, `lastVerifiedDate`, and any affected sections. Do not copy unstable facts from unrelated dirty worktree changes unless the owning agent or commit confirms them.
