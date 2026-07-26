# Generated Docs

This directory primarily contains generated documentation artifacts. Do not hand-edit files whose table below names a generator; `api.md` is the explicit legacy-summary exception.

## Owner

Data owns schema/table/generated-docs facts. Operations owns generator runtime issues only when the generation command or CI/runtime behavior changes.

## Current Artifacts

| Artifact | Source / generator | Owner |
|---|---|---|
| `api.html` | `node --import tsx scripts/generate/generate-docs.ts`; canonical root `app/api/**` | Data / Architecture |
| `api.md` | Legacy handwritten API summary; the generator intentionally leaves an existing file unchanged | Architecture / Feature |
| `tables.md`, `tables.html` | `node --import tsx scripts/generate/generate-docs.ts`; `prisma/models/*.prisma` | Data |
| `action-contracts.md` | `npm run docs:action-contracts`; ActionContract registry | Architecture |
| `permission-actions.md` | `npm run docs:permission-actions`; action/resource/business registries | Architecture |

## Rules

- Change source data, Prisma schema, API contract source, or the generator script instead of editing output by hand.
- `api.md` is the only current exception: it identifies itself as a handwritten summary and is not overwritten by the generator. Treat `api.html` as the complete source-discovered route/method inventory. Its access badges come from the authoritative API contract plus explicit route wrappers; `未识别（查 API contract）` is deliberately not equivalent to public access.
- If generated output becomes stale, assign the fix to Data unless the failure is a script/runtime issue.
- If generator behavior changes, update `docs/OWNERS.md`, `docs/engineering/schema-governance.md`, or the relevant engineering doc in the same task.
