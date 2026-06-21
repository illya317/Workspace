# Reports Route Shell

`app/reports` is a Next.js route shell for the Work package.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/reports/page.tsx` |
| Report UI and client hooks | `packages/work/ui/reports/*` |
| Report services | `packages/work/server/reports.ts` |
| Shared period helpers | `packages/core/period` |
| Platform shell and auth | `packages/platform` |

## Rules

- Keep `app/reports/page.tsx` limited to authorization, shell composition, and mounting `WorkReportPage`.
- Do not add `components`, `hooks`, or `lib` under `app/reports`.
- Work report UI belongs in `packages/work/ui/reports`.
- Work report data access belongs in `packages/work/server`.
