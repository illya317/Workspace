# Generated Docs

This directory contains generated documentation artifacts. Do not hand-edit generated Markdown or HTML output.

## Owner

Data owns schema/table/generated-docs facts. Operations owns generator runtime issues only when the generation command or CI/runtime behavior changes.

## Current Artifacts

| Artifact | Source / generator | Owner |
|---|---|---|
| `api.md`, `api.html` | API documentation generator | Data / Architecture |
| `tables.md`, `tables.html` | DB/table documentation generator | Data |

## Rules

- Change source data, Prisma schema, API contract source, or the generator script instead of editing output by hand.
- If generated output becomes stale, assign the fix to Data unless the failure is a script/runtime issue.
- If generator behavior changes, update `docs/OWNERS.md`, `docs/engineering/schema-governance.md`, or the relevant engineering doc in the same task.
