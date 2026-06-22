# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireRouteAccess("/settings/admin")`.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
