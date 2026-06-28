# Docs Ownership

This is the authority for who maintains each class of documentation and when code changes must update docs. Hygiene checks freshness and stale status, but the content owner remains the corresponding role.

## Ownership Table

| Area | Location | Owner | Notes |
|---|---|---|---|
| Agent entry and doc routing | `AGENTS.md`, `docs/README.md`, `docs/OWNERS.md` | Coordinator | Keep short; link outward instead of copying rules. |
| Role responsibilities | `docs/roles/*` | Coordinator + role owner | Coordinator owns routing shape; each role owns its own checklist and risks. |
| Project overview | `docs/engineering/project-overview.md` | Coordinator / Architecture | Coordinator owns freshness and agent map; Architecture owns architecture facts. Data, Operations, and Feature own their sections when facts change. |
| Architecture and module boundaries | `docs/engineering/architecture-governance.md`, `docs/engineering/module-boundaries.md`, `docs/engineering/structure-agent-execution.md` | Architecture | Includes route shell, API shell, registry, Platform/Core/App layering, gate semantics. |
| Core UI and reusable primitives | `docs/engineering/core-ui-governance.md`, `docs/engineering/core-toolbar.md`, `docs/engineering/reusable-components.md` | Architecture / UI-system | Feature agents may propose updates, but contract changes require Architecture/UI-system ownership. |
| Checks, CI, runtime, deploy | `docs/engineering/checks.md`, `docs/engineering/ops/*` | Operations | Must match `package.json`, CI, and local runtime behavior. |
| DB, schema, seed, migration, import/export, generated docs | `docs/engineering/schema-governance.md`, `docs/engineering/database.md`, `docs/generated/README.md`, `docs/generated/*` | Data | Generated docs are not hand-edited; update generator or source data. |
| RBAC and permission matrix | `docs/engineering/security/*` | Architecture | Data/Feature contribute domain facts; Architecture owns permission model semantics. |
| Module business knowledge | `app/(modules)/*/ARCHITECTURE.md`, `app/(modules)/*/MODULE.md` | Feature / UI owner | Data owns schema/import facts inside the module; Architecture owns boundary claims. |
| User and product docs | `docs/product/*`, `app/(docs)/docs/*` | Feature / product owner | Data owns external data-source references when applicable. |
| Planning lifecycle | `docs/planning/*` | Hygiene | Hygiene owns status, naming, and archive movement; content facts still belong to the original role. |
| Special reference material | `docs/reference/*` | Declared owner in each file | Must state purpose and owner; cannot replace engineering rules or planning lifecycle. |
| Review checklist and risk patterns | `docs/roles/review.md` and future review docs | Review | Focus on bypass paths, regressions, verification gaps, and missing tests. |

## Must Update Docs

Update the relevant docs in the same task when changing any of these:

- New module, new L1/L2 entry, new resource, new capability, or permission-point semantics.
- New API contract, write flow, import/export pipeline, or public service entry.
- DB schema, migration policy, seed behavior, generated docs behavior, or data-source authority.
- Core UI contract, surface/block spec, module shell, layout host, Platform shell, route shell, or API shell rules.
- Business workflow, state machine, approval flow, finance classification, production QC rule, HR roster rule, or any rule not obvious from the UI.
- Any function or file becomes a multi-team reuse point, risk entry, boundary entry, or operational runbook.
- Any existing doc points to a moved, renamed, deleted, or behaviorally changed file/path/command.

## Usually No Docs Update Needed

Do not grow the docs for every small change. A docs update is usually unnecessary for:

- Local implementation refactors that preserve public contract, behavior, ownership, and boundary.
- Small copy/style/UI polish that does not change workflow, permission, data meaning, or state.
- Test-only changes that do not document a new risk pattern or public behavior.
- Bug fixes whose lesson is already covered by existing docs.
- Generated output refreshes, when the generator and source-of-truth rules did not change.
- One-off investigation notes that should live in a task comment, not the permanent docs tree.

## Files That Must Be Explained

Not every function deserves documentation. Document or link the authority for these entry points:

- Registry, router, gate, auth, RBAC, permission resolver, and API access wrappers.
- Service write entry, domain validator, importer/exporter, background job, and irreversible data mutation pipeline.
- Schema generation, seed, migration, generated-docs scripts, and data-source loaders.
- Core UI contract, surface/block spec, module shell, layout host, toolbar/action contract, and preview registry.
- Module state machine, finance classification, production QC, HR roster, approval flow, and other business-rule roots.
- Any file whose side effects, authorization ceiling, data mutation, generated output, or runtime dependency cannot be understood from its type/name alone.

## Stale Handling

- Hygiene runs stale checks and may move stale planning/reference files to `docs/planning/archive/stale/`.
- Hygiene does not rewrite business, schema, CI, or architecture facts unless it is also acting as the corresponding owner.
- When stale docs are found, assign the fix to the content owner above.
- If a source-of-truth file is dirty or changed after a doc's `lastVerifiedCommit`, treat the doc as suspect and inspect the owner source directly.
- Reference material unused or unlinked for more than 90 days should be reviewed by Hygiene for archive/delete, but the declared owner decides whether it is still useful.
