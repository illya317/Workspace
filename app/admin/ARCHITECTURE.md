# Admin Route Shell

`app/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
