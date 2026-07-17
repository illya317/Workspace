# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Agent 没有独立 L1 管理页面；root admin 在这里维护全局智能体动作上限。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
