# Permission Resource Action Policy Draft

Status: short-term draft
Owner: Architecture / Permission follow-up
Created: 2026-07-01
Promotion: runtime catalog started in `packages/platform/permission-resource-policy.ts`; business guards are still not switched.

This draft is the second-step resource classification for the new permission action model. It is intentionally not a runtime catalog yet. Do not treat this file as an active source of truth until the first-step permission action infrastructure is merged and this draft is promoted into a formal policy/catalog.

## Scope

The stable first-step action keys are assumed to be:

- `access`, `create`, `write`, `delete`
- `archive`, `revise`
- `submit`, `withdraw`
- `approve`, `reject`
- `import`, `export`
- `admin`

The stable group keys are assumed to be:

- `basic`
- `workflowSubmit`
- `workflowApprove`
- `lifecycle`
- `exchange`
- `admin`

This draft does not change business guards. Existing route/API authorization still runs through the current `access/write/delete/admin` model until a later integration step explicitly wires resource action policy into authorization.

## Structured Candidate

The machine-readable candidate lives next to this document:

```txt
docs/planning/short-term/2026-07-01-short-permission-resource-action-policy.candidate.json
```

It is retained as planning/source data. The runtime catalog started from this candidate and now lives at:

```txt
packages/platform/permission-resource-policy.ts
```

The candidate can be checked against the current module registry with:

```bash
node docs/planning/short-term/validate-permission-resource-action-policy.mjs
```

## Policy Shape

The eventual runtime policy should probably live outside `packages/platform/module-registry.ts`, then be referenced by registry/resource docs. The registry already owns route/resource/API contract facts; putting detailed permission strategy there would make it harder to review.

Suggested policy fields:

```ts
interface ResourceActionPolicyDraft {
  resourceKey: string;
  status: "container" | "business" | "capability" | "headless" | "docs" | "planned";
  supportedActions: PermissionActionKey[];
  ancestorInheritedActions: PermissionActionKey[];
  explicitOnlyActions: PermissionActionKey[];
  notes?: string;
}
```

Default inheritance rule for this draft:

- L1 container grants may inherit only basic actions into L2 resources: `access`, `create`, `write`, `delete`.
- Workflow, lifecycle, exchange, capability, confidentiality, and view-all actions stay explicit at the L2 or capability resource unless a module later proves safe inheritance.
- `admin` keeps its authorization-management meaning. Whether it gives all business actions follows the action catalog, but granting `admin` on L1 should not silently bypass explicit-only high-risk L2 policies without a reviewed rule.

## Resource Classification

