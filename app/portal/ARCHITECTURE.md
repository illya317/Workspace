# Portal Route Shell

`app/portal` is the authenticated entry route for the Platform portal.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and mount | `app/portal/page.tsx` |
| Portal UI | `packages/platform/ui/PortalClient.tsx` |
| Module registry | `packages/platform/module-registry.ts` |

## Rules

- Keep `app/portal/page.tsx` limited to login checks and mounting `PortalClient`.
- Do not add route-local components, hooks, or helpers under `app/portal`.
- Portal cards and module entry UI belong in `packages/platform/ui`.
