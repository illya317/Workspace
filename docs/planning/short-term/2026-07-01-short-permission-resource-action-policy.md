# Permission Resource Action Policy Draft

Status: runtime catalog snapshot
Owner: Architecture / Permission follow-up
Created: 2026-07-01
Updated: 2026-07-02
Promotion: promoted to `packages/platform/permission-resource-policy.ts`; this file is retained as planning context and snapshot notes.

The active source of truth is `packages/platform/permission-resource-policy.ts`. The adjacent candidate JSON is a snapshot of registered non-space resources; runtime also derives `space.*` projection resources from `spaceRegistrations`.

## Scope

The stable first-step action keys are assumed to be:

- `access`, `create`, `write`, `delete`
- `archive`, `revise`
- `submit`, `withdraw`
- `approve`, `reject`
- `import`, `export`
- `grant`
- `admin`

The stable group keys are assumed to be:

- `basic`
- `workflowSubmit`
- `workflowApprove`
- `lifecycle`
- `exchange`
- `admin`

`admin` is business management and implies every action except `grant`. `grant` is authorization management, has no business-action implication, and only root identity may grant or revoke `grant` itself. Ordinary `grant` holders can manage non-`grant` actions within their manageable resource range.

## Structured Candidate

The machine-readable candidate lives next to this document:

```txt
docs/planning/short-term/2026-07-01-short-permission-resource-action-policy.candidate.json
```

It is retained as a registry-resource snapshot. The runtime catalog lives at:

```txt
packages/platform/permission-resource-policy.ts
```

The candidate can be checked for registered non-space resource coverage with:

```bash
node docs/planning/short-term/validate-permission-resource-action-policy.mjs
```

## Policy Shape

The runtime policy lives outside `packages/platform/module-registry.ts`, then references registry/resource docs. The registry owns route/resource/API contract facts; the policy owns supported actions, ancestor inheritance, explicit-only actions, and scoped support.

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
- Workflow, lifecycle, exchange, capability, confidentiality, and object-range actions stay explicit at the L2/capability resource unless the runtime policy declares inheritance.
- `grant` and `admin` are both explicit-only by default. `admin` remains business management; authorization management is the separate `grant` action.

## Resource Classification

Current resource/action facts are intentionally not duplicated here. Use:

- Runtime policy: `packages/platform/permission-resource-policy.ts`
- Human-facing matrix: `docs/engineering/security/permission-matrix.md`
- Machine snapshot: `docs/planning/short-term/2026-07-01-short-permission-resource-action-policy.candidate.json`

Runtime also derives `space.department`, `space.company`, `space.committee` and their child resources from `spaceRegistrations`; these projected `space.*` resources are not hand-written into the candidate JSON.

## Open Questions

- Should object-level resources such as Work projects eventually get scoped action policies rather than module-level only? Current Work semantics still require service-level object checks.
- How much of the historical business-space role vocabulary (`viewer/editor/delete/manager`) should remain after scoped action grants cover all active flows?

## Promotion Checklist

Before wiring this policy into business authorization:

- First-step permission action infrastructure is merged and stable. Done.
- Architecture chooses the runtime home. Done: `packages/platform/permission-resource-policy.ts`.
- Policy entries are tested for every registered resource key and capability. Done via `scripts/check/check-permission-actions.ts`.
- Permission matrix reads policy support instead of using legacy role proxy. Done.
- `docs/engineering/security/rbac.md` and `docs/engineering/security/permission-matrix.md` reflect the current action/grant split. Done.