| Resource | Status | Supported actions | Ancestor inherited | Explicit-only actions | Notes |
|---|---|---|---|---|---|
| `work` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 module container. Basic inheritance to Work L2 is acceptable; object-level rules still dominate projects/tasks. |
| `work.tasks` | business | `access`, `create`, `write`, `delete`, `archive`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `export`, `admin` | Work task data has personal/department/project spaces. Space membership and assignee rules remain service-level constraints. |
| `work.projects` | business | `access`, `create`, `write`, `delete`, `archive`, `revise`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `revise`, `export`, `admin` | Project visibility/edit/manage/delete remains object-level. Organization-level project creation stays a separate capability. |
| `work.meetings` | business | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `archive`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `archive`, `export`, `admin` | Meeting decisions/minutes can become workflow actions. Meeting type/scope may need finer policy later. |
| `work.projects.createOrg` | capability | `access`, `create`, `admin` | none | all supported actions | Capability is independent from `work.projects` grant inheritance; runtime parent only controls module enablement. |
| `work.projects.viewAll` | capability | `access`, `export`, `admin` | none | all supported actions | `export` is only for future bulk/global exports; current view-all semantics are read visibility. |
| `work.meetings.viewAll` | capability | `access`, `export`, `admin` | none | all supported actions | Same shape as project view-all, scoped to meetings. |
| `hr` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 HR container. Basic inheritance to HR L2 is acceptable. |
| `hr.roster` | business | `access`, `create`, `write`, `delete`, `archive`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `import`, `export`, `admin` | HR roster has CRUD plus import/export-like operations. Business validators remain authoritative for employee/department/position facts. |
| `hr.performance` | business | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `export`, `admin` | Page currently reuses roster data, but performance naturally has submit/approve semantics once implemented. |
| `hr.analytics` | business | `access`, `export`, `admin` | `access` | `export`, `admin` | Analysis is read/report oriented; write/delete should stay unsupported until real mutable facts exist. |
| `hr.roster.generated` | capability | `access`, `write`, `export`, `admin` | none | all supported actions | Generated roster data can be refreshed (`write`) and exported/read. Keep separate from ordinary roster CRUD. |
| `administration` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 administration container. |
| `administration.contracts` | business | `access`, `create`, `write`, `delete`, `archive`, `revise`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `revise`, `export`, `admin` | Contract status/lifecycle should map to lifecycle actions, not plain delete. |
| `finance` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 finance container. Basic inheritance to finance L2 matches current docs. |
| `finance.ledger` | business | `access`, `create`, `write`, `delete`, `archive`, `revise`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `revise`, `import`, `export`, `admin` | Ledger includes accounts, vouchers, periods, reclass rules/results, and initialization. Closing/revising periods should not be hidden inside write. |
| `finance.statementConfig` | business | `access`, `create`, `write`, `delete`, `revise`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `revise`, `import`, `export`, `admin` | Statement mapping/config is mutable setup data. |
| `finance.statementReview` | business | `access`, `create`, `write`, `submit`, `withdraw`, `approve`, `reject`, `revise`, `export`, `admin` | `access`, `create`, `write` | `submit`, `withdraw`, `approve`, `reject`, `revise`, `export`, `admin` | Review/checkoff workpapers are a strong workflow candidate. Do not let L1 create approval power implicitly. |
| `finance.statements` | business | `access`, `export`, `admin` | `access` | `export`, `admin` | Financial statements are report consumption. Mutation belongs to config/review resources. |
| `finance.analysis` | business | `access`, `export`, `admin` | `access` | `export`, `admin` | Management analysis is report oriented. |
| `finance.budget` | business | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `import`, `export`, `admin` | Budget versions naturally need lifecycle and workflow separation. |
| `finance.cost` | business | `access`, `create`, `write`, `delete`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `import`, `export`, `admin` | Cost subdomains may later split into finer resources; keep exchange explicit. |
| `finance.tax` | planned | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `import`, `export`, `admin` | Planned page. Tax filing/payment workflow is likely, but do not enable workflow in runtime until module exists. |
| `finance.treasury` | planned | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `import`, `export`, `admin` | Planned page. Payments and bank operations should be workflow-heavy later. |
| `finance.import` | business | `access`, `import`, `export`, `admin` | `access` | `import`, `export`, `admin` | This resource is primarily exchange/governance, not ordinary CRUD. |
| `production` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 production container. |
| `production.qc` | business | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `export`, `admin` | `access`, `create`, `write`, `delete` | `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `export`, `admin` | QC is the clearest submit/approve SoD candidate. Template publishing remains under Docs Editor. |
| `external` | container | `access`, `create`, `write`, `delete`, `admin` | n/a | `admin` | L1 external relationship container. |
| `external.investors` | business | `access`, `create`, `write`, `delete`, `archive`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `export`, `admin` | Workspace-owned page, but API/service maturity should be checked before runtime enablement. |
| `external.customers` | planned | `access`, `create`, `write`, `delete`, `archive`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `import`, `export`, `admin` | Analysis/planned status today; CRM import/export likely later. |
| `external.suppliers` | planned | `access`, `create`, `write`, `delete`, `archive`, `import`, `export`, `admin` | `access`, `create`, `write`, `delete` | `archive`, `import`, `export`, `admin` | Analysis/planned status today; supplier import/export likely later. |
| `docs` | docs | `access`, `admin` | n/a | `admin` | User docs center is access-only today. |
| `docs.company` | docs | `access`, `admin` | `access` | `admin` | Static product docs. |
| `docs.expense` | docs | `access`, `admin` | `access` | `admin` | Static product docs. |
| `docs.editor` | business | `access`, `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `import`, `export`, `admin` | `access` | `create`, `write`, `delete`, `submit`, `withdraw`, `approve`, `reject`, `archive`, `revise`, `import`, `export`, `admin` | Template spaces, copy/edit/publish and DOCX export are real actions; keep explicit because docs L1 is otherwise access-only. |
| `library` | container | `access`, `write`, `admin` | n/a | `admin` | L1 library max role is write; content access is mostly at `library.basicInfo` and confidentiality capabilities. |
| `library.basicInfo` | business | `access`, `create`, `write`, `delete`, `archive`, `import`, `export`, `admin` | `access`, `create`, `write` | `delete`, `archive`, `import`, `export`, `admin` | Basic-info currently has max write, but file/document operations may need future delete/archive review. |
| `library.basicInfo.write` | capability | `access`, `create`, `write`, `import`, `admin` | none | all supported actions | Existing edit/upload/scan capability. |
| `library.basicInfo.secret` | capability | `access`, `export`, `admin` | none | all supported actions | Confidentiality capability, not ordinary content CRUD. Export should be explicit if enabled. |
| `library.basicInfo.topSecret` | capability | `access`, `export`, `admin` | none | all supported actions | Highest confidentiality capability; keep explicit and auditable. |
| `settings` | container | `access`, `admin` | n/a | `admin` | Settings L1 is access-only as a shell. |
| `settings.account` | business | `access`, `write`, `revise`, `admin` | `access` | `write`, `revise`, `admin` | Personal account/security settings. `revise` can represent credential/API key rotation; normal admin management belongs elsewhere. |
| `settings.admin` | business | `access`, `admin` | `access` | `admin` | System administration resource. Mutation is authorization-management, not ordinary business write. |
| `settings.api` | business | `access`, `export`, `admin` | `access` | `export`, `admin` | Console read/log viewing. Client mutation is separated into `settings.api.manage`. |
| `settings.ui` | docs | `access`, `admin` | `access` | `admin` | UI component preview/browser, no business mutation. |
| `settings.account.apiAccess` | capability | `access`, `revise`, `admin` | none | all supported actions | Personal API use/rotation capability, separated from Open API console administration. |
| `settings.api.manage` | capability | `access`, `create`, `write`, `delete`, `revise`, `admin` | none | all supported actions | Sensitive Open API client/secret/scope management. Must remain independent from `settings.api` parent max-role truncation. |
| `agent` | headless | `access`, `submit`, `admin` | n/a | `submit`, `admin` | `submit` is a future fit for sending agent jobs/messages. Current registry only protects access. |

