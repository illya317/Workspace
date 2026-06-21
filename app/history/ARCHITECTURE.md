# History Route Shell

`app/history` is a Next.js route shell for the Work package.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/history/page.tsx` |
| History UI | `packages/work/ui/history/*` |
| EditHistory snapshot service | `packages/platform/server/history.ts` |

## Rules

- Keep `app/history/page.tsx` limited to authorization, shell composition, and mounting `WorkHistoryPage`.
- Do not add route-local components, hooks, or helpers under `app/history`.
- Work-facing history UI belongs in `packages/work/ui/history`.
