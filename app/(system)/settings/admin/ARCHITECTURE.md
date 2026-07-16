# Admin Route Shell

`app/(system)/settings/admin/` is a Next.js route shell only.

- `page.tsx` authenticates with `requireAdminManageAccess()`; root users and resource-level grant/configure managers may enter, while individual admin APIs and permission writes remain server-authorized.
- Public route: `/settings/admin`.
- UI implementation lives in `packages/platform/ui/admin/`.
- Agent 全局动作上限、能力目录与聚焦授权矩阵的 canonical 管理入口在 `/agent/config`；Settings 不提供 Agent 专属写入口。员工、雇佣、部门和岗位事实仍由 HR 拥有。
- Permission/auth logic lives in `packages/platform/server/auth` and `packages/platform/server/rbac`.
- Do not add `components/`, `hooks/`, `lib/`, or client UI implementation under this route.
