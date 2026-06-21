# Works Route Shell

`app/works` is a Next.js route shell for the Work package work-list feature.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/works/page.tsx` |
| Work list UI, hooks, and local types | `packages/work/ui/works/*` |
| Work list services | `packages/work/server/works.ts` |

## Rules

- Keep `app/works/page.tsx` limited to authorization, shell composition, and mounting `WorksClient`.
- Do not add route-local components, hooks, helper files, or types under `app/works`.
- Work list UI belongs in `packages/work/ui/works`.
