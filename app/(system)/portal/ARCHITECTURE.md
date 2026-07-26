# Portal Route Shell

`app/(system)/portal` is the authenticated entry route for the Platform portal.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and mount | `app/(system)/portal/page.tsx` |
| Portal UI | `packages/platform/ui/PortalClient.tsx` |
| User portal preferences | `packages/platform/portal-preferences.ts`, `packages/platform/ui/portal-preferences.ts` |
| Module registry | `packages/platform/module-registry.ts` |

## Rules

- Keep `app/(system)/portal/page.tsx` limited to login checks and mounting `PortalClient`.
- Do not add route-local components, hooks, or helpers under `app/(system)/portal`.
- Portal cards and module entry UI belong in `packages/platform/ui`.
- The portal renders up to 9 user-configured L1/L2 slots and up to 2 header shortcuts. Slot candidates and persisted slots must be derived from modules visible to the current user; inaccessible L1/L2 entries are not selectable and are dropped when preferences are loaded or saved.
