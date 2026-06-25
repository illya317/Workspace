# Settings Route Shell

`app/(system)/settings` is a Next.js route shell for Platform settings.

## Ownership

| Concern | Location |
| --- | --- |
| Route auth and shell mount | `app/(system)/settings/**/page.tsx` |
| Settings UI | `packages/platform/ui/settings/*` |
| Platform auth | `packages/platform/server/auth` |
| Core UI registry display | `packages/core/ui/component-registry.ts` and `packages/core/showcase/UiComponentsShowcase.tsx`（mounted at `/settings/ui`）|

## Rules

- Keep `app/(system)/settings/**/page.tsx` limited to authentication, authorization, and mounting Platform settings pages.
- Do not add route-local components, hooks, or helper files under `app/(system)/settings`.
- Settings screens, modals, and governance UI belong in `packages/platform/ui/settings`.
