# Portal Route Shell

`app/(system)/portal` is the authenticated entry route for the Platform portal.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and mount | `app/(system)/portal/page.tsx` |
| Portal UI | `packages/platform/ui/PortalClient.tsx` |
| Module registry | `packages/platform/module-registry.ts` |

## Rules

- Keep `app/(system)/portal/page.tsx` limited to login checks and mounting `PortalClient`.
- Do not add route-local components, hooks, or helpers under `app/(system)/portal`.
- Portal cards and module entry UI belong in `packages/platform/ui`.