## Open Questions

- Should `admin` on an L1 container automatically enable every explicit-only child action, or should explicit-only resource policies also constrain admin-derived business capability? Current first-step action catalog says `admin` implies all actions, but the resource policy may still need an explainable high-risk override story.
- Should `export` be modeled for read/report resources even when no export endpoint exists yet? This draft marks likely export candidates, but runtime policy should keep unsupported actions disabled until an implementation exists.
- Should object-level resources such as Work projects eventually get scoped action policies rather than module-level only? Current Work semantics still require service-level object checks.
- Should `import` be used for external Open API writes, bulk uploads, or both? The action name should remain business-facing; Open API scopes stay separate from internal RBAC.
- How should planned/skeleton resources appear in the matrix? Recommendation: show only currently implemented legacy/basic actions by default, and keep future actions disabled with a "pending resource mapping" reason until the module owns them.

## Promotion Checklist

Before wiring this policy into business authorization:

- First-step permission action infrastructure is merged and stable. Done.
- Architecture chooses the runtime home. Done: `packages/platform/permission-resource-policy.ts`.
- Policy entries are tested for every registered resource key and capability.
- Permission matrix reads policy support instead of using `!legacyRoleKey` as the pending-resource-mapping proxy.
- API/route guards remain legacy-compatible until a separate integration task maps new actions to concrete business behavior.
- `docs/engineering/security/rbac.md` and `docs/engineering/security/permission-matrix.md` are updated after the catalog becomes source of truth.
